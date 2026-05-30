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
    <main className="vespoid-shell mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link className="text-sm text-cyan-200 hover:text-fuchsia-200" href="/">← Dashboard</Link>
          <h1 className="neon-heading mt-2 text-3xl font-semibold">Job listings</h1>
          <p className="mt-2 text-fuchsia-100/68">Filter active jobs by source, status, remote text, or search.</p>
        </div>
      </header>

      <section className="neon-panel grid gap-3 rounded-2xl p-4 md:grid-cols-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title/company/description" className="neon-input rounded-xl px-3 py-2 text-sm outline-none" />
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="neon-input rounded-xl px-3 py-2 text-sm outline-none">
          <option value="">All sources</option>
          <option value="hn">HN</option>
          <option value="wellfound">Wellfound</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="neon-input rounded-xl px-3 py-2 text-sm outline-none">
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
        </select>
        <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="remote / hybrid / onsite" className="neon-input rounded-xl px-3 py-2 text-sm outline-none" />
      </section>

      {jobs === undefined ? (
        <div className="neon-panel rounded-2xl p-8 text-fuchsia-100/62">Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="neon-panel rounded-2xl p-8 text-fuchsia-100/62">No jobs match these filters.</div>
      ) : (
        <section className="neon-panel neon-panel-hot overflow-hidden rounded-2xl">
          <div className="grid grid-cols-12 gap-3 border-b border-fuchsia-300/14 px-4 py-3 text-xs uppercase tracking-wide text-fuchsia-100/45">
            <span className="col-span-5">Role</span><span className="col-span-2">Source</span><span className="col-span-2">Remote</span><span className="col-span-2">Discovered</span><span className="col-span-1">Live</span>
          </div>
          <div className="neon-divider divide-y divide-white/10">
            {jobs.map((job) => (
              <Link key={job._id} href={`/jobs/${job._id}`} className="neon-row grid grid-cols-12 gap-3 px-4 py-4 text-sm">
                <span className="col-span-5">
                  <strong className="block text-fuchsia-50">{job.title}</strong>
                  <span className="text-fuchsia-100/58">{job.company} · {job.location ?? "Unknown"}</span>
                  {job.fitReasons && job.fitReasons.length > 0 ? (
                    <span className="mt-1 block text-xs text-cyan-100/62">Fit {job.fitScore ?? "—"}: {job.fitReasons.slice(0, 3).join(" · ")}</span>
                  ) : null}
                </span>
                <span className="col-span-2 text-cyan-100/78">{SOURCE_LABELS[job.source] ?? job.source}</span>
                <span className="col-span-2 text-cyan-100/78">{job.remoteStatus ?? "—"}</span>
                <span className="col-span-2 text-fuchsia-100/58">{formatDate(job.discoveredAt)}</span>
                <span className="col-span-1">{job.isActive ? "✓" : "—"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
