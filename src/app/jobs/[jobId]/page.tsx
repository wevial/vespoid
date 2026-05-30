"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { useCallback, useEffect, useState } from "react";
import { convexHttp } from "@/lib/convex-http";
import type { FunctionReturnType } from "convex/server";

type JobDetail = FunctionReturnType<typeof api.jobs.getJobWithApplication>;

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId as Id<"jobs">;
  const [data, setData] = useState<JobDetail>();
  const [draftNotes, setDraftNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setData(await convexHttp.query(api.jobs.getJobWithApplication, { jobId }));
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    convexHttp.query(api.jobs.getJobWithApplication, { jobId }).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (data === undefined) {
    return <main className="vespoid-shell mx-auto max-w-6xl p-8 text-fuchsia-100/62">Loading listing…</main>;
  }

  if (data === null) {
    return <main className="vespoid-shell mx-auto max-w-6xl p-8"><Link className="text-cyan-200 hover:text-fuchsia-200" href="/jobs">← Jobs</Link><p className="mt-6 text-fuchsia-100/62">Job not found.</p></main>;
  }

  const { job, application } = data;
  const notes = draftNotes ?? application?.notes ?? "";

  async function changeStatus(status: ApplicationStatus) {
    setSaving(true);
    try {
      await convexHttp.mutation(api.applications.setStatus, { jobId, status, notes: notes || undefined });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await convexHttp.mutation(api.applications.updateNotes, { jobId, notes });
      await refresh();
      setDraftNotes(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="vespoid-shell mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <Link className="text-sm text-cyan-200 hover:text-fuchsia-200" href="/jobs">← Back to jobs</Link>
      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <article className="neon-panel neon-panel-hot rounded-2xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="neon-eyebrow text-sm uppercase tracking-[0.25em]">{job.source}</p>
              <h1 className="neon-heading mt-2 text-3xl font-semibold">{job.title}</h1>
              <p className="mt-2 text-lg text-fuchsia-100/78">{job.company}</p>
            </div>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="neon-button rounded-full px-4 py-2 text-sm font-semibold">Open listing ↗</a>
          </div>

          <dl className="mt-6 grid gap-4 rounded-2xl border border-cyan-300/12 bg-black/24 p-4 md:grid-cols-3">
            <div><dt className="text-xs text-fuchsia-100/45">Location</dt><dd>{job.location ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-fuchsia-100/45">Remote</dt><dd>{job.remoteStatus ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-fuchsia-100/45">Salary</dt><dd>{job.salaryRange ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-fuchsia-100/45">Posted</dt><dd>{formatDate(job.postedAt)}</dd></div>
            <div><dt className="text-xs text-fuchsia-100/45">Discovered</dt><dd>{formatDate(job.discoveredAt)}</dd></div>
            <div><dt className="text-xs text-fuchsia-100/45">Last checked</dt><dd>{formatDate(job.lastCheckedAt)}</dd></div>
          </dl>

          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-cyan-300/12 bg-black/24 p-5 text-sm leading-6 text-fuchsia-100/78">
            {job.description ?? "No description captured."}
          </div>
        </article>

        <aside className="neon-panel flex flex-col gap-4 rounded-2xl p-6">
          <div>
            <h2 className="text-lg font-semibold">Pipeline status</h2>
            <p className="mt-1 text-sm text-fuchsia-100/62">Current: {application ? STATUS_LABELS[application.status] : "Unread"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
              <button key={status} disabled={saving} onClick={() => changeStatus(status)} className="neon-ghost rounded-xl px-3 py-2 text-sm disabled:opacity-50">
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="mt-2 text-sm font-medium text-fuchsia-100/78" htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setDraftNotes(e.target.value)} className="neon-input min-h-40 rounded-xl p-3 text-sm outline-none" placeholder="Interview prep, follow-up notes, recruiter details…" />
          <button disabled={saving} onClick={saveNotes} className="neon-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save notes"}</button>
        </aside>
      </section>

      <section className="neon-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Preview</h2>
          <a className="text-sm text-cyan-200 hover:text-fuchsia-200" href={job.url} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
        </div>
        <iframe src={job.url} title={job.title} sandbox="allow-scripts" className="h-[640px] w-full rounded-xl border border-cyan-300/12 bg-white" />
        <p className="mt-3 text-xs text-fuchsia-100/45">Many job sites block iframe embedding. Use “Open in new tab” when the preview is blank.</p>
      </section>
    </main>
  );
}
