import { describe, expect, test } from "bun:test";
import { MAX_FILTER_SCAN_BATCHES } from "../convex/jobs";
import { scanFilteredActionPage, scanFilteredPage } from "../src/lib/job-list-pagination";

describe("job list filtered pagination", () => {
  test("keeps the production action scan budget at 1,600 raw rows", () => {
    expect(MAX_FILTER_SCAN_BATCHES).toBe(64);
    expect(MAX_FILTER_SCAN_BATCHES * 25).toBe(1600);
  });

  test("orchestrates every scan batch through a new single-page query invocation", async () => {
    const rawItems = Array.from({ length: 3 }, (_, index) => ({ id: `job-${index}` }));
    const queryInvocations: number[] = [];

    const runSinglePageQuery = async (cursor: string | null, maxItems: number) => {
      const invocation = queryInvocations.length + 1;
      queryInvocations.push(invocation);
      const start = cursor === null ? 0 : Number(cursor);
      const end = Math.min(start + Math.min(maxItems, 1), rawItems.length);
      return {
        items: rawItems.slice(start, end),
        continueCursor: String(end),
        isDone: end === rawItems.length,
      };
    };

    const result = await scanFilteredActionPage(null, runSinglePageQuery, () => true, 3, 4);

    expect(result.items.map((item) => item.id)).toEqual(["job-0", "job-1", "job-2"]);
    expect(queryInvocations).toEqual([1, 2, 3]);
  });

  test("passes only the bounded row count and exact cursor to each single-page query", async () => {
    const calls: Array<{ cursor: string | null; maxItems: number }> = [];
    await scanFilteredActionPage(null, async (cursor, maxItems) => {
      calls.push({ cursor, maxItems });
      return { items: [{ id: "job-1" }], continueCursor: "next", isDone: true };
    }, () => true, 1, 1);

    expect(calls).toEqual([{ cursor: null, maxItems: 1 }]);
  });

  test("does not skip matches when a raw batch has more matches than page capacity", async () => {
    const rawItems = Array.from({ length: 30 }, (_, index) => ({ id: `seattle-${index}` }));
    const requestedRawLimits: (number | undefined)[] = [];
    const fetchBatch = async (cursor: string | null, maxItems?: number) => {
      requestedRawLimits.push(maxItems);
      const start = cursor === null ? 0 : Number(cursor);
      const end = Math.min(start + (maxItems ?? rawItems.length), rawItems.length);
      return {
        items: rawItems.slice(start, end),
        continueCursor: String(end),
        isDone: end === rawItems.length,
      };
    };

    const firstPage = await scanFilteredPage(null, fetchBatch, () => true, 25, 4);
    const secondPage = await scanFilteredPage(firstPage.continueCursor, fetchBatch, () => true, 25, 4);

    expect(firstPage.items.map((item) => item.id)).toEqual(rawItems.slice(0, 25).map((item) => item.id));
    expect(firstPage.continueCursor).toBe("25");
    expect(secondPage.items.map((item) => item.id)).toEqual(rawItems.slice(25).map((item) => item.id));
    expect(requestedRawLimits).toEqual([25, 25]);
  });

  test("fetches forward through raw pages until the filtered page is full", async () => {
    const batches = new Map([
      [null, { items: [{ id: "raw-1" }, { id: "seattle-1" }], continueCursor: "cursor-1", isDone: false }],
      ["cursor-1", { items: [{ id: "raw-2" }, { id: "seattle-2" }], continueCursor: "cursor-2", isDone: false }],
      ["cursor-2", { items: [{ id: "seattle-3" }], continueCursor: "cursor-3", isDone: false }],
    ]);
    const requestedCursors: (string | null)[] = [];

    const result = await scanFilteredPage(
      null,
      async (cursor) => {
        requestedCursors.push(cursor);
        return batches.get(cursor)!;
      },
      (item) => item.id.startsWith("seattle"),
      3,
      4,
    );

    expect(result.items.map((item) => item.id)).toEqual(["seattle-1", "seattle-2", "seattle-3"]);
    expect(result.continueCursor).toBe("cursor-3");
    expect(result.isDone).toBe(false);
    expect(requestedCursors).toEqual([null, "cursor-1", "cursor-2"]);
  });

  test("stops at the explicit scan cap and returns the last consumed cursor", async () => {
    const requestedCursors: (string | null)[] = [];
    const result = await scanFilteredPage(
      null,
      async (cursor) => {
        requestedCursors.push(cursor);
        const nextCursor = cursor === null ? "cursor-1" : "cursor-2";
        return { items: [{ id: "not-a-match" }], continueCursor: nextCursor, isDone: false };
      },
      (item) => item.id === "match",
      25,
      2,
    );

    expect(result.items).toEqual([]);
    expect(result.continueCursor).toBe("cursor-2");
    expect(result.isDone).toBe(false);
    expect(requestedCursors).toEqual([null, "cursor-1"]);
  });
});
