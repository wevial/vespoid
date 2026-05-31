import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sourceValidator, statusValidator } from "./schema";

function assertSafeUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConvexError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new ConvexError(`URL must use https: got ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedPrefixes = [
    "localhost",
    "127.",
    "0.",
    "10.",
    "169.254.",
    "192.168.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31.",
    "::1",
  ];

  if (blockedPrefixes.some((prefix) => hostname === prefix || hostname.startsWith(prefix))) {
    throw new ConvexError(`URL hostname is not allowed: ${parsed.hostname}`);
  }
}

export const upsertJob = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    company: v.string(),
    source: sourceValidator,
    description: v.optional(v.string()),
    salaryRange: v.optional(v.string()),
    location: v.optional(v.string()),
    remoteStatus: v.optional(v.string()),
    fitScore: v.optional(v.number()),
    fitReasons: v.optional(v.array(v.string())),
    postedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSafeUrl(args.url);

    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        company: args.company,
        source: args.source,
        description: args.description,
        salaryRange: args.salaryRange,
        location: args.location,
        remoteStatus: args.remoteStatus,
        fitScore: args.fitScore,
        fitReasons: args.fitReasons,
        postedAt: args.postedAt,
        isActive: true,
        lastCheckedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("jobs", {
      ...args,
      discoveredAt: now,
      isActive: true,
      lastCheckedAt: now,
    });
  },
});

export const markStale = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, { isActive: false, lastCheckedAt: new Date().toISOString() });
  },
});

export const markStaleBatch = mutation({
  args: { jobIds: v.array(v.id("jobs")) },
  handler: async (ctx, { jobIds }) => {
    const now = new Date().toISOString();
    for (const jobId of jobIds) {
      await ctx.db.patch(jobId, { isActive: false, lastCheckedAt: now });
    }
  },
});

export const listJobs = query({
  args: {
    source: v.optional(sourceValidator),
    status: v.optional(statusValidator),
    isActive: v.optional(v.boolean()),
    search: v.optional(v.string()),
    remoteStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const useSourceAndActive = args.source !== undefined && args.isActive !== undefined;
    const useSourceOnly = args.source !== undefined && args.isActive === undefined;
    const useActiveOnly = args.isActive !== undefined && args.source === undefined;

    let q;
    if (useSourceAndActive) {
      q = ctx.db
        .query("jobs")
        .withIndex("by_source_active", (idx) => idx.eq("source", args.source!).eq("isActive", args.isActive!));
    } else if (useSourceOnly) {
      q = ctx.db.query("jobs").withIndex("by_source", (idx) => idx.eq("source", args.source!));
    } else if (useActiveOnly) {
      q = ctx.db.query("jobs").withIndex("by_active", (idx) => idx.eq("isActive", args.isActive!));
    } else {
      q = ctx.db.query("jobs");
    }

    const jobs = await q.order("desc").take(100);
    let filtered = jobs;

    const apps = args.status
      ? await ctx.db
        .query("applications")
        .withIndex("by_status", (idx) => idx.eq("status", args.status!))
        .take(8192)
      : await ctx.db.query("applications").take(8192);
    const applicationsByJobId = new Map(apps.map((application) => [application.jobId, application]));

    if (args.status) {
      const appJobIds = new Set<Id<"jobs">>(apps.map((a) => a.jobId));
      filtered = filtered.filter((j) => appJobIds.has(j._id));
    }

    if (args.remoteStatus) {
      const remoteTerm = args.remoteStatus.toLowerCase();
      filtered = filtered.filter((j) => (j.remoteStatus ?? "").toLowerCase().includes(remoteTerm));
    }

    if (args.search) {
      const term = args.search.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(term) ||
          j.company.toLowerCase().includes(term) ||
          (j.description ?? "").toLowerCase().includes(term),
      );
    }

    return filtered
      .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
      .map((job) => ({ ...job, applicationStatus: applicationsByJobId.get(job._id)?.status }));
  },
});

export const getJobWithApplication = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const application = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();
    return { job, application: application ?? null };
  },
});

export const listActiveJobs = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(2000);
  },
});

export const statusCounts = query({
  handler: async (ctx) => {
    const apps = await ctx.db.query("applications").take(8192);
    const counts: Record<string, number> = {};
    for (const app of apps) {
      counts[app.status] = (counts[app.status] ?? 0) + 1;
    }

    const activeJobs = await ctx.db
      .query("jobs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(8192);

    const activeJobIds = new Set(activeJobs.map((job) => job._id));
    const appliedActiveIds = new Set(apps.filter((app) => activeJobIds.has(app.jobId)).map((app) => app.jobId));

    return {
      totalApplications: apps.length,
      saved: counts.saved ?? 0,
      applied: counts.applied ?? 0,
      screen: counts.screen ?? 0,
      interview: counts.interview ?? 0,
      offer: counts.offer ?? 0,
      rejected: counts.rejected ?? 0,
      archived: counts.archived ?? 0,
      unread: Math.max(0, activeJobs.length - appliedActiveIds.size),
    };
  },
});
