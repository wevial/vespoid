export const JOB_LIST_SCROLL_PREFIX = "vespoid:jobs-scroll";

export function buildJobListScrollKey(pathname: string, search: string) {
  return `${JOB_LIST_SCROLL_PREFIX}:${pathname}${search}`;
}

export function parseSavedScrollY(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}
