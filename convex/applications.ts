import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { statusValidator } from "./schema";

export const setStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: statusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new ConvexError(`Job ${args.jobId} not found`);
    }

    const existing = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        notes: args.notes !== undefined ? args.notes : existing.notes,
        appliedAt: args.status === "applied" && !existing.appliedAt ? now : existing.appliedAt,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("applications", {
      jobId: args.jobId,
      status: args.status,
      appliedAt: args.status === "applied" ? now : undefined,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNotes = mutation({
  args: {
    jobId: v.id("jobs"),
    notes: v.string(),
  },
  handler: async (ctx, { jobId, notes }) => {
    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError(`Job ${jobId} not found`);
    }

    const existing = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, { notes, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("applications", {
      jobId,
      status: "saved",
      notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});
