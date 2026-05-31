"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { SOURCE_LABELS, STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { convexHttp } from "@/lib/convex-http";
import { formatDateLabel } from "@/lib/date-format";
import { sortJobs, type JobSortOption } from "@/lib/job-sort";
import { filterJobsByArea, type JobAreaFilter } from "@/lib/job-area";
import { DEFAULT_JOB_LIST_FILTERS, jobListFiltersFromSearchParams, jobListFiltersToSearchParams } from "@/lib/job-list-query";
import { buildJobListScrollKey, parseSavedScrollY } from "@/lib/job-list-scroll";
import { isQuickActionActive, QUICK_TRIAGE_ACTIONS, type QuickTriageStatus } from "@/lib/job-quick-actions";
import { nextPreviewJobId, selectedPreviewJob } from "@/lib/job-preview-panel";
import type { FunctionReturnType } from "convex/server";

type JobList = FunctionReturnType<typeof api.jobs.listJobs>;

function formatDate(value?: string) {
  return formatDateLabel(value, { month: "short", day: "numeric", year: "numeric" });
}

function formatSalaryPreview(value?: string) {
  if (!value) return "Unknown";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}

const FILTER_CHANGE_EVENT = "vespoid:job-list-filter-change";

function subscribeToUrlFilterChanges(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(FILTER_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(FILTER_CHANGE_EVENT, callback);
  };
}

function getUrlSearchSnapshot() {
  return window.location.search;
}

function getServerUrlSearchSnapshot() {
  return "";
}

export default function JobsPage() {
  const urlSearch = useSyncExternalStore(subscribeToUrlFilterChanges, getUrlSearchSnapshot, getServerUrlSearchSnapshot);
  const filters = useMemo(() => jobListFiltersFromSearchParams(new URLSearchParams(urlSearch)), [urlSearch]);
  const { source, status, remote, search, sort, area } = filters;

  const setFilter = useCallback((patch: Partial<typeof DEFAULT_JOB_LIST_FILTERS>) => {
    const nextFilters = { ...filters, ...patch };
    const params = jobListFiltersToSearchParams(nextFilters);
    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
    window.dispatchEvent(new Event(FILTER_CHANGE_EVENT));
  }, [filters]);

  const scrollStorageKey = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return buildJobListScrollKey(window.location.pathname, urlSearch);
  }, [urlSearch]);

  const rememberScrollPosition = useCallback(() => {
    if (!scrollStorageKey) return;
    window.sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
  }, [scrollStorageKey]);

  const args = useMemo(
    () => ({
      isActive: true,
      ...(source ? { source } : {}),
      ...(status ? { status } : {}),
      ...(remote ? { remoteStatus: remote } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [source, status, remote, search],
  );
  const [jobs, setJobs] = useState<JobList>();
  const [pendingQuickAction, setPendingQuickAction] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | undefined>();
  const sortedJobs = useMemo(() => (jobs ? sortJobs(filterJobsByArea(jobs, area), sort) : undefined), [jobs, area, sort]);
  const previewJob = useMemo(() => selectedPreviewJob(sortedJobs, previewJobId), [sortedJobs, previewJobId]);

  const refreshJobs = useCallback(async () => {
    setJobs(await convexHttp.query(api.jobs.listJobs, args));
  }, [args]);

  useEffect(() => {
    let cancelled = false;
    convexHttp.query(api.jobs.listJobs, args).then((result) => {
      if (!cancelled) setJobs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [args]);

  const setQuickStatus = useCallback(async (jobId: JobList[number]["_id"], status: QuickTriageStatus) => {
    const pendingKey = `${jobId}:${status}`;
    setPendingQuickAction(pendingKey);
    try {
      await convexHttp.mutation(api.applications.setStatus, { jobId, status });
      await refreshJobs();
    } finally {
      setPendingQuickAction(null);
    }
  }, [refreshJobs]);

  const togglePreview = useCallback((jobId: string) => {
    setPreviewJobId((current) => nextPreviewJobId(current, jobId));
  }, []);


  useEffect(() => {
    if (!scrollStorageKey || jobs === undefined) return;
    const savedScrollY = parseSavedScrollY(window.sessionStorage.getItem(scrollStorageKey));
    if (savedScrollY === undefined) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [jobs, scrollStorageKey]);

  return (
    <main className="vespoid-shell mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link className="text-sm text-cyan-200 hover:text-fuchsia-200" href="/">← Dashboard</Link>
          <h1 className="neon-heading mt-2 text-3xl font-semibold">Job listings</h1>
          <p className="mt-2 text-fuchsia-100/68">Filter active jobs by source, status, remote text, or search.</p>
        </div>
      </header>

      <section className="neon-panel grid gap-3 rounded-2xl p-4 md:grid-cols-6">
        <input value={search} onChange={(e) => setFilter({ search: e.target.value })} placeholder="Search title/company/description" className="neon-input rounded-xl px-3 py-2 text-sm outline-none" />
        <select value={source} onChange={(e) => setFilter({ source: e.target.value as typeof source })} className="neon-input rounded-xl px-3 py-2 text-sm outline-none">
          <option value="">All sources</option>
          <option value="hn">HN</option>
          <option value="yc">YC</option>
          <option value="company_board">Company boards</option>
          <option value="city_board">City boards</option>
          <option value="wellfound">Wellfound</option>
        </select>
        <select value={status} onChange={(e) => setFilter({ status: e.target.value as typeof status })} className="neon-input rounded-xl px-3 py-2 text-sm outline-none">
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
        </select>
        <select value={area} onChange={(e) => setFilter({ area: e.target.value as JobAreaFilter })} className="neon-input rounded-xl px-3 py-2 text-sm outline-none" aria-label="Filter by area">
          <option value="all">Area: all</option>
          <option value="remote">Area: remote</option>
          <option value="sf-bay">Area: SF Bay</option>
          <option value="seattle">Area: Seattle</option>
          <option value="denver-boulder">Area: Denver/Boulder</option>
          <option value="spain">Area: Spain maybe</option>
        </select>
        <input value={remote} onChange={(e) => setFilter({ remote: e.target.value })} placeholder="remote / hybrid / onsite" className="neon-input rounded-xl px-3 py-2 text-sm outline-none" />
        <select value={sort} onChange={(e) => setFilter({ sort: e.target.value as JobSortOption })} className="neon-input rounded-xl px-3 py-2 text-sm outline-none" aria-label="Sort jobs">
          <option value="fit">Sort: best fit</option>
          <option value="date-desc">Sort: date listed</option>
          <option value="salary-desc">Sort: salary high to low</option>
        </select>
      </section>

      {jobs === undefined ? (
        <div className="neon-panel rounded-2xl p-8 text-fuchsia-100/62">Loading jobs…</div>
      ) : sortedJobs && sortedJobs.length === 0 ? (
        <div className="neon-panel rounded-2xl p-8 text-fuchsia-100/62">No jobs match these filters.</div>
      ) : (
        <section className="neon-panel neon-panel-hot overflow-hidden rounded-2xl">
          <div className="hidden grid-cols-12 gap-3 border-b border-fuchsia-300/14 px-4 py-3 text-xs uppercase tracking-wide text-fuchsia-100/45 md:grid">
            <span className="col-span-4">Role</span><span className="col-span-2">Source</span><span className="col-span-2">Remote</span><span className="col-span-1">Discovered</span><span className="col-span-3">Triage</span>
          </div>
          <div className="neon-divider divide-y divide-white/10">
            {sortedJobs?.map((job) => (
              <div key={job._id} className="neon-row grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-12">
                <Link href={`/jobs/${job._id}`} onClick={rememberScrollPosition} className="md:col-span-4">
                  <strong className="block text-fuchsia-50">{job.title}</strong>
                  <span className="text-fuchsia-100/58">{job.company} · {job.location ?? "Unknown"}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-500/10 px-2.5 py-1 text-xs font-medium text-fuchsia-50 shadow-[0_0_18px_rgba(217,70,239,0.16)]">
                      Salary: {formatSalaryPreview(job.salaryRange)}
                    </span>
                  </span>
                  {job.fitReasons && job.fitReasons.length > 0 ? (
                    <span className="mt-1 block text-xs text-cyan-100/62">Fit {job.fitScore ?? "—"}: {job.fitReasons.slice(0, 3).join(" · ")}</span>
                  ) : null}
                </Link>
                <div className="flex items-start gap-2 md:col-span-2">
                  <span className="text-cyan-100/78"><span className="md:hidden text-fuchsia-100/45">Source: </span>{SOURCE_LABELS[job.source] ?? job.source}</span>
                  <button
                    type="button"
                    onClick={() => togglePreview(job._id)}
                    className={`hidden rounded-full border px-3 py-1 text-xs font-semibold transition lg:inline-flex ${
                      previewJob?._id === job._id
                        ? "border-cyan-200/70 bg-cyan-300/20 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.22)]"
                        : "border-fuchsia-300/20 bg-black/20 text-fuchsia-100/70 hover:border-cyan-200/55 hover:text-cyan-50"
                    }`}
                    aria-expanded={previewJob?._id === job._id}
                    aria-controls="job-preview-panel"
                  >
                    {previewJob?._id === job._id ? "Hide" : "Preview"}
                  </button>
                </div>
                <span className="text-cyan-100/78 md:col-span-2"><span className="md:hidden text-fuchsia-100/45">Remote: </span>{job.remoteStatus ?? "—"}</span>
                <span className="text-fuchsia-100/58 md:col-span-1"><span className="md:hidden text-fuchsia-100/45">Discovered: </span>{formatDate(job.discoveredAt)}</span>
                <span className="flex flex-wrap gap-2 md:col-span-3" aria-label={`Quick actions for ${job.title} at ${job.company}`}>
                  {QUICK_TRIAGE_ACTIONS.map((action) => {
                    const isActive = isQuickActionActive(action.status, job.applicationStatus);
                    const pendingKey = `${job._id}:${action.status}`;
                    return (
                      <button
                        key={action.status}
                        type="button"
                        disabled={pendingQuickAction !== null}
                        onClick={() => setQuickStatus(job._id, action.status)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-55 ${
                          isActive
                            ? "border-cyan-200/70 bg-cyan-300/20 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.22)]"
                            : "border-fuchsia-300/20 bg-black/20 text-fuchsia-100/70 hover:border-cyan-200/55 hover:text-cyan-50"
                        }`}
                        aria-pressed={isActive}
                      >
                        {pendingQuickAction === pendingKey ? "Saving…" : action.label}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <aside
        id="job-preview-panel"
        aria-label="Job listing preview"
        className={`fixed bottom-0 right-0 top-0 z-40 hidden w-[min(520px,42vw)] transform border-l border-cyan-300/20 bg-[#080615]/95 shadow-[0_0_42px_rgba(34,211,238,0.24)] backdrop-blur-xl transition-transform duration-300 lg:block ${
          previewJob ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {previewJob ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-fuchsia-300/14 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="neon-eyebrow text-xs uppercase tracking-[0.25em]">{SOURCE_LABELS[previewJob.source] ?? previewJob.source}</p>
                  <h2 className="neon-heading mt-2 text-xl font-semibold leading-tight">{previewJob.title}</h2>
                  <p className="mt-2 text-sm text-fuchsia-100/70">{previewJob.company} · {previewJob.location ?? "Unknown"}</p>
                </div>
                <button type="button" onClick={() => setPreviewJobId(undefined)} className="neon-ghost rounded-full px-3 py-1 text-sm" aria-label="Close preview panel">
                  Close
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/jobs/${previewJob._id}`} onClick={rememberScrollPosition} className="neon-button rounded-full px-4 py-2 text-xs font-semibold">
                  Full page →
                </Link>
                <a href={previewJob.url} target="_blank" rel="noopener noreferrer" className="neon-ghost rounded-full px-4 py-2 text-xs font-semibold">
                  Original ↗
                </a>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <dl className="grid gap-3 rounded-2xl border border-cyan-300/12 bg-black/24 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-fuchsia-100/45">Remote</dt><dd className="text-cyan-50">{previewJob.remoteStatus ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-fuchsia-100/45">Salary</dt><dd className="text-cyan-50">{previewJob.salaryRange ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-fuchsia-100/45">Fit score</dt><dd className="text-cyan-50">{previewJob.fitScore ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-fuchsia-100/45">Discovered</dt><dd className="text-cyan-50">{formatDate(previewJob.discoveredAt)}</dd></div>
              </dl>

              {previewJob.fitReasons && previewJob.fitReasons.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {previewJob.fitReasons.map((reason) => (
                    <span key={reason} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-cyan-300/12 bg-black/24 p-4 text-sm leading-6 text-fuchsia-100/78">
                {previewJob.description ?? "No description captured."}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-black/24 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-fuchsia-50">Embedded listing</h3>
                  <a className="text-xs text-cyan-200 hover:text-fuchsia-200" href={previewJob.url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                </div>
                <iframe src={previewJob.url} title={`${previewJob.title} preview`} sandbox="allow-scripts" className="h-[420px] w-full rounded-xl border border-cyan-300/12 bg-white" />
                <p className="mt-2 text-xs text-fuchsia-100/45">Some job sites block iframe previews; use Original or Full page if blank.</p>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
