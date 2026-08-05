import { parseBuiltinJobsFromHtml, type BuiltinCity, type CityBoardJobListing } from "../src/lib/city-board-jobs";

interface CityBoardRoute {
  city: BuiltinCity;
  label: string;
  paths: string[];
}

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

function builtinUrl(path: string) {
  return new URL(path, "https://builtin.com").toString();
}

async function fetchBuiltinHtml(path: string) {
  const response = await fetch(builtinUrl(path), {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function scrapeRoute(route: CityBoardRoute): Promise<CityBoardJobListing[]> {
  const pages = await Promise.allSettled(route.paths.map(fetchBuiltinHtml));
  const jobs: CityBoardJobListing[] = [];
  pages.forEach((result, index) => {
    if (result.status === "fulfilled") {
      jobs.push(...parseBuiltinJobsFromHtml(result.value, route.city));
    } else {
      console.warn(`Skipped ${route.label} ${route.paths[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
  return jobs;
}

export async function scrapeCityBoards(routes = BUILTIN_CITY_ROUTES): Promise<CityBoardJobListing[]> {
  const settled = await Promise.allSettled(routes.map(scrapeRoute));
  const jobs: CityBoardJobListing[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      jobs.push(...result.value);
    } else {
      console.warn(`Skipped ${routes[index].label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
  return Array.from(new Map(jobs.map((job) => [job.url, job])).values()).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
}

if (Bun.main === import.meta.path) {
  scrapeCityBoards()
    .then((jobs) => console.log(JSON.stringify({ source: "city_board", jobs }, null, 2)))
    .catch((error) => {
      console.error("City-board scraper failed:", error);
      process.exit(1);
    });
}
