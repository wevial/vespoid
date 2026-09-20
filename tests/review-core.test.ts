import { describe, expect, test } from "bun:test";
import { prepareDataset, replay, exportState, validateImport, storageKey, restoreSaved, persistSaved, keyboardAction, type ReviewEvent } from "../src/lib/review-core";

const rows = ["a", "b", "c"].map((id) => ({ sample_id: id, title: "Engineer", company: "Example", url: `https://example.com/${id}`, description: `Full source ${id}`, location: "Remote", source: "Archive" }));
const time = "2026-09-20T12:00:00.000Z";
const label: ReviewEvent = { event_id: "1", type: "label", sample_id: "a", label: "neutral", timestamp: time };
const skip: ReviewEvent = { event_id: "2", type: "skip", sample_id: "b", timestamp: time };

describe("review chronology and compatibility", () => {
  test("preserves legacy byte order and imports v1 labels with undo", async () => {
    const d = await prepareDataset({ schema_version: 1, records: rows });
    const legacyRecords = await Promise.all(rows.map(async r => ({ sample_id:r.sample_id,title:r.title,company:r.company,location:r.location,salary:"",url:r.url,description:r.description,source:r.source,descriptionHash:await Bun.CryptoHasher.hash("sha256",r.description,"hex") })));
    expect(d.sample_fingerprint).toBe(Bun.CryptoHasher.hash("sha256", JSON.stringify(legacyRecords), "hex"));
    const events: ReviewEvent[] = [label, { event_id:"u",type:"undo",target_event_id:"1",timestamp:time }, { ...label,event_id:"3",label:"good_fit" }];
    const old = { ...exportState(d,events), schema_version:1, labels: exportState(d,events).labels.map(({ status, ...rest }) => { void status; return rest; }) };
    expect(validateImport(d,old)).toEqual(events);
    expect(replay(d.records,validateImport(d,old)).position).toBe(1);
  });
  test("distinguishes neutral, skipped, unlabeled and undoes skips and completion", async () => {
    const d=await prepareDataset({schema_version:1,records:rows});
    const out=exportState(d,[label,skip]);
    expect(out.schema_version).toBe(2);
    expect(out.labels.map(x=>[x.status,x.label])).toEqual([["labeled","neutral"],["skipped",null],["unlabeled",null]]);
    expect(validateImport(d,out)).toEqual([label,skip]);
    const complete: ReviewEvent[]=[label,skip,{...skip,event_id:"3",sample_id:"c"}];
    expect(replay(d.records,complete).position).toBe(3);
    complete.push({event_id:"u3",type:"undo",target_event_id:"3",timestamp:time},{event_id:"u2",type:"undo",target_event_id:"2",timestamp:time});
    expect(replay(d.records,complete).position).toBe(1);
    expect(()=>replay(d.records,[skip])).toThrow();
    expect(()=>validateImport(d,{...out,sample_fingerprint:"wrong"})).toThrow();
    expect(()=>validateImport(d,{...out,labels:out.labels.map(x=>({...x,status:"unlabeled"}))})).toThrow();
    expect(()=>validateImport(d,{...out,schema_version:1})).toThrow();
  });
});

describe("local safety and keyboard guards",()=>{
  test("corrupt, conflicting and unavailable storage never silently overwrites",async()=>{
    const d=await prepareDataset({schema_version:1,records:rows});
    let value:string|null="corrupt"; let writes=0;
    const storage={getItem:()=>value,setItem:(_k:string,v:string)=>{writes++;value=v;}};
    const restored=restoreSaved(storage,d);
    expect(restored.mode).toBe("memory");
    expect(persistSaved(storage,d,[label],restored).mode).toBe("memory");
    expect(writes).toBe(0);
    value=null;const clean=restoreSaved(storage,d);value="another tab";
    expect(persistSaved(storage,d,[label],clean).mode).toBe("memory");expect(writes).toBe(0);
    value=null;const ready=restoreSaved(storage,d);const saved=persistSaved(storage,d,[label,skip],ready);
    expect(saved.mode).toBe("saved");expect(restoreSaved(storage,d).events).toEqual([label,skip]);
    expect(storageKey(d)).toContain(d.sample_fingerprint);
    expect(storageKey(d)).not.toBe("vespoid-human-fit-labeler:v1");
    expect(restoreSaved({getItem:()=>{throw new Error("denied");},setItem:()=>{}},d).mode).toBe("memory");
  });
  test("fails closed on tampered source text, duplicate IDs and invalid chronology",async()=>{
    const d=await prepareDataset({schema_version:1,records:rows});
    await expect(prepareDataset({...d,records:d.records.map((r,i)=>i ? r : {...r,description:"changed"})})).rejects.toThrow("SHA-256");
    await expect(prepareDataset({schema_version:1,records:[rows[0],rows[0]]})).rejects.toThrow("Duplicate");
    expect(()=>replay(d.records,[label,{...skip,event_id:"1"}])).toThrow("duplicate");
    expect(()=>replay(d.records,[{...label,timestamp:"invalid"}])).toThrow("timestamp");
    expect(()=>replay(d.records,[label,{event_id:"undo",type:"undo",target_event_id:"wrong",timestamp:time}])).toThrow("last active");
    const out=exportState(d,[label]);out.labels[0].label="good_fit";
    expect(()=>validateImport(d,out)).toThrow("chronological");
    const quota={getItem:()=>null,setItem:()=>{throw new Error("QuotaExceededError");}};
    const saved=persistSaved(quota,d,[label],restoreSaved(quota,d));
    expect(saved.mode).toBe("memory");expect(saved.events).toEqual([label]);
  });
  test("guards editable, modifier, repeat, composition and outside focus",()=>{
    expect(keyboardAction({key:"ArrowDown"})).toBe("skip");
    expect(keyboardAction({key:"ArrowLeft"})).toBe("not_good_fit");
    expect(keyboardAction({key:"ArrowUp"})).toBe("neutral");
    expect(keyboardAction({key:"ArrowRight"})).toBe("good_fit");
    expect(keyboardAction({key:"Z"})).toBe("undo");
    for(const guard of [{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{isComposing:true},{editable:true},{inScope:false}]) expect(keyboardAction({key:"ArrowRight",...guard})).toBeNull();
  });
});
