import { describe, expect, test } from "bun:test";
import { collectAllActionPages } from "../src/lib/action-page-collection";

describe("action page collection", () => {
  test("collects every page in cursor order without a fixed total cap", async () => {
    const pages = [
      { page: ["a", "b"], continueCursor: "cursor-1", isDone: false },
      { page: ["c", "d"], continueCursor: "cursor-2", isDone: false },
      { page: ["e"], continueCursor: "", isDone: true },
    ];
    const seen: Array<string | null> = [];

    const values = await collectAllActionPages(async (cursor) => {
      seen.push(cursor);
      return pages[seen.length - 1];
    }, 2);

    expect(values).toEqual(["a", "b", "c", "d", "e"]);
    expect(seen).toEqual([null, "cursor-1", "cursor-2"]);
  });
});
