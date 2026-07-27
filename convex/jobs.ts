import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { sourceValidator, statusValidator, availabilityStatusValidator } from "./schema";
import { applyPreferenceSignals, type PreferenceFeedback } from "./jobPreferenceScore";
import { matchesJobArea, type JobAreaFilter } from "../src/lib/job-area";
import { scanFilteredActionPage } from "../src/lib/job-list-pagination";

const jobAreaValidator = v.union(
  v.literal("all"),
  v.literal("remote"),
  v.literal("sf-bay"),
  v.literal("seattle"),
  v.literal("denver-boulder"),
  v.literal("spain"),
);
// Keep post-filter pagination bounded: at most 1,600 raw rows per request.
// The action scans up to 64 batches of 25 rows so filtered pages can still fill to 25.
export const MAX_FILTER_SCAN_BATCHES = 64;
// This cap is ranking-only; status correctness comes from bounded by_job lookups for scanned jobs.
const MAX_FEEDBACK_APPLICATIONS_PER_STATUS = 50;

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
    const jobPatch = {
      title: args.title,
      company: args.company,
      source: args.source,
      description: descriptionPreview(args.description),
      salaryRange: args.salaryRange,
      location: args.location,
      remoteStatus: args.remoteStatus,
      fitScore: args.fitScore,
      fitReasons: args.fitReasons,
      postedAt: args.postedAt,
      isActive: true,
      lastCheckedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, jobPatch);
      await upsertFullJobDescription(ctx, existing._id, args.description, now);
      return existing._id;
    }

    const jobId = await ctx.db.insert("jobs", {
      url: args.url,
      ...jobPatch,
      discoveredAt: now,
    });
    await upsertFullJobDescription(ctx, jobId, args.description, now);
    return jobId;
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

export const migrateJobDescriptions = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 250);
    const now = new Date().toISOString();
    const jobs = await ctx.db.query("jobs").take(8192);
    let inspected = 0;
    let copiedFullDescriptions = 0;
    let trimmedJobDescriptions = 0;

    for (const job of jobs) {
      if (inspected >= limit) break;
      if (!job.description) continue;

      const preview = descriptionPreview(job.description);
      const existingDetail = await ctx.db
        .query("jobDescriptions")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .first();
      const needsDetail = !existingDetail;
      const needsTrim = preview !== job.description;
      if (!needsDetail && !needsTrim) continue;

      inspected += 1;
      if (needsDetail) {
        await upsertFullJobDescription(ctx, job._id, job.description, now);
        copiedFullDescriptions += 1;
      }
      if (needsTrim) {
        await ctx.db.patch(job._id, { description: preview });
        trimmedJobDescriptions += 1;
      }
    }

    return { inspected, copiedFullDescriptions, trimmedJobDescriptions, limit };
  },
});

export const listJobs = query({
  args: {
    source: v.optional(sourceValidator),
    status: v.optional(v.union(statusValidator, v.literal("unread"))),
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

    const jobs = await q.order("desc").take(2000);
    let filtered = jobs;

    const wantsUnread = args.status === "unread";
    const applicationStatus = (args.status && args.status !== "unread" ? args.status : undefined) as Doc<"applications">["status"] | undefined;
    const allApps = await ctx.db.query("applications").take(8192);
    const statusApps = applicationStatus
      ? await ctx.db
        .query("applications")
        .withIndex("by_status", (idx) => idx.eq("status", applicationStatus))
        .take(8192)
      : allApps;
    const applicationsByJobId = new Map(allApps.map((application) => [application.jobId, application]));

    if (wantsUnread) {
      filtered = filtered.filter((j) => !applicationsByJobId.has(j._id));
    } else if (args.status) {
      const appJobIds = new Set<Id<"jobs">>(statusApps.map((a) => a.jobId));
      filtered = filtered.filter((j) => appJobIds.has(j._id));
    } else {
      filtered = filtered.filter((j) => applicationsByJobId.get(j._id)?.status !== "archived");
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

    const feedback: PreferenceFeedback<Doc<"jobs">>[] = [];
    for (const application of allApps) {
      if (!["saved", "applied", "archived"].includes(application.status)) continue;
      const feedbackJob = await ctx.db.get(application.jobId);
      if (!feedbackJob) continue;
      feedback.push({ status: application.status as "saved" | "applied" | "archived", job: feedbackJob });
    }

    return applyPreferenceSignals(filtered, feedback)
      .map((job) => ({ ...job, applicationStatus: applicationsByJobId.get(job._id)?.status }));
  },
});

function descriptionPreview(description?: string) {
  if (!description) return undefined;
  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > 800 ? `${normalized.slice(0, 797)}…` : normalized;
}

async function getFullJobDescription(ctx: QueryCtx | MutationCtx, jobId: Id<"jobs">) {
  const detail = await ctx.db
    .query("jobDescriptions")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .first();
  return detail?.description;
}

async function upsertFullJobDescription(ctx: MutationCtx, jobId: Id<"jobs">, description: string | undefined, updatedAt: string) {
  if (!description) return;
  const existing = await ctx.db
    .query("jobDescriptions")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { description, updatedAt });
  } else {
    await ctx.db.insert("jobDescriptions", { jobId, description, updatedAt });
  }
}

function jobCard<T extends Doc<"jobs"> & { personalizedScore?: number; preferenceReasons?: string[] }>(
  job: T,
  applicationStatus?: Doc<"applications">["status"],
) {
  const { description, ...rest } = job;
  return {
    ...rest,
    descriptionPreview: descriptionPreview(description),
    applicationStatus,
  };
}

const listJobCardFilters = {
  source: v.optional(sourceValidator),
  status: v.optional(v.union(statusValidator, v.literal("unread"))),
  isActive: v.optional(v.boolean()),
  search: v.optional(v.string()),
  remoteStatus: v.optional(v.string()),
  area: v.optional(jobAreaValidator),
};

type JobListBatch = {
  items: readonly Doc<"jobs">[];
  applications: readonly { jobId: Id<"jobs">; status: Doc<"applications">["status"] }[];
  continueCursor: string;
  isDone: boolean;
};

type JobCardResult = Omit<Doc<"jobs">, "description"> & {
  descriptionPreview?: string;
  applicationStatus?: Doc<"applications">["status"];
  personalizedScore?: number;
  preferenceReasons?: string[];
};

type JobCardsResult = {
  page: JobCardResult[];
  continueCursor: string;
  isDone: boolean;
};

export const listJobCardsBatch = internalQuery({
  args: {
    ...listJobCardFilters,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<JobListBatch> => {
    const useSourceAndActive = args.source !== undefined && args.isActive !== undefined;
    const useSourceOnly = args.source !== undefined && args.isActive === undefined;
    const useActiveOnly = args.isActive !== undefined && args.source === undefined;

    const createJobQuery = () => {
      if (useSourceAndActive) {
        return ctx.db
          .query("jobs")
          .withIndex("by_source_active", (idx) => idx.eq("source", args.source!).eq("isActive", args.isActive!));
      } else if (useSourceOnly) {
        return ctx.db.query("jobs").withIndex("by_source", (idx) => idx.eq("source", args.source!));
      } else if (useActiveOnly) {
        return ctx.db.query("jobs").withIndex("by_active", (idx) => idx.eq("isActive", args.isActive!));
      } else {
        return ctx.db.query("jobs");
      }
    };

    const page = await createJobQuery().order("desc").paginate(args.paginationOpts);
    const applications = await Promise.all(page.page.map(async (job) => {
      const application = await ctx.db.query("applications").withIndex("by_job", (idx) => idx.eq("jobId", job._id)).first();
      return application ? { jobId: job._id, status: application.status } : null;
    }));

    return {
      items: page.page,
      applications: applications.filter((application): application is NonNullable<typeof application> => application !== null),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getJobListFeedback = internalQuery({
  args: {},
  handler: async (ctx): Promise<PreferenceFeedback<Doc<"jobs">>[]> => {
    const feedback: PreferenceFeedback<Doc<"jobs">>[] = [];
    const applications = (
      await Promise.all(["saved", "applied", "archived"].map((status) =>
        ctx.db.query("applications")
          .withIndex("by_status", (idx) => idx.eq("status", status as "saved" | "applied" | "archived"))
          .take(MAX_FEEDBACK_APPLICATIONS_PER_STATUS),
      ))
    ).flat();
    for (const application of applications) {
      const job = await ctx.db.get(application.jobId);
      if (job) feedback.push({ status: application.status as "saved" | "applied" | "archived", job });
    }
    return feedback;
  },
});

export const listJobCards = action({
  args: {
    ...listJobCardFilters,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<JobCardsResult> => {
    const requestedItems = Math.min(args.paginationOpts.numItems, 25);
    const applicationsByJobId = new Map<Id<"jobs">, { status: Doc<"applications">["status"] }>();
    const feedback = await ctx.runQuery(internal.jobs.getJobListFeedback, {});
    const matchesFilters = (job: Doc<"jobs">) => {
      const application = applicationsByJobId.get(job._id);
      const wantsUnread = args.status === "unread";
      const applicationStatus = (args.status && args.status !== "unread" ? args.status : undefined) as Doc<"applications">["status"] | undefined;

      if (wantsUnread && application) return false;
      if (applicationStatus && application?.status !== applicationStatus) return false;
      if (!wantsUnread && !applicationStatus && application?.status === "archived") return false;
      if (args.area && args.area !== "all" && !matchesJobArea(job, args.area as JobAreaFilter)) return false;
      if (args.remoteStatus && !(job.remoteStatus ?? "").toLowerCase().includes(args.remoteStatus.toLowerCase())) return false;

      if (args.search) {
        const term = args.search.toLowerCase();
        if (!job.title.toLowerCase().includes(term) && !job.company.toLowerCase().includes(term) && !(job.location ?? "").toLowerCase().includes(term) && !(job.remoteStatus ?? "").toLowerCase().includes(term) && !(descriptionPreview(job.description) ?? "").toLowerCase().includes(term)) return false;
      }
      return true;
    };

    const scanned = await scanFilteredActionPage(
      args.paginationOpts.cursor,
      async (cursor, maxItems) => {
        const batch = await ctx.runQuery(internal.jobs.listJobCardsBatch, {
          ...args,
          paginationOpts: { numItems: maxItems, cursor },
        }) as JobListBatch;
        for (const application of batch.applications) applicationsByJobId.set(application.jobId, application);
        return batch;
      },
      matchesFilters,
      requestedItems,
      MAX_FILTER_SCAN_BATCHES,
    );

    return {
      page: applyPreferenceSignals(scanned.items, feedback).map((job) => jobCard(job, applicationsByJobId.get(job._id)?.status)),
      continueCursor: scanned.continueCursor,
      isDone: scanned.isDone,
    };
  },
});

export const listRecentJobCards = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 25);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(limit);
    const apps = await ctx.db.query("applications").take(8192);
    const applicationsByJobId = new Map(apps.map((application) => [application.jobId, application]));
    return jobs
      .filter((job) => applicationsByJobId.get(job._id)?.status !== "archived")
      .map((job) => jobCard(job, applicationsByJobId.get(job._id)?.status));
  },
});

export const getJobWithApplication = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const description = await getFullJobDescription(ctx, jobId);
    const application = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();
    return { job: { ...job, description: description ?? job.description }, application: application ?? null };
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

export const markAvailability = mutation({
  args: {
    jobId: v.id("jobs"),
    availabilityStatus: availabilityStatusValidator,
    availabilityCheckedAt: v.string(),
    availabilityReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new ConvexError(`Job ${args.jobId} not found`);
    }

    await ctx.db.patch(args.jobId, {
      availabilityStatus: args.availabilityStatus,
      availabilityCheckedAt: args.availabilityCheckedAt,
      availabilityReason: args.availabilityReason,
    });
  },
});

export const listSavedJobsNeedingAvailabilityCheck = query({
  args: {
    maxAgeHours: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxAgeHours = args.maxAgeHours ?? 24 * 7;
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    const limit = args.limit ?? 50;
    const savedApps = await ctx.db
      .query("applications")
      .withIndex("by_status", (idx) => idx.eq("status", "saved"))
      .take(8192);

    const jobs = [];
    for (const application of savedApps) {
      const job = await ctx.db.get(application.jobId);
      if (!job) continue;
      if (job.availabilityStatus === "closed") continue;
      if (job.availabilityCheckedAt && job.availabilityCheckedAt > cutoff) continue;
      jobs.push({ ...job, applicationStatus: application.status });
      if (jobs.length >= limit) break;
    }

    return jobs;
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
