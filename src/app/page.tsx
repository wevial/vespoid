"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import type { Id } from "../../convex/_generated/dataModel";
import { convexHttp } from "@/lib/convex-http";
import { formatDateLabel } from "@/lib/date-format";
import type { FunctionReturnType } from "convex/server";

type StatusCounts = FunctionReturnType<typeof api.jobs.statusCounts>;
type JobList = FunctionReturnType<typeof api.jobs.listRecentJobCards>;
type WeeklyRecommendations = FunctionReturnType<typeof api.jobs.listWeeklyRecommendations>;

function formatDate(value?: string) {
  return formatDateLabel(value, { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [counts, setCounts] = useState<StatusCounts>();
  const [recentJobs, setRecentJobs] = useState<JobList>();
  const [weeklyRecommendations, setWeeklyRecommendations] = useState<WeeklyRecommendations>();
  const [loadError, setLoadError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [nextCounts, nextJobs, nextRecommendations] = await Promise.all([
        convexHttp.query(api.jobs.statusCounts),
        convexHttp.query(api.jobs.listRecentJobCards, { limit: 10 }),
        convexHttp.action(api.jobs.listWeeklyRecommendations),
      ]);
      setCounts(nextCounts);
      setRecentJobs(nextJobs);
      setWeeklyRecommendations(nextRecommendations);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the dashboard");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setStatus(jobId: Id<"jobs">, status: ApplicationStatus) {
    await convexHttp.mutation(api.applications.setStatus, { jobId, status });
    await refresh();
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <div className="vespoid-panel rounded-2xl p-6 text-ink">
          <h1 className="text-xl font-semibold">Dashboard could not load</h1>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <button className="vespoid-button mt-5 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (counts === undefined || recentJobs === undefined || weeklyRecommendations === undefined) {
    return <main className="mx-auto max-w-6xl p-8"><div className="animate-pulse text-muted">Loading dashboard…</div></main>;
  }

  const visibleJobs = recentJobs.slice(0, 10);
  const statusKeys = Object.keys(STATUS_LABELS) as ApplicationStatus[];

  return (
    <main className="vespoid-shell mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-10">
      <header className="vespoid-hero flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="vespoid-heading text-3xl tracking-tight">Dashboard</h1>
        </div>
        <Link className="vespoid-button rounded-xl px-5 py-3 text-sm font-semibold" href="/jobs">
          View all jobs
        </Link>
      </header>

      <section className="vespoid-stats grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="vespoid-panel rounded-2xl p-5">
          <p className="text-sm text-muted">Unread active</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{counts.unread ?? 0}</p>
        </div>
        <div className="vespoid-panel rounded-2xl p-5">
          <p className="text-sm text-muted">Application records</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{counts.totalApplications ?? 0}</p>
        </div>
        <div className="vespoid-panel rounded-2xl p-5">
          <p className="text-sm text-muted">Applied</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{counts.applied ?? 0}</p>
        </div>
        <div className="vespoid-panel rounded-2xl p-5">
          <p className="text-sm text-muted">Interviewing</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{(counts.screen ?? 0) + (counts.interview ?? 0)}</p>
        </div>
      </section>

      <section aria-labelledby="weekly-picks-heading">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="weekly-picks-heading" className="vespoid-heading text-2xl font-semibold">Recommendations</h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {weeklyRecommendations.map((group) => (
            <section key={group.area} className="vespoid-panel vespoid-panel-featured overflow-hidden rounded-2xl" aria-labelledby={`weekly-picks-${group.area}`}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 id={`weekly-picks-${group.area}`} className="text-lg font-semibold">{group.label}</h3>
                <span className="text-xs uppercase tracking-[0.18em] text-muted">Top {group.jobs.length}/5</span>
              </div>
              {group.jobs.length === 0 ? (
                <p className="p-5 text-sm text-muted">No active, untriaged recommendations in this area right now.</p>
              ) : (
                <div className="vespoid-divider divide-y divide-line">
                  {group.jobs.map((job) => {
                    const reasons = [...(job.fitReasons ?? []), ...(job.preferenceReasons ?? [])].slice(0, 3);
                    return (
                      <article key={job._id} className="vespoid-row p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <Link className="text-base font-semibold text-ink hover:text-berry" href={`/jobs/${job._id}`}>{job.title}</Link>
                            <p className="mt-1 text-sm text-muted">{job.company} · {job.location ?? "Location unknown"}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-berry">Fit {job.personalizedScore}</span>
                        </div>
                        {reasons.length > 0 ? <p className="mt-3 text-xs leading-5 text-berry">Why: {reasons.join(" · ")}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {statusKeys.slice(0, 3).map((status) => (
                            <button
                              key={status}
                              onClick={() => setStatus(job._id as Id<"jobs">, status)}
                              className="vespoid-ghost rounded-xl px-3 py-1 text-xs"
                            >
                              {STATUS_LABELS[status]}
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </section>

      <section className="vespoid-panel vespoid-panel-featured rounded-2xl">
        <div className="flex items-center justify-between border-b border-line p-5">
          <h2 className="text-xl font-semibold">Recent active listings</h2>
          <span className="text-sm text-muted">{recentJobs.length} active</span>
        </div>
        {visibleJobs.length === 0 ? (
          <div className="p-8 text-muted">No job listings yet. Scrapers will populate this as they run.</div>
        ) : (
          <div className="vespoid-divider divide-y divide-line">
            {visibleJobs.map((job) => (
              <article key={job._id} className="vespoid-row flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link className="text-lg font-semibold text-ink hover:text-berry" href={`/jobs/${job._id}`}>{job.title}</Link>
                  <p className="mt-1 text-sm text-muted">{job.company} · {job.location ?? "Location unknown"} · {formatDate(job.discoveredAt)}</p>
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-muted">{job.descriptionPreview ?? "No description captured."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusKeys.slice(0, 3).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatus(job._id as Id<"jobs">, status)}
                      className="vespoid-ghost rounded-xl px-3 py-1 text-xs"
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
