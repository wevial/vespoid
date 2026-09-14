export type ActionPage<T> = {
  page: T[];
  continueCursor: string;
  isDone: boolean;
};

export async function collectAllActionPages<T>(
  loadPage: (cursor: string | null, numItems: number) => Promise<ActionPage<T>>,
  numItems: number,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await loadPage(cursor, numItems);
    items.push(...page.page);
    if (page.isDone) return items;
    cursor = page.continueCursor;
  }
}
