import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { checkJobAvailability } from "../src/lib/job-availability";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("CONVEX_URL env var required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const CONCURRENCY = 4;

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const nextValue = process.argv[i + 1];
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
    } else if (nextValue && !nextValue.startsWith("--")) {
      args.set(key, nextValue);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

async function checkSavedAvailability() {
  const args = parseArgs();
  const maxAgeHours = Number(args.get("max-age-hours") ?? 24 * 7);
  const limit = Number(args.get("limit") ?? 50);
  const dryRun = args.get("dry-run") === "true";

  const jobs = await client.query(api.jobs.listSavedJobsNeedingAvailabilityCheck, { maxAgeHours, limit });
  const checked: { id: Id<"jobs">; title: string; company: string; status: string; reason: string }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        const result = await checkJobAvailability(job.url);
        if (!dryRun) {
          await client.mutation(api.jobs.markAvailability, {
            jobId: job._id,
            availabilityStatus: result.status,
            availabilityCheckedAt: result.checkedAt,
            availabilityReason: result.reason,
          });
        }
        checked.push({ id: job._id, title: job.title, company: job.company, status: result.status, reason: result.reason });
      }),
    );

    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (result.status === "rejected") {
        errors.push(`${batch[j].company} — ${batch[j].title}: ${result.reason}`);
      }
    }
  }

  const counts = checked.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Checked ${checked.length}/${jobs.length} saved jobs needing availability refresh${dryRun ? " (dry run)" : ""}.`);
  console.log(`open=${counts.open ?? 0} closed=${counts.closed ?? 0} unknown=${counts.unknown ?? 0}`);
  for (const item of checked.filter((entry) => entry.status === "closed")) {
    console.log(`closed: ${item.company} — ${item.title} (${item.reason})`);
  }
  if (errors.length > 0) {
    console.log(`${errors.length} errors encountered:`);
    for (const error of errors) console.log(`- ${error}`);
  }
}

checkSavedAvailability().catch((error) => {
  console.error("Saved availability check failed:", error);
  process.exit(1);
});
