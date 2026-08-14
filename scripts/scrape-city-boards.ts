import { assertBuiltinJobPageHtml, builtinJobIdentity, parseBuiltinJobsFromHtml, type BuiltinCity, type CityBoardJobListing } from "../src/lib/city-board-jobs";
import { refreshPayload, type RefreshPayload } from "../src/lib/refresh-payload";

interface CityBoardRoute {
  city: BuiltinCity;
  label: string;
  paths: string[];
}

export interface ScrapeCityBoardsOptions {
  requestDelayMs?: number;
}

const BUILTIN_PAGE_LIMIT = 5;
const BUILTIN_REQUEST_DELAY_MS = 1_200;

const BUILTIN_CITY_ROUTES: CityBoardRoute[] = [
  {
    city: "seattle",
    label: "Built In Seattle",
    paths: ["/jobs/seattle/dev-engineering", "/jobs/seattle/remote/dev-engineering"],
  },
  {
    city: "san-francisco",
    label: "Built In San Francisco",
    paths: ["/jobs/san-francisco/dev-engineering", "/jobs/san-francisco/remote/dev-engineering"],
  },
  {
    city: "colorado",
    label: "Built In Colorado",
    paths: ["/jobs/colorado/dev-engineering", "/jobs/colorado/remote/dev-engineering"],
  },
  {
    city: "remote",
    label: "Built In Remote",
    paths: ["/jobs/remote/dev-engineering"],
  },
];

function builtinPageUrl(path: string, page: number) {
  const url = new URL(path, "https://builtin.com");
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchBuiltinHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function deduplicateBuiltinJobs(jobs: CityBoardJobListing[]): CityBoardJobListing[] {
  const firstSeen = new Map<string, CityBoardJobListing>();
  for (const job of jobs) {
    const identity = builtinJobIdentity(job.url);
    if (!firstSeen.has(identity)) firstSeen.set(identity, job);
  }
  return Array.from(firstSeen.values());
}

export async function scrapeCityBoards(
  routes = BUILTIN_CITY_ROUTES,
  { requestDelayMs = BUILTIN_REQUEST_DELAY_MS }: ScrapeCityBoardsOptions = {},
): Promise<RefreshPayload<CityBoardJobListing>> {
  const jobs: CityBoardJobListing[] = [];
  const failedSources: string[] = [];
  let attemptedPage = false;

  for (const route of routes) {
    for (const path of route.paths) {
      for (let page = 1; page <= BUILTIN_PAGE_LIMIT; page += 1) {
        if (attemptedPage) await sleep(requestDelayMs);
        attemptedPage = true;
        const url = builtinPageUrl(path, page);
        try {
          const html = await fetchBuiltinHtml(url);
          assertBuiltinJobPageHtml(html);
          jobs.push(...parseBuiltinJobsFromHtml(html, route.city));
        } catch (error) {
          console.warn(`Skipped ${route.label} ${path} page ${page}: ${error instanceof Error ? error.message : String(error)}`);
          failedSources.push(`builtin:${route.city}:${path}:page:${page}`);
          break;
        }
      }
    }
  }

  return refreshPayload(
    "city_board",
    deduplicateBuiltinJobs(jobs).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)),
    failedSources,
  );
}

if (Bun.main === import.meta.path) {
  scrapeCityBoards()
    .then((payload) => console.log(JSON.stringify(payload, null, 2)))
    .catch((error) => {
      console.error("City-board scraper failed:", error);
      process.exit(1);
    });
}
