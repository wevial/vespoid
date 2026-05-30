"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import type { Id } from "../../convex/_generated/dataModel";

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function Dashboard() {
  const counts = useQuery(api.jobs.statusCounts);
  const recentJobs = useQuery(api.jobs.listJobs, { isActive: true });
  const setStatus = useMutation(api.applications.setStatus);

  if (counts === undefined || recentJobs === undefined) {
    return <main className="mx-auto max-w-6xl p-8"><div className="animate-pulse text-slate-400">Loading dashboard…</div></main>;
  }

  const visibleJobs = recentJobs.slice(0, 10);
  const statusKeys = Object.keys(STATUS_LABELS) as ApplicationStatus[];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-blue-300">Vespoid</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Job search cockpit</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Fresh listings, application status, and stale checks in one personal dashboard.</p>
        </div>
        <Link className="rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-400" href="/jobs">
          View all jobs
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Unread active</p>
          <p className="mt-2 text-3xl font-semibold">{counts.unread ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Application records</p>
          <p className="mt-2 text-3xl font-semibold">{counts.totalApplications ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Applied</p>
          <p className="mt-2 text-3xl font-semibold">{counts.applied ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Interviewing</p>
          <p className="mt-2 text-3xl font-semibold">{(counts.screen ?? 0) + (counts.interview ?? 0)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <h2 className="text-xl font-semibold">Recent active listings</h2>
          <span className="text-sm text-slate-400">{recentJobs.length} active</span>
        </div>
        {visibleJobs.length === 0 ? (
          <div className="p-8 text-slate-400">No job listings yet. Scrapers will populate this as they run.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {visibleJobs.map((job) => (
              <article key={job._id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link className="text-lg font-semibold hover:text-blue-300" href={`/jobs/${job._id}`}>{job.title}</Link>
                  <p className="mt-1 text-sm text-slate-400">{job.company} · {job.location ?? "Location unknown"} · {formatDate(job.discoveredAt)}</p>
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-slate-500">{job.description ?? "No description captured."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusKeys.slice(0, 3).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatus({ jobId: job._id as Id<"jobs">, status })}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-blue-400 hover:text-blue-200"
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
