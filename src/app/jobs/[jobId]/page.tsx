"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { useState } from "react";

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId as Id<"jobs">;
  const data = useQuery(api.jobs.getJobWithApplication, { jobId });
  const setStatus = useMutation(api.applications.setStatus);
  const updateNotes = useMutation(api.applications.updateNotes);
  const [draftNotes, setDraftNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (data === undefined) {
    return <main className="mx-auto max-w-6xl p-8 text-slate-400">Loading listing…</main>;
  }

  if (data === null) {
    return <main className="mx-auto max-w-6xl p-8"><Link className="text-blue-300" href="/jobs">← Jobs</Link><p className="mt-6 text-slate-400">Job not found.</p></main>;
  }

  const { job, application } = data;
  const notes = draftNotes ?? application?.notes ?? "";

  async function changeStatus(status: ApplicationStatus) {
    setSaving(true);
    try {
      await setStatus({ jobId, status, notes: notes || undefined });
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await updateNotes({ jobId, notes });
      setDraftNotes(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <Link className="text-sm text-blue-300 hover:text-blue-200" href="/jobs">← Back to jobs</Link>
      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-blue-300">{job.source}</p>
              <h1 className="mt-2 text-3xl font-semibold">{job.title}</h1>
              <p className="mt-2 text-lg text-slate-300">{job.company}</p>
            </div>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400">Open listing ↗</a>
          </div>

          <dl className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:grid-cols-3">
            <div><dt className="text-xs text-slate-500">Location</dt><dd>{job.location ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-slate-500">Remote</dt><dd>{job.remoteStatus ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-slate-500">Salary</dt><dd>{job.salaryRange ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-slate-500">Posted</dt><dd>{formatDate(job.postedAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Discovered</dt><dd>{formatDate(job.discoveredAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Last checked</dt><dd>{formatDate(job.lastCheckedAt)}</dd></div>
          </dl>

          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-sm leading-6 text-slate-300">
            {job.description ?? "No description captured."}
          </div>
        </article>

        <aside className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Pipeline status</h2>
            <p className="mt-1 text-sm text-slate-400">Current: {application ? STATUS_LABELS[application.status] : "Unread"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
              <button key={status} disabled={saving} onClick={() => changeStatus(status)} className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:border-blue-400 disabled:opacity-50">
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="mt-2 text-sm font-medium text-slate-300" htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setDraftNotes(e.target.value)} className="min-h-40 rounded-xl border border-white/10 bg-slate-950 p-3 text-sm outline-none focus:border-blue-400" placeholder="Interview prep, follow-up notes, recruiter details…" />
          <button disabled={saving} onClick={saveNotes} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50">{saving ? "Saving…" : "Save notes"}</button>
        </aside>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Preview</h2>
          <a className="text-sm text-blue-300 hover:text-blue-200" href={job.url} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
        </div>
        <iframe src={job.url} title={job.title} sandbox="allow-scripts" className="h-[640px] w-full rounded-xl border border-white/10 bg-white" />
        <p className="mt-3 text-xs text-slate-500">Many job sites block iframe embedding. Use “Open in new tab” when the preview is blank.</p>
      </section>
    </main>
  );
}
