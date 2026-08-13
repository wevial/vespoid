"use client";

import Link from "next/link";
import { type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { SOURCE_LABELS } from "@/lib/status";
import { convexHttp } from "@/lib/convex-http";
import { formatDateLabel } from "@/lib/date-format";
import { descriptionNeedsExpansion, getCollapsedDescription } from "@/lib/job-description-display";
import { sortJobs, type JobSortOption } from "@/lib/job-sort";
import { type JobAreaFilter } from "@/lib/job-area";
import { DEFAULT_JOB_LIST_FILTERS, JOB_LIST_STATUS_FILTER_OPTIONS, jobListFiltersFromSearchParams, jobListFiltersToSearchParams } from "@/lib/job-list-query";
import { buildJobListScrollKey, parseSavedScrollY } from "@/lib/job-list-scroll";
import { beginJobListFilterGeneration, isCurrentRequestGeneration, removeJobFromPages } from "@/lib/job-list-state";
import { getQuickActionButtonTone, isQuickActionActive, QUICK_TRIAGE_ACTIONS, type QuickTriageStatus } from "@/lib/job-quick-actions";
import { clampPreviewPanelWidth, DEFAULT_PREVIEW_PANEL_WIDTH, nextPreviewJobId, selectedPreviewJob } from "@/lib/job-preview-panel";
import type { FunctionReturnType } from "convex/server";

type JobCardsPage = FunctionReturnType<typeof api.jobs.listJobCards>;
type JobList = JobCardsPage["page"];

const JOBS_PAGE_SIZE = 25;

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
      ...(area !== "all" ? { area } : {}),
    }),
    [source, status, remote, search, area],
  );
  const [pages, setPages] = useState<JobList[]>();
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | undefined>();
  const [previewPanelWidth, setPreviewPanelWidth] = useState(DEFAULT_PREVIEW_PANEL_WIDTH);
  const [isResizingPreviewPanel, setIsResizingPreviewPanel] = useState(false);
  const [showFullPreviewDescription, setShowFullPreviewDescription] = useState(false);
  const requestGeneration = useRef(0);
  const jobs = useMemo(() => pages?.flat(), [pages]);
  const sortedJobs = useMemo(() => (jobs ? sortJobs(jobs, sort) : undefined), [jobs, sort]);
  const previewJob = useMemo(() => selectedPreviewJob(sortedJobs, previewJobId), [sortedJobs, previewJobId]);
  const canExpandPreviewDescription = descriptionNeedsExpansion(previewJob?.descriptionPreview);
  const previewDescription = showFullPreviewDescription ? (previewJob?.descriptionPreview ?? "No description captured.") : getCollapsedDescription(previewJob?.descriptionPreview);

  const loadMoreJobs = useCallback(async () => {
    if (isDone || isLoadingMore) return;
    const loadGeneration = requestGeneration.current;
    setIsLoadingMore(true);
    try {
      const nextPage = await convexHttp.action(api.jobs.listJobCards, {
        ...args,
        paginationOpts: { numItems: JOBS_PAGE_SIZE, cursor: continueCursor },
      });
      if (!isCurrentRequestGeneration(loadGeneration, requestGeneration.current)) return;
      setPages((current) => [...(current ?? []), nextPage.page]);
      setContinueCursor(nextPage.continueCursor);
      setIsDone(nextPage.isDone);
    } finally {
      if (isCurrentRequestGeneration(loadGeneration, requestGeneration.current)) setIsLoadingMore(false);
    }
  }, [args, continueCursor, isDone, isLoadingMore]);

  useEffect(() => {
    const nextGeneration = beginJobListFilterGeneration(requestGeneration.current);
    requestGeneration.current = nextGeneration.generation;
    const generation = nextGeneration.generation;
    setIsLoadingMore(nextGeneration.isLoadingMore);
    let cancelled = false;
    void Promise.resolve().then(async () => {
      setPages(undefined);
      setContinueCursor(null);
      setIsDone(false);
      const result = await convexHttp.action(api.jobs.listJobCards, {
        ...args,
        paginationOpts: { numItems: JOBS_PAGE_SIZE, cursor: null },
      });
      if (cancelled || !isCurrentRequestGeneration(generation, requestGeneration.current)) return;
      setPages([result.page]);
      setContinueCursor(result.continueCursor);
      setIsDone(result.isDone);
    });
    return () => {
      cancelled = true;
    };
  }, [args]);

  const setQuickStatus = useCallback(async (jobId: JobList[number]["_id"], status: QuickTriageStatus) => {
    const mutationGeneration = requestGeneration.current;
    const pendingKey = `${jobId}:${status}`;
    setPendingQuickAction(pendingKey);
    try {
      await convexHttp.mutation(api.applications.setStatus, { jobId, status });
      if (!isCurrentRequestGeneration(mutationGeneration, requestGeneration.current)) return;
      setPages((current) => current ? removeJobFromPages(current, jobId).pages : current);
      setPreviewJobId((current) => current === jobId ? undefined : current);
    } finally {
      setPendingQuickAction(null);
    }
  }, []);

  const togglePreview = useCallback((jobId: string) => {
    setShowFullPreviewDescription(false);
    setPreviewJobId((current) => nextPreviewJobId(current, jobId));
  }, []);

  const openPreview = useCallback((jobId: string) => {
    setShowFullPreviewDescription(false);
    setPreviewJobId(jobId);
  }, []);

  const handleDesktopRowClick = useCallback((event: MouseEvent<HTMLDivElement>, jobId: string) => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    openPreview(jobId);
  }, [openPreview]);

  const handleJobTitleClick = useCallback((event: MouseEvent<HTMLAnchorElement>, jobId: string) => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      event.preventDefault();
      openPreview(jobId);
      return;
    }
    rememberScrollPosition();
  }, [openPreview, rememberScrollPosition]);

  const handlePreviewResizeStart = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizingPreviewPanel(true);
  }, []);

  useEffect(() => {
    if (!isResizingPreviewPanel) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      setPreviewPanelWidth(clampPreviewPanelWidth({ clientX: event.clientX, viewportWidth: window.innerWidth }));
    };
    const handlePointerUp = () => setIsResizingPreviewPanel(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingPreviewPanel]);


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
          <Link className="text-sm text-blue-300 hover:text-orange-200" href="/">← Dashboard</Link>
          <h1 className="neon-heading mt-2 text-3xl font-semibold">Job listings</h1>
          <p className="mt-2 text-blue-50/68">Filter active jobs by source, status, remote text, or search.</p>
        </div>
      </header>

      <section className="neon-panel grid gap-3 rounded-[2px] p-4 md:grid-cols-6">
        <input value={search} onChange={(e) => setFilter({ search: e.target.value })} placeholder="Search title/company/preview" className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none" />
        <select value={source} onChange={(e) => setFilter({ source: e.target.value as typeof source })} className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none">
          <option value="">All sources</option>
          <option value="hn">HN</option>
          <option value="yc">YC</option>
          <option value="company_board">Company boards</option>
          <option value="city_board">City boards</option>
          <option value="wellfound">Wellfound</option>
        </select>
        <select value={status} onChange={(e) => setFilter({ status: e.target.value as typeof status })} className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none">
          <option value="">Any status</option>
          {JOB_LIST_STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select value={area} onChange={(e) => setFilter({ area: e.target.value as JobAreaFilter })} className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none" aria-label="Filter by area">
          <option value="all">Area: all</option>
          <option value="remote">Area: remote</option>
          <option value="sf-bay">Area: SF Bay</option>
          <option value="seattle">Area: Seattle</option>
          <option value="denver-boulder">Area: Denver/Boulder</option>
        </select>
        <input value={remote} onChange={(e) => setFilter({ remote: e.target.value })} placeholder="remote / hybrid / onsite" className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none" />
        <select value={sort} onChange={(e) => setFilter({ sort: e.target.value as JobSortOption })} className="neon-input rounded-[2px] px-3 py-2 text-sm outline-none" aria-label="Sort jobs">
          <option value="fit">Sort: best fit</option>
          <option value="date-desc">Sort: date listed</option>
          <option value="salary-desc">Sort: salary high to low</option>
        </select>
      </section>

      {jobs === undefined ? (
        <div className="neon-panel rounded-[2px] p-8 text-blue-50/62">Loading jobs…</div>
      ) : sortedJobs && sortedJobs.length === 0 ? (
        <div className="neon-panel rounded-[2px] p-8 text-blue-50/62">No jobs match these filters.</div>
      ) : (
        <section className="neon-panel neon-panel-hot overflow-hidden rounded-[2px]">
          <div className="hidden grid-cols-12 gap-3 border-b border-blue-300/14 px-4 py-3 text-xs uppercase tracking-wide text-blue-50/45 md:grid">
            <span className="col-span-3">Role</span><span className="col-span-2">Salary</span><span className="col-span-2">Source</span><span className="col-span-1">Remote</span><span className="col-span-1">Discovered</span><span className="col-span-3">Triage</span>
          </div>
          <div className="neon-divider divide-y divide-blue-100/10">
            {sortedJobs?.map((job) => (
              <div
                key={job._id}
                onClick={(event) => handleDesktopRowClick(event, job._id)}
                className="neon-row grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-12 lg:cursor-pointer"
              >
                <Link href={`/jobs/${job._id}`} onClick={(event) => handleJobTitleClick(event, job._id)} className="md:col-span-3">
                  <strong className="block text-slate-50">{job.title}</strong>
                  <span className="text-blue-50/58">{job.company} · {job.location ?? "Unknown"}</span>
                  {job.preferenceReasons && job.preferenceReasons.length > 0 ? (
                    <span className="mt-1 block text-xs text-orange-100/78">Personalized {job.personalizedScore}: {job.preferenceReasons.slice(0, 2).join(" · ")}</span>
                  ) : null}
                  {job.fitReasons && job.fitReasons.length > 0 ? (
                    <span className="mt-1 block text-xs text-blue-100/62">Fit {job.fitScore ?? "—"}: {job.fitReasons.slice(0, 3).join(" · ")}</span>
                  ) : null}
                </Link>
                <span className="text-orange-100/88 md:col-span-2"><span className="md:hidden text-blue-50/45">Salary: </span>{formatSalaryPreview(job.salaryRange)}</span>
                <div className="flex items-start gap-2 md:col-span-2">
                  <span className="text-blue-100/78"><span className="md:hidden text-blue-50/45">Source: </span>{SOURCE_LABELS[job.source] ?? job.source}</span>
                  <button
                    type="button"
                    onClick={() => togglePreview(job._id)}
                    className={`hidden rounded-[2px] border px-3 py-1 text-xs font-semibold transition lg:inline-flex ${
                      previewJob?._id === job._id
                        ? "border-orange-200/70 bg-orange-300/16 text-blue-50 shadow-[0_0_18px_rgba(255,159,10,0.18)]"
                        : "border-blue-300/20 bg-black/20 text-blue-50/70 hover:border-orange-200/55 hover:text-blue-50"
                    }`}
                    aria-expanded={previewJob?._id === job._id}
                    aria-controls="job-preview-panel"
                  >
                    {previewJob?._id === job._id ? "Hide" : "Preview"}
                  </button>
                </div>
                <span className="text-blue-100/78 md:col-span-1"><span className="md:hidden text-blue-50/45">Remote: </span>{job.remoteStatus ?? "—"}</span>
                <span className="text-blue-50/58 md:col-span-1"><span className="md:hidden text-blue-50/45">Discovered: </span>{formatDate(job.discoveredAt)}</span>
                <span className="flex flex-col items-start gap-2 md:col-span-3" aria-label={`Quick actions for ${job.title} at ${job.company}`}>
                  {QUICK_TRIAGE_ACTIONS.map((action) => {
                    const isActive = isQuickActionActive(action.status, job.applicationStatus);
                    const pendingKey = `${job._id}:${action.status}`;
                    return (
                      <button
                        key={action.status}
                        type="button"
                        disabled={pendingQuickAction !== null}
                        onClick={() => setQuickStatus(job._id, action.status)}
                        className={`rounded-[2px] border px-3 py-1 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-55 ${getQuickActionButtonTone(action.status, isActive)}`}
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

      {jobs !== undefined && !isDone ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMoreJobs}
            disabled={isLoadingMore}
            className="neon-button rounded-[2px] px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-55"
          >
            {isLoadingMore ? "Loading…" : `Load 25 more${sortedJobs ? ` (${sortedJobs.length} shown)` : ""}`}
          </button>
        </div>
      ) : null}

      <aside
        id="job-preview-panel"
        aria-label="Job listing preview"
        className={`fixed bottom-0 right-0 top-0 z-40 hidden transform border-l border-blue-300/24 bg-[#05070d]/95 shadow-[0_0_42px_rgba(10,102,255,0.22)] backdrop-blur-xl lg:block ${
          isResizingPreviewPanel ? "transition-none" : "transition-transform duration-300"
        } ${previewJob ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: previewPanelWidth }}
      >
        <button
          type="button"
          aria-label="Resize preview panel"
          onPointerDown={handlePreviewResizeStart}
          className="absolute -left-1 top-0 z-50 hidden h-full w-3 cursor-col-resize touch-none border-l border-blue-200/0 transition hover:border-orange-200/70 lg:block"
        />
        {previewJob ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-blue-300/14 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="neon-eyebrow text-xs uppercase tracking-[0.25em]">{SOURCE_LABELS[previewJob.source] ?? previewJob.source}</p>
                  <h2 className="neon-heading mt-2 text-xl font-semibold leading-tight">{previewJob.title}</h2>
                  <p className="mt-2 text-sm text-blue-50/70">{previewJob.company} · {previewJob.location ?? "Unknown"}</p>
                </div>
                <button type="button" onClick={() => setPreviewJobId(undefined)} className="neon-ghost rounded-[2px] px-3 py-1 text-sm" aria-label="Close preview panel">
                  Close
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/jobs/${previewJob._id}`} onClick={rememberScrollPosition} className="neon-ghost rounded-[2px] px-4 py-2 text-xs font-semibold">
                  Full page →
                </Link>
                <a href={previewJob.url} target="_blank" rel="noopener noreferrer" className="neon-ghost rounded-[2px] px-4 py-2 text-xs font-semibold">
                  Original ↗
                </a>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" aria-label={`Preview quick actions for ${previewJob.title} at ${previewJob.company}`}>
                {QUICK_TRIAGE_ACTIONS.map((action) => {
                  const isActive = isQuickActionActive(action.status, previewJob.applicationStatus);
                  const pendingKey = `${previewJob._id}:${action.status}`;
                  return (
                    <button
                      key={action.status}
                      type="button"
                      disabled={pendingQuickAction !== null}
                      onClick={() => setQuickStatus(previewJob._id, action.status)}
                      className={`rounded-[2px] border px-3 py-1 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-55 ${getQuickActionButtonTone(action.status, isActive)}`}
                      aria-pressed={isActive}
                    >
                      {pendingQuickAction === pendingKey ? "Saving…" : action.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
              <dl className="grid gap-3 rounded-[2px] border border-blue-300/16 bg-black/24 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-blue-50/45">Remote</dt><dd className="text-blue-50">{previewJob.remoteStatus ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-blue-50/45">Salary</dt><dd className="text-blue-50">{previewJob.salaryRange ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-blue-50/45">Fit score</dt><dd className="text-blue-50">{previewJob.fitScore ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-blue-50/45">Personalized</dt><dd className="text-orange-50">{previewJob.personalizedScore ?? "Unknown"}</dd></div>
                <div><dt className="text-xs text-blue-50/45">Discovered</dt><dd className="text-blue-50">{formatDate(previewJob.discoveredAt)}</dd></div>
              </dl>

              {previewJob.preferenceReasons && previewJob.preferenceReasons.length > 0 ? (
                <div className="mt-4 rounded-[2px] border border-orange-200/24 bg-orange-300/10 p-3 text-sm text-orange-50">
                  Personalized because {previewJob.preferenceReasons.join(" and ")}.
                </div>
              ) : null}

              {previewJob.fitReasons && previewJob.fitReasons.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {previewJob.fitReasons.map((reason) => (
                    <span key={reason} className="rounded-[2px] border border-blue-300/24 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 rounded-[2px] border border-blue-300/16 bg-black/24 p-4 text-sm leading-6 text-blue-50/78">
                <div className="whitespace-pre-wrap">{previewDescription}</div>
                {canExpandPreviewDescription ? (
                  <button
                    type="button"
                    onClick={() => setShowFullPreviewDescription((current) => !current)}
                    className="mt-4 rounded-[2px] border border-blue-300/34 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-100 hover:border-orange-200/60 hover:text-orange-100"
                  >
                    {showFullPreviewDescription ? "See less" : "See more"}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex min-h-[520px] flex-1 flex-col rounded-[2px] border border-blue-300/16 bg-black/24 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-50">Embedded listing</h3>
                  <a className="text-xs text-blue-300 hover:text-orange-200" href={previewJob.url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                </div>
                <iframe src={previewJob.url} title={`${previewJob.title} preview`} sandbox="allow-scripts" className="min-h-[420px] flex-1 rounded-[2px] border border-blue-300/16 bg-white" />
                <p className="mt-2 text-xs text-blue-50/45">Some job sites block iframe previews; use Original or Full page if blank.</p>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
