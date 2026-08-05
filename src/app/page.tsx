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

function formatDate(value?: string) {
  return formatDateLabel(value, { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [counts, setCounts] = useState<StatusCounts>();
  const [recentJobs, setRecentJobs] = useState<JobList>();

  const refresh = useCallback(async () => {
    const [nextCounts, nextJobs] = await Promise.all([
      convexHttp.query(api.jobs.statusCounts),
      convexHttp.query(api.jobs.listRecentJobCards, { limit: 10 }),
    ]);
    setCounts(nextCounts);
    setRecentJobs(nextJobs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      convexHttp.query(api.jobs.statusCounts),
      convexHttp.query(api.jobs.listRecentJobCards, { limit: 10 }),
    ]).then(([nextCounts, nextJobs]) => {
      if (cancelled) return;
      setCounts(nextCounts);
      setRecentJobs(nextJobs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setStatus(jobId: Id<"jobs">, status: ApplicationStatus) {
    await convexHttp.mutation(api.applications.setStatus, { jobId, status });
    await refresh();
  }

  if (counts === undefined || recentJobs === undefined) {
    return <main className="mx-auto max-w-6xl p-8"><div className="animate-pulse text-slate-400">Loading dashboard…</div></main>;
  }

  const visibleJobs = recentJobs.slice(0, 10);
  const statusKeys = Object.keys(STATUS_LABELS) as ApplicationStatus[];

  return (
    <main className="vespoid-shell mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neon-eyebrow text-sm uppercase tracking-[0.35em]">Vespoid</p>
          <h1 className="neon-heading mt-2 text-4xl font-semibold tracking-tight">Job search cockpit</h1>
          <p className="mt-3 max-w-2xl text-blue-50/68">Fresh listings, application status, and stale checks in one personal dashboard.</p>
        </div>
        <Link className="neon-button rounded-[2px] px-5 py-3 text-sm font-semibold" href="/jobs">
          View all jobs
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="neon-panel rounded-[2px] p-5">
          <p className="text-sm text-blue-50/62">Unread active</p>
          <p className="mt-2 text-3xl font-semibold text-blue-100">{counts.unread ?? 0}</p>
        </div>
        <div className="neon-panel rounded-[2px] p-5">
          <p className="text-sm text-blue-50/62">Application records</p>
          <p className="mt-2 text-3xl font-semibold text-blue-100">{counts.totalApplications ?? 0}</p>
        </div>
        <div className="neon-panel rounded-[2px] p-5">
          <p className="text-sm text-blue-50/62">Applied</p>
          <p className="mt-2 text-3xl font-semibold text-blue-100">{counts.applied ?? 0}</p>
        </div>
        <div className="neon-panel rounded-[2px] p-5">
          <p className="text-sm text-blue-50/62">Interviewing</p>
          <p className="mt-2 text-3xl font-semibold text-blue-100">{(counts.screen ?? 0) + (counts.interview ?? 0)}</p>
        </div>
      </section>

      <section className="neon-panel neon-panel-hot rounded-[2px]">
        <div className="flex items-center justify-between border-b border-blue-300/14 p-5">
          <h2 className="text-xl font-semibold">Recent active listings</h2>
          <span className="text-sm text-blue-100/70">{recentJobs.length} active</span>
        </div>
        {visibleJobs.length === 0 ? (
          <div className="p-8 text-slate-400">No job listings yet. Scrapers will populate this as they run.</div>
        ) : (
          <div className="neon-divider divide-y divide-blue-100/10">
            {visibleJobs.map((job) => (
              <article key={job._id} className="neon-row flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link className="text-lg font-semibold text-slate-50 hover:text-blue-300" href={`/jobs/${job._id}`}>{job.title}</Link>
                  <p className="mt-1 text-sm text-blue-50/62">{job.company} · {job.location ?? "Location unknown"} · {formatDate(job.discoveredAt)}</p>
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-blue-50/40">{job.descriptionPreview ?? "No description captured."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusKeys.slice(0, 3).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatus(job._id as Id<"jobs">, status)}
                      className="neon-ghost rounded-[2px] px-3 py-1 text-xs"
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
