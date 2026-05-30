import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const statusValidator = v.union(
  v.literal("saved"),
  v.literal("applied"),
  v.literal("screen"),
  v.literal("interview"),
  v.literal("offer"),
  v.literal("rejected"),
  v.literal("archived"),
);

export const sourceValidator = v.union(v.literal("hn"), v.literal("wellfound"));

export default defineSchema({
  jobs: defineTable({
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
    discoveredAt: v.string(),
    isActive: v.boolean(),
    lastCheckedAt: v.optional(v.string()),
  })
    .index("by_url", ["url"])
    .index("by_source", ["source", "discoveredAt"])
    .index("by_active", ["isActive", "discoveredAt"])
    .index("by_source_active", ["source", "isActive", "discoveredAt"]),

  applications: defineTable({
    jobId: v.id("jobs"),
    status: statusValidator,
    appliedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    followUpAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),
});
