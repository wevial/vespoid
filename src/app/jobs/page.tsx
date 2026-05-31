"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { SOURCE_LABELS, STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { convexHttp } from "@/lib/convex-http";
import { sortJobs, type JobSortOption } from "@/lib/job-sort";
import { filterJobsByArea, type JobAreaFilter } from "@/lib/job-area";
import { DEFAULT_JOB_LIST_FILTERS, jobListFiltersFromSearchParams, jobListFiltersToSearchParams } from "@/lib/job-list-query";
import { buildJobListScrollKey, parseSavedScrollY } from "@/lib/job-list-scroll";
import type { FunctionReturnType } from "convex/server";

type JobList = FunctionReturnType<typeof api.jobs.listJobs>;

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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
  const sortedJobs = useMemo(() => (jobs ? sortJobs(filterJobsByArea(jobs, area), sort) : undefined), [jobs, area, sort]);

  useEffect(() => {
    let cancelled = false;
    convexHttp.query(api.jobs.listJobs, args).then((result) => {
      if (!cancelled) setJobs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [args]);

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
            <span className="col-span-5">Role</span><span className="col-span-2">Source</span><span className="col-span-2">Remote</span><span className="col-span-2">Discovered</span><span className="col-span-1">Live</span>
          </div>
          <div className="neon-divider divide-y divide-white/10">
            {sortedJobs?.map((job) => (
              <Link key={job._id} href={`/jobs/${job._id}`} onClick={rememberScrollPosition} className="neon-row grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-12">
                <span className="md:col-span-5">
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
                </span>
                <span className="text-cyan-100/78 md:col-span-2"><span className="md:hidden text-fuchsia-100/45">Source: </span>{SOURCE_LABELS[job.source] ?? job.source}</span>
                <span className="text-cyan-100/78 md:col-span-2"><span className="md:hidden text-fuchsia-100/45">Remote: </span>{job.remoteStatus ?? "—"}</span>
                <span className="text-fuchsia-100/58 md:col-span-2"><span className="md:hidden text-fuchsia-100/45">Discovered: </span>{formatDate(job.discoveredAt)}</span>
                <span className="md:col-span-1"><span className="md:hidden text-fuchsia-100/45">Live: </span>{job.isActive ? "✓" : "—"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
