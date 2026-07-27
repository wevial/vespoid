export interface RawJobListBatch<T> {
  items: readonly T[];
  continueCursor: string;
  isDone: boolean;
}

export async function scanFilteredPage<T>(
  initialCursor: string | null,
  fetchBatch: (cursor: string | null, maxItems: number) => Promise<RawJobListBatch<T>>,
  matches: (item: T) => boolean | Promise<boolean>,
  pageSize: number,
  maxBatches: number,
) {
  const items: T[] = [];
  let cursor = initialCursor;
  let continueCursor = initialCursor ?? "";
  let isDone = false;
  let batchesConsumed = 0;

  while (items.length < pageSize && !isDone && batchesConsumed < maxBatches) {
    const remaining = pageSize - items.length;
    const batch = await fetchBatch(cursor, remaining);
    if (batch.items.length > remaining) {
      throw new Error(`Filtered pagination fetch returned ${batch.items.length} items for a ${remaining}-item slot`);
    }
    batchesConsumed += 1;
    for (const item of batch.items) {
      if (await matches(item)) items.push(item);
    }
    continueCursor = batch.continueCursor;
    isDone = batch.isDone;
    cursor = batch.continueCursor;
  }

  return { items, continueCursor, isDone, batchesConsumed };
}

export function scanFilteredActionPage<T>(
  initialCursor: string | null,
  runSinglePageQuery: (cursor: string | null, maxItems: number) => Promise<RawJobListBatch<T>>,
  matches: (item: T) => boolean | Promise<boolean>,
  pageSize: number,
  maxBatches: number,
) {
  return scanFilteredPage(
    initialCursor,
    runSinglePageQuery,
    matches,
    pageSize,
    maxBatches,
  );
}
