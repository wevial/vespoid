"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { useCallback, useEffect, useState } from "react";
import { convexHttp } from "@/lib/convex-http";
import { formatDateLabel } from "@/lib/date-format";
import { descriptionNeedsExpansion, getCollapsedDescription } from "@/lib/job-description-display";
import { getInterviewProcessForCompany } from "@/lib/job-interview-process";
import type { FunctionReturnType } from "convex/server";

type JobDetail = FunctionReturnType<typeof api.jobs.getJobWithApplication>;

function formatDate(value?: string) {
  return formatDateLabel(value, { dateStyle: "medium" });
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId as Id<"jobs">;
  const [data, setData] = useState<JobDetail>();
  const [draftNotes, setDraftNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const refresh = useCallback(async () => {
    setData(await convexHttp.query(api.jobs.getJobWithApplication, { jobId }));
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      setShowFullDescription(false);
    });
    convexHttp.query(api.jobs.getJobWithApplication, { jobId }).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!data?.application) return;
    if (!["saved", "applied", "screen", "interview", "offer"].includes(data.application.status)) return;
    if (data.job.availabilityStatus === "closed") return;

    const checkedAt = data.job.availabilityCheckedAt ? Date.parse(data.job.availabilityCheckedAt) : 0;
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (checkedAt && Date.now() - checkedAt < oneDayMs) return;

    let cancelled = false;
    void Promise.resolve().then(async () => {
      setCheckingAvailability(true);
      try {
        await fetch("/api/jobs/check-availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        if (!cancelled) await refresh();
      } catch {
        // Best-effort availability checks should never block reading the job.
      } finally {
        if (!cancelled) setCheckingAvailability(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data, jobId, refresh]);

  if (data === undefined) {
    return <main className="vespoid-shell mx-auto max-w-6xl p-8 text-blue-50/62">Loading listing…</main>;
  }

  if (data === null) {
    return <main className="vespoid-shell mx-auto max-w-6xl p-8"><Link className="text-blue-300 hover:text-orange-200" href="/jobs">← Jobs</Link><p className="mt-6 text-blue-50/62">Job not found.</p></main>;
  }

  const { job, application } = data;
  const notes = draftNotes ?? application?.notes ?? "";
  const interviewProcess = getInterviewProcessForCompany(job.company);
  const canExpandDescription = descriptionNeedsExpansion(job.description);
  const displayedDescription = showFullDescription ? (job.description ?? "No description captured.") : getCollapsedDescription(job.description);
  const availabilityLabel = checkingAvailability
    ? "Checking availability…"
    : job.availabilityStatus === "closed"
      ? `Likely closed${job.availabilityCheckedAt ? ` · checked ${formatDate(job.availabilityCheckedAt)}` : ""}`
      : job.availabilityStatus === "open"
        ? `Open${job.availabilityCheckedAt ? ` · checked ${formatDate(job.availabilityCheckedAt)}` : ""}`
        : job.availabilityCheckedAt
          ? `Availability unknown · checked ${formatDate(job.availabilityCheckedAt)}`
          : "Availability not checked";

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
      <Link className="text-sm text-blue-300 hover:text-orange-200" href="/jobs">← Back to jobs</Link>
      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <article className="neon-panel neon-panel-hot rounded-[2px] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="neon-eyebrow text-sm uppercase tracking-[0.25em]">{job.source}</p>
              <h1 className="neon-heading mt-2 text-3xl font-semibold">{job.title}</h1>
              <p className="mt-2 text-lg text-blue-50/78">{job.company}</p>
            </div>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="neon-button rounded-[2px] px-4 py-2 text-sm font-semibold">Open listing ↗</a>
          </div>

          <dl className="mt-6 grid gap-4 rounded-[2px] border border-blue-300/16 bg-black/24 p-4 md:grid-cols-3">
            <div><dt className="text-xs text-blue-50/45">Location</dt><dd>{job.location ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Remote</dt><dd>{job.remoteStatus ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Salary</dt><dd>{job.salaryRange ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Fit score</dt><dd>{job.fitScore ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Posted</dt><dd>{formatDate(job.postedAt)}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Discovered</dt><dd>{formatDate(job.discoveredAt)}</dd></div>
            <div><dt className="text-xs text-blue-50/45">Availability</dt><dd className={job.availabilityStatus === "closed" ? "text-orange-200" : ""}>{availabilityLabel}</dd></div>
          </dl>

          {job.availabilityStatus === "closed" ? (
            <div className="mt-4 rounded-[2px] border border-orange-300/30 bg-orange-500/10 p-4 text-sm text-orange-100">
              This saved listing looks closed. Status is separate from your pipeline status, so it has not been archived automatically.
              {job.availabilityReason ? <span className="mt-1 block text-orange-100/75">Reason: {job.availabilityReason}</span> : null}
            </div>
          ) : null}

          {job.fitReasons && job.fitReasons.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {job.fitReasons.map((reason) => (
                <span key={reason} className="rounded-[2px] border border-blue-300/24 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                  {reason}
                </span>
              ))}
            </div>
          ) : null}

          {interviewProcess ? (
            <details className="mt-6 rounded-[2px] border border-orange-300/18 bg-orange-500/8 p-5 text-sm text-blue-50/78">
              <summary className="cursor-pointer select-none text-base font-semibold text-slate-50">
                Interview process prep · {interviewProcess.company} · confidence: {interviewProcess.confidence}
              </summary>
              <p className="mt-4 text-blue-50/72">{interviewProcess.summary}</p>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/70">Likely stages</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.stages.map((stage) => <li key={stage}>{stage}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/70">Prep focus</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.prepTips.map((tip) => <li key={tip}>{tip}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/70">Technical signals</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.technicalSignals.map((signal) => <li key={signal}>{signal}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/70">Sources</h3>
                  <ul className="mt-3 space-y-2">
                    {interviewProcess.sources.map((source) => (
                      <li key={source.url}>
                        <a className="text-blue-300 hover:text-orange-200" href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-blue-50/52">{interviewProcess.caveat}</p>
                </section>
              </div>
            </details>
          ) : null}

          <div className="mt-6 rounded-[2px] border border-blue-300/16 bg-black/24 p-5 text-sm leading-6 text-blue-50/78">
            <div className="whitespace-pre-wrap">{displayedDescription}</div>
            {canExpandDescription ? (
              <button
                type="button"
                onClick={() => setShowFullDescription((current) => !current)}
                className="mt-4 rounded-[2px] border border-blue-300/34 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-100 hover:border-orange-200/60 hover:text-orange-100"
              >
                {showFullDescription ? "See less" : "See more"}
              </button>
            ) : null}
          </div>
        </article>

        <aside className="neon-panel flex flex-col gap-4 rounded-[2px] p-6">
          <div>
            <h2 className="text-lg font-semibold">Pipeline status</h2>
            <p className="mt-1 text-sm text-blue-50/62">Current: {application ? STATUS_LABELS[application.status] : "Unread"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
              <button key={status} disabled={saving} onClick={() => changeStatus(status)} className="neon-ghost rounded-[2px] px-3 py-2 text-sm disabled:opacity-50">
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="mt-2 text-sm font-medium text-blue-50/78" htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setDraftNotes(e.target.value)} className="neon-input min-h-40 rounded-[2px] p-3 text-sm outline-none" placeholder="Interview prep, follow-up notes, recruiter details…" />
          <button disabled={saving} onClick={saveNotes} className="neon-button rounded-[2px] px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save notes"}</button>
        </aside>
      </section>

      <section className="neon-panel rounded-[2px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Preview</h2>
          <a className="text-sm text-blue-300 hover:text-orange-200" href={job.url} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
        </div>
        <iframe src={job.url} title={job.title} sandbox="allow-scripts" className="h-[640px] w-full rounded-[2px] border border-blue-300/16 bg-white" />
        <p className="mt-3 text-xs text-blue-50/45">Many job sites block iframe embedding. Use “Open in new tab” when the preview is blank.</p>
      </section>
    </main>
  );
}
