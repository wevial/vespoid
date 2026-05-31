import type { ApplicationStatus } from "./status";
import type { JobAreaFilter } from "./job-area";
import type { JobSortOption } from "./job-sort";

export interface JobListFilters {
  source: "" | "hn" | "wellfound" | "yc";
  status: "" | ApplicationStatus;
  remote: string;
  search: string;
  sort: JobSortOption;
  area: JobAreaFilter;
}

export const DEFAULT_JOB_LIST_FILTERS: JobListFilters = {
  source: "",
  status: "",
  remote: "",
  search: "",
  sort: "fit",
  area: "all",
};

const VALID_SOURCES = new Set(["", "hn", "wellfound", "yc"]);
const VALID_STATUSES = new Set(["", "saved", "applied", "screen", "interview", "offer", "rejected", "archived"]);
const VALID_SORTS = new Set(["fit", "date-desc", "salary-desc"]);
const VALID_AREAS = new Set(["all", "remote", "sf-bay", "seattle", "denver-boulder", "spain"]);

function oneOf<T extends string>(value: string | null, valid: Set<string>, fallback: T): T {
  return valid.has(value ?? "") ? (value as T) : fallback;
}

export function jobListFiltersFromSearchParams(params: URLSearchParams): JobListFilters {
  return {
    source: oneOf(params.get("source"), VALID_SOURCES, DEFAULT_JOB_LIST_FILTERS.source),
    status: oneOf(params.get("status"), VALID_STATUSES, DEFAULT_JOB_LIST_FILTERS.status),
    remote: params.get("remote") ?? DEFAULT_JOB_LIST_FILTERS.remote,
    search: params.get("q") ?? DEFAULT_JOB_LIST_FILTERS.search,
    sort: oneOf(params.get("sort"), VALID_SORTS, DEFAULT_JOB_LIST_FILTERS.sort),
    area: oneOf(params.get("area"), VALID_AREAS, DEFAULT_JOB_LIST_FILTERS.area),
  };
}

export function jobListFiltersToSearchParams(filters: JobListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.source) params.set("source", filters.source);
  if (filters.status) params.set("status", filters.status);
  if (filters.remote.trim()) params.set("remote", filters.remote.trim());
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.sort !== DEFAULT_JOB_LIST_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.area !== DEFAULT_JOB_LIST_FILTERS.area) params.set("area", filters.area);
  return params;
}
