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
    return <main className="vespoid-shell mx-auto max-w-6xl p-8 text-muted">Loading listing…</main>;
  }

  if (data === null) {
    return <main className="vespoid-shell mx-auto max-w-6xl p-8"><Link className="text-berry hover:text-berry" href="/jobs">← Jobs</Link><p className="mt-6 text-muted">Job not found.</p></main>;
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
      <Link className="text-sm text-berry hover:text-berry" href="/jobs">← Back to jobs</Link>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <article className="vespoid-panel vespoid-panel-featured vespoid-detail rounded-2xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="vespoid-eyebrow text-sm uppercase tracking-[0.25em]">{job.source}</p>
              <h1 className="vespoid-heading mt-2 text-3xl font-semibold">{job.title}</h1>
              <p className="mt-2 text-lg text-muted">{job.company}</p>
            </div>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="vespoid-button vespoid-external-link rounded-xl px-4 py-2 text-sm font-semibold">Open listing ↗</a>
          </div>

          <dl className="vespoid-inset mt-6 grid gap-4 rounded-xl border border-line p-4 md:grid-cols-3">
            <div><dt className="text-xs text-muted">Location</dt><dd>{job.location ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-muted">Remote</dt><dd>{job.remoteStatus ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-muted">Salary</dt><dd>{job.salaryRange ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-muted">Fit score</dt><dd>{job.fitScore ?? "Unknown"}</dd></div>
            <div><dt className="text-xs text-muted">Posted</dt><dd>{formatDate(job.postedAt)}</dd></div>
            <div><dt className="text-xs text-muted">Discovered</dt><dd>{formatDate(job.discoveredAt)}</dd></div>
            <div><dt className="text-xs text-muted">Availability</dt><dd className={job.availabilityStatus === "closed" ? "text-berry" : ""}>{availabilityLabel}</dd></div>
          </dl>

          {job.availabilityStatus === "closed" ? (
            <div className="mt-4 rounded-xl border border-line bg-lilac p-4 text-sm text-berry">
              This saved listing looks closed. Status is separate from your pipeline status, so it has not been archived automatically.
              {job.availabilityReason ? <span className="mt-1 block text-berry">Reason: {job.availabilityReason}</span> : null}
            </div>
          ) : null}

          {job.fitReasons && job.fitReasons.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {job.fitReasons.map((reason) => (
                <span key={reason} className="vespoid-tag rounded-xl border border-line px-3 py-1 text-xs text-ink">
                  {reason}
                </span>
              ))}
            </div>
          ) : null}

          {interviewProcess ? (
            <details className="mt-6 rounded-xl border border-line bg-lilac p-5 text-sm text-muted">
              <summary className="cursor-pointer select-none text-base font-semibold text-ink">
                Interview process prep · {interviewProcess.company} · confidence: {interviewProcess.confidence}
              </summary>
              <p className="mt-4 text-muted">{interviewProcess.summary}</p>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Likely stages</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.stages.map((stage) => <li key={stage}>{stage}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Prep focus</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.prepTips.map((tip) => <li key={tip}>{tip}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Technical signals</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {interviewProcess.technicalSignals.map((signal) => <li key={signal}>{signal}</li>)}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sources</h3>
                  <ul className="mt-3 space-y-2">
                    {interviewProcess.sources.map((source) => (
                      <li key={source.url}>
                        <a className="text-berry hover:text-berry" href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-muted">{interviewProcess.caveat}</p>
                </section>
              </div>
            </details>
          ) : null}

          <div className="vespoid-inset mt-6 rounded-xl border border-line p-5 text-sm leading-6 text-muted">
            <div className="whitespace-pre-wrap">{displayedDescription}</div>
            {canExpandDescription ? (
              <button
                type="button"
                onClick={() => setShowFullDescription((current) => !current)}
                className="vespoid-ghost mt-4 rounded-xl border border-line px-3 py-1 text-xs font-semibold text-ink hover:border-line hover:text-berry"
              >
                {showFullDescription ? "See less" : "See more"}
              </button>
            ) : null}
          </div>
        </article>

        <aside className="vespoid-panel flex flex-col gap-4 rounded-xl p-6">
          <div>
            <h2 className="text-lg font-semibold">Pipeline status</h2>
            <p className="mt-1 text-sm text-muted">Current: {application ? STATUS_LABELS[application.status] : "Unread"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
              <button key={status} data-status={status} aria-pressed={application?.status === status} disabled={saving} onClick={() => changeStatus(status)} className="vespoid-ghost vespoid-status rounded-xl px-3 py-2 text-sm disabled:opacity-50">
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="mt-2 text-sm font-medium text-muted" htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setDraftNotes(e.target.value)} className="vespoid-input min-h-40 rounded-xl p-3 text-sm outline-none" placeholder="Interview prep, follow-up notes, recruiter details…" />
          <button disabled={saving} onClick={saveNotes} className="vespoid-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save notes"}</button>
        </aside>
      </section>

      <section className="vespoid-panel rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Preview</h2>
          <a className="text-sm text-berry hover:text-berry" href={job.url} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
        </div>
        <iframe src={job.url} title={job.title} sandbox="allow-scripts" className="h-[640px] w-full rounded-xl border border-line bg-white" />
        <p className="mt-3 text-xs text-muted">Many job sites block iframe embedding. Use “Open in new tab” when the preview is blank.</p>
      </section>
    </main>
  );
}
