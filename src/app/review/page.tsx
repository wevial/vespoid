"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { exportState, keyboardAction, persistSaved, prepareDataset, replay, restoreSaved, storageConflict, storageKey, validateImport, type Dataset, type ReviewAction, type ReviewEvent, type SavedState, type StoragePort } from "@/lib/review-core";
import styles from "./review.module.css";

type Session = { dataset: Dataset; saved: SavedState };
const browserStorage: StoragePort = { getItem: key => window.localStorage.getItem(key), setItem: (key,value) => window.localStorage.setItem(key,value) };
const actionNames: Record<ReviewAction,string> = { not_good_fit:"Not good fit",neutral:"Neutral",good_fit:"Good fit",skip:"Skipped",undo:"Last decision undone" };

export default function ReviewPage() {
  const [session,setSession] = useState<Session|null>(null);
  const current = useRef<Session|null>(null);
  const [error,setError] = useState("");
  const [status,setStatus] = useState("Loading the private review dataset…");
  const [busy,setBusy] = useState(false);
  const busyRef = useRef(false);
  const held = useRef(new Set<string>());
  const card = useRef<HTMLElement>(null);
  const reading = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const exportedEvents = useRef<string|null>(null);

  function publish(next: Session) { current.current=next;setSession(next); }

  useEffect(()=>{
    const controller=new AbortController(); let cancelled=false;
    async function load() {
      try {
        const response=await fetch("/api/review/dataset",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
        if(!response.ok) throw new Error(response.status===401 || response.status===403 ? "Sign in to access the private review dataset, then reload this page." : `Dataset request failed (${response.status}).`);
        const dataset=await prepareDataset(await response.json());
        if(cancelled)return;
        const restored=restoreSaved(browserStorage,dataset);
        // Also exercise storage now, so denied/quota failures are visible before labeling.
        const saved=persistSaved(browserStorage,dataset,restored.events,restored);
        const next={dataset,saved};current.current=next;setSession(next);
        setStatus(saved.events.length ? "Saved review and undo history restored." : "Ready. Choose a label or skip. These are evaluation labels only.");
      } catch(e) { if(!cancelled)setError(e instanceof Error ? e.message : "Could not load the dataset."); }
    }
    void load();
    function onStorage(e: StorageEvent) { const s=current.current;if(s && (e.key===storageKey(s.dataset)||e.key===null) && e.newValue!==s.saved.lastStored) { const next={...s,saved:storageConflict(s.saved)};current.current=next;setSession(next); } }
    function onKeyUp(e: globalThis.KeyboardEvent) { held.current.delete(e.key.toLowerCase()); }
    function clearHeld() { held.current.clear(); }
    function onUnload(e: BeforeUnloadEvent) { const s=current.current;if(s?.saved.mode==="memory" && s.saved.events.length && exportedEvents.current!==JSON.stringify(s.saved.events)) {e.preventDefault();e.returnValue="Export JSON before leaving.";} }
    function onNavigate(e: MouseEvent) {
      const s=current.current, link=e.target instanceof Element ? e.target.closest("a[href]") : null;
      if(!(link instanceof HTMLAnchorElement)||link.target==="_blank"||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
      if(s?.saved.mode==="memory" && s.saved.events.length && exportedEvents.current!==JSON.stringify(s.saved.events) && !window.confirm("This review is memory-only. Export JSON before leaving to keep your decisions. Leave without exporting?")) {e.preventDefault();e.stopPropagation();}
    }
    document.addEventListener("click",onNavigate,true);
    window.addEventListener("storage",onStorage);window.addEventListener("keyup",onKeyUp);window.addEventListener("blur",clearHeld);window.addEventListener("beforeunload",onUnload);
    return ()=>{cancelled=true;controller.abort();document.removeEventListener("click",onNavigate,true);window.removeEventListener("storage",onStorage);window.removeEventListener("keyup",onKeyUp);window.removeEventListener("blur",clearHeld);window.removeEventListener("beforeunload",onUnload);};
  },[]);

  const dataset=session?.dataset;
  const state=session ? replay(session.dataset.records,session.saved.events) : null;
  const row=dataset && state ? dataset.records[state.position] : undefined;
  const position=state?.position ?? 0;
  useEffect(()=>{ if(dataset) { if(reading.current)reading.current.scrollTop=0;card.current?.focus({preventScroll:true}); } },[dataset,position]);

  // Web Locks serialize same-origin tab writes; the pure storage adapter also checks
  // the last observed bytes, and permanently fails closed on conflicts or corruption.
  async function save(events: ReviewEvent[]) {
    const run=()=>{const s=current.current;if(s)publish({...s,saved:persistSaved(browserStorage,s.dataset,events,s.saved)});};
    if(navigator.locks) await navigator.locks.request(storageKey(current.current!.dataset),run);else run();
  }
  async function act(action: ReviewAction) {
    const s=current.current;if(!s || busyRef.current)return;
    const progress=replay(s.dataset.records,s.saved.events), nextRow=s.dataset.records[progress.position], last=progress.stack.at(-1);
    if(action==="undo" ? !last : !nextRow)return;
    busyRef.current=true;setBusy(true);
    try {
      const base={event_id:crypto.randomUUID(),timestamp:new Date().toISOString()};
      const event: ReviewEvent=action==="undo" ? {...base,type:"undo",target_event_id:last!.event_id} : action==="skip" ? {...base,type:"skip",sample_id:nextRow.sample_id} : {...base,type:"label",sample_id:nextRow.sample_id,label:action};
      await save([...s.saved.events,event]);setStatus(`${actionNames[action]}.`);setError("");
      card.current?.focus({preventScroll:true});
    } catch(e) {setError(e instanceof Error ? e.message : "Could not record decision.");}
    finally {busyRef.current=false;setBusy(false);}
  }
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const el=e.target instanceof Element ? e.target : null;
    const editable=!!el?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog,[role="dialog"]');
    const action=keyboardAction({key:e.key,repeat:e.repeat,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,shiftKey:e.shiftKey,isComposing:e.nativeEvent.isComposing||e.keyCode===229,editable,inScope:!!el && e.currentTarget.contains(el)});
    if(!action)return;
    e.preventDefault();const key=e.key.toLowerCase();if(held.current.has(key))return;held.current.add(key);void act(action);
  }
  function download() {
    const s=current.current;if(!s)return;
    const blob=new Blob([JSON.stringify(exportState(s.dataset,s.saved.events),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`human-fit-labels-${s.dataset.sample_fingerprint.slice(0,12)}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    exportedEvents.current=JSON.stringify(s.saved.events);setStatus("JSON export downloaded. It contains labels, skips, source hashes, and undo history.");
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];e.target.value="";const s=current.current;if(!file||!s||busyRef.current)return;
    busyRef.current=true;setBusy(true);
    try {
      if(file.size>15000000)throw new Error("File exceeds 15 MB.");
      const next=validateImport(s.dataset,JSON.parse(await file.text()));
      if(!window.confirm("Replace this tab’s current review with the imported labels and undo history? Export JSON first if you need to keep the current work. Cancel keeps it unchanged."))return;
      await save(next);setError("");setStatus("Validated labels and undo history imported.");card.current?.focus({preventScroll:true});
    } catch(err) {setError(`Labels not imported: ${err instanceof Error ? err.message : "Invalid file."}`);}
    finally {busyRef.current=false;setBusy(false);}
  }

  const skipped=state?.stack.filter(e=>e.type==="skip").length ?? 0;
  return <main className={styles.page} onKeyDown={onKeyDown}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div><h1>Review</h1><p>Private evaluation · labels stay in this browser</p></div>
        <div className={styles.tools}>
          <button type="button" onClick={()=>upload.current?.click()} disabled={!session||busy}>Import JSON</button>
          <button type="button" onClick={download} disabled={!session||busy}>Export JSON</button>
          <input ref={upload} type="file" accept="application/json,.json" aria-label="Import review JSON" className={styles.file} onChange={importFile} />
        </div>
      </header>
      {error && <div className={styles.error} role="alert">{error}{!session && <button type="button" onClick={()=>window.location.reload()}>Reload</button>}</div>}
      {session?.saved.mode==="memory" && <div className={styles.warning} role="alert"><strong>Memory-only — export before leaving.</strong> {session.saved.notice}</div>}
      {!dataset || !state ? <p className={styles.loading} role="status">{error ? "Dataset not loaded. No labels have been changed." : status}</p> : <>
        <section className={styles.progress} aria-label="Review progress">
          <div><strong>{position} / {dataset.records.length} reviewed</strong><span>{position-skipped} labeled · {skipped} skipped</span></div>
          <progress max={dataset.records.length||1} value={position} aria-label={`${position} of ${dataset.records.length} reviewed`} />
          <p>{dataset.name} · {session.saved.mode==="saved" ? "Saved locally" : "Not saved to browser"}</p>
        </section>
        <article ref={card} tabIndex={0} className={styles.card} aria-label={row ? `Listing ${position+1} of ${dataset.records.length}` : "Review complete"}>
          <div className={styles.cardBar}><span>{row ? `Listing ${position+1} of ${dataset.records.length}` : "Review complete"}</span><span>Full stored text</span></div>
          {row ? <>
            <div className={styles.summary}><p className={styles.company}>{row.company}</p><h2>{row.title}</h2><div className={styles.metadata}><span>{row.location||"Location not in archive"}</span><span>{row.salary||"Salary: see source text"}</span></div><a href={row.url} target="_blank" rel="noopener noreferrer">Open source listing ↗</a></div>
            <div ref={reading} className={styles.reading} tabIndex={0} aria-label="Full stored description"><div className={styles.description}>{row.description}</div><footer className={styles.provenance}><p>{row.source}{row.fetched_at ? ` · captured ${row.fetched_at}` : ""}</p><p>Original completeness and current availability not verified.</p><p>Source ID: {row.sample_id}</p><p>Description SHA-256: {row.descriptionHash}</p></footer></div>
          </> : <div className={styles.complete}><h2>{dataset.records.length ? "All listings reviewed" : "No listings in this dataset"}</h2><p>{position-skipped} labels and {skipped} skips. Export your review to keep or share it.</p><p>Press Z or choose Undo to revisit the last decision, including a skip.</p><button type="button" onClick={download}>Export JSON</button></div>}
        </article>
        <section className={styles.controls} aria-label="Review controls">
          <button type="button" className={styles.negative} disabled={!row||busy} onClick={()=>void act("not_good_fit")}><kbd>←</kbd><span>Not good fit</span></button>
          <button type="button" className={styles.neutral} disabled={!row||busy} onClick={()=>void act("neutral")}><kbd>↑</kbd><span>Neutral</span></button>
          <button type="button" className={styles.positive} disabled={!row||busy} onClick={()=>void act("good_fit")}><kbd>→</kbd><span>Good fit</span></button>
          <button type="button" disabled={!row||busy} onClick={()=>void act("skip")}><kbd>↓</kbd><span>Skip / can’t judge</span></button>
          <button type="button" disabled={!state.stack.length||busy} onClick={()=>void act("undo")}><kbd>Z</kbd><span>Undo</span></button>
        </section>
        <p className={styles.hint}>Focus the review card to use arrow keys. ↓ skips without assigning a label; Z undoes the last decision. No production job data is changed.</p>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
      </>}
    </div>
  </main>;
}
