// Browser-only evaluation data contract. No production reads or writes.
export const LABELS = ["not_good_fit", "neutral", "good_fit"] as const;
export type Label = (typeof LABELS)[number];
export type ReviewAction = Label | "skip" | "undo";
export type ReviewRecord = { sample_id: string; title: string; company: string; location: string; salary: string; url: string; description: string; source: string; descriptionHash: string; fetched_at?: string };
export type Dataset = { schema_version: 1; name: string; sample_fingerprint: string; records: ReviewRecord[] };
type EventBase = { event_id: string; timestamp: string };
export type Decision = EventBase & ({ type: "label"; sample_id: string; label: Label } | { type: "skip"; sample_id: string });
export type ReviewEvent = Decision | (EventBase & { type: "undo"; target_event_id: string });
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function object(value: unknown): Record<string, unknown> { assert(value && typeof value === "object" && !Array.isArray(value), "Expected an object."); return value as Record<string, unknown>; }
export async function sha(text: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,"0")).join(""); }
export function httpUrl(value: string) { try { const u = new URL(value); return ["https:","http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }
export async function prepareDataset(value: unknown): Promise<Dataset> {
  const input = object(Array.isArray(value) ? { schema_version:1, name:"Imported public archive", records:value } : value);
  assert(input.schema_version === 1 && Array.isArray(input.records), "Dataset must have schema_version: 1 and records: [].");
  assert(input.records.length <= 1000, "Maximum 1,000 listings.");
  const ids = new Set(), urls = new Set(), hashes = new Set(), records: ReviewRecord[] = [];
  for (const value of input.records) {
    const row = object(value);
    for (const key of ["sample_id","title","company","url","description"]) assert(typeof row[key] === "string" && row[key].trim(), `Listing requires ${key}.`);
    const r = row as Record<string,string>;
    assert(httpUrl(r.url), "Listing URL must use http(s) without credentials.");
    assert(r.description.length <= 1000000, "Description exceeds 1 MB.");
    assert(!ids.has(r.sample_id), "Duplicate sample_id."); assert(!urls.has(r.url), "Duplicate source URL.");
    const descriptionHash = await sha(r.description);
    assert(!hashes.has(descriptionHash), "Duplicate description.");
    if (row.descriptionHash !== undefined) assert(row.descriptionHash === descriptionHash, "Description SHA-256 mismatch.");
    // Do not reorder these properties: legacy v1 fingerprints hash this exact JSON order.
    const clean: ReviewRecord = { sample_id:r.sample_id,title:r.title,company:r.company,location:"",salary:"",url:r.url,description:r.description,source:"Public archive; availability not verified",descriptionHash };
    for (const key of ["location","salary","source","fetched_at"] as const) if (row[key] !== undefined) { assert(typeof row[key] === "string", `${key} must be a string.`); clean[key] = row[key]; }
    records.push(clean); ids.add(r.sample_id); urls.add(r.url); hashes.add(descriptionHash);
  }
  const sample_fingerprint = await sha(JSON.stringify(records));
  if (input.sample_fingerprint !== undefined) assert(input.sample_fingerprint === sample_fingerprint, "Sample fingerprint mismatch.");
  return { schema_version:1, name:typeof input.name === "string" ? input.name : "Imported public archive", sample_fingerprint, records };
}
export function replay(records: ReviewRecord[], events: unknown) {
  assert(Array.isArray(events) && events.length <= 100000, "Invalid event history.");
  const stack: Decision[] = [], labels: Record<string,Decision> = Object.create(null), seen = new Set();
  for (const raw of events) {
    const event = object(raw);
    assert(typeof event.event_id === "string" && event.event_id && !seen.has(event.event_id), "Invalid or duplicate event ID.");
    assert(typeof event.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T/.test(event.timestamp) && Number.isFinite(Date.parse(event.timestamp)), "Invalid event timestamp.");
    seen.add(event.event_id);
    if (event.type === "label" || event.type === "skip") {
      if (event.type === "label") assert(LABELS.includes(event.label as Label), "Invalid human label.");
      else assert(event.label === undefined || event.label === null, "A skip cannot have a label.");
      assert(records[stack.length]?.sample_id === event.sample_id, "Decision is not the next listing.");
      const decision = event as Decision; stack.push(decision); labels[decision.sample_id] = decision;
    } else if (event.type === "undo") {
      assert(stack.length && stack[stack.length-1].event_id === event.target_event_id, "Undo must target the last active decision.");
      const last = stack.pop()!; delete labels[last.sample_id];
    } else throw new Error("Unknown event type.");
  }
  return { position:stack.length, stack, labels };
}
export function exportState(dataset: Dataset, events: ReviewEvent[]) {
  const state = replay(dataset.records,events);
  return { schema_version:2, kind:"vespoid-human-fit-labels", sample_fingerprint:dataset.sample_fingerprint, exported_at:new Date().toISOString(), dataset_name:dataset.name,
    labels:dataset.records.map(r => { const event=state.labels[r.sample_id]; return { sample_id:r.sample_id,source_url:r.url,description_sha256:r.descriptionHash,label:event?.type === "label" ? event.label : null,timestamp:event?.timestamp ?? null,status:event ? (event.type === "skip" ? "skipped" : "labeled") : "unlabeled" }; }), events:structuredClone(events) };
}
export function validateImport(dataset: Dataset, value: unknown): ReviewEvent[] {
  const input = object(value);
  assert((input.schema_version === 1 || input.schema_version === 2) && input.kind === "vespoid-human-fit-labels", "Not a supported label export.");
  assert(input.sample_fingerprint === dataset.sample_fingerprint, "Labels belong to a different sample or source-text version.");
  replay(dataset.records,input.events);
  const events = input.events as ReviewEvent[];
  if (input.schema_version === 1) assert(!events.some(e=>e.type === "skip"), "Legacy exports cannot contain skips.");
  const expected = exportState(dataset,events).labels.map(row => { if(input.schema_version === 2) return row; const { status, ...legacy } = row; void status; return legacy; });
  assert(JSON.stringify(expected) === JSON.stringify(input.labels), "Labels do not match chronological events.");
  return structuredClone(events);
}
export const storageKey = (dataset: Dataset) => `vespoid-review:v2:${dataset.sample_fingerprint}`;
export type StoragePort = Pick<Storage,"getItem"|"setItem">;
export type SavedState = { mode:"saved"|"memory"; lastStored:string|null; events:ReviewEvent[]; notice:string };
export function restoreSaved(storage: StoragePort, dataset: Dataset): SavedState {
  let raw: string|null = null;
  try { raw = storage.getItem(storageKey(dataset)); return { mode:"saved",lastStored:raw,events:raw === null ? [] : validateImport(dataset,JSON.parse(raw)),notice:"" }; }
  catch { return { mode:"memory",lastStored:raw,events:[],notice:"Saved work could not be read or validated. It has not been overwritten. Memory-only mode: export JSON before leaving; import a valid export to resume." }; }
}
export function storageConflict(state: SavedState): SavedState { return { ...state,mode:"memory",notice:"Another tab changed saved work. This tab is memory-only and will not overwrite it. Export JSON, then reload to reconcile." }; }
export function persistSaved(storage: StoragePort, dataset: Dataset, events: ReviewEvent[], previous: SavedState): SavedState {
  if (previous.mode === "memory") return { ...previous,events };
  try {
    if (storage.getItem(storageKey(dataset)) !== previous.lastStored) return storageConflict({ ...previous,events });
    const raw = JSON.stringify(exportState(dataset,events)); storage.setItem(storageKey(dataset),raw);
    if (storage.getItem(storageKey(dataset)) !== raw) return storageConflict({ ...previous,events });
    return { mode:"saved",lastStored:raw,events,notice:"" };
  } catch { return { ...previous,events,mode:"memory",notice:"Browser storage is unavailable or full. Memory-only mode: export JSON before closing or reloading." }; }
}
export function keyboardAction(event: { key:string; repeat?:boolean; ctrlKey?:boolean; altKey?:boolean; metaKey?:boolean; shiftKey?:boolean; isComposing?:boolean; editable?:boolean; inScope?:boolean }): ReviewAction|null {
  if(event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || event.editable || event.inScope === false) return null;
  return ({arrowleft:"not_good_fit",arrowup:"neutral",arrowright:"good_fit",arrowdown:"skip",z:"undo"} as Record<string,ReviewAction>)[event.key.toLowerCase()] ?? null;
}
