"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SOURCE_LABELS, STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { convexHttp } from "@/lib/convex-http";
import type { FunctionReturnType } from "convex/server";

type JobList = FunctionReturnType<typeof api.jobs.listJobs>;

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function JobsPage() {
  const [source, setSource] = useState<"" | "hn" | "wellfound">("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const [remote, setRemote] = useState("");
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    convexHttp.query(api.jobs.listJobs, args).then((result) => {
      if (!cancelled) setJobs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [args]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link className="text-sm text-blue-300 hover:text-blue-200" href="/">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold">Job listings</h1>
          <p className="mt-2 text-slate-400">Filter active jobs by source, status, remote text, or search.</p>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title/company/description" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-400">
          <option value="">All sources</option>
          <option value="hn">HN</option>
          <option value="wellfound">Wellfound</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-400">
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
        </select>
        <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="remote / hybrid / onsite" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-400" />
      </section>

      {jobs === undefined ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-400">Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-400">No jobs match these filters.</div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
            <span className="col-span-5">Role</span><span className="col-span-2">Source</span><span className="col-span-2">Remote</span><span className="col-span-2">Discovered</span><span className="col-span-1">Live</span>
          </div>
          <div className="divide-y divide-white/10">
            {jobs.map((job) => (
              <Link key={job._id} href={`/jobs/${job._id}`} className="grid grid-cols-12 gap-3 px-4 py-4 text-sm hover:bg-white/5">
                <span className="col-span-5"><strong className="block text-slate-100">{job.title}</strong><span className="text-slate-400">{job.company} · {job.location ?? "Unknown"}</span></span>
                <span className="col-span-2 text-slate-300">{SOURCE_LABELS[job.source] ?? job.source}</span>
                <span className="col-span-2 text-slate-300">{job.remoteStatus ?? "—"}</span>
                <span className="col-span-2 text-slate-400">{formatDate(job.discoveredAt)}</span>
                <span className="col-span-1">{job.isActive ? "✓" : "—"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
