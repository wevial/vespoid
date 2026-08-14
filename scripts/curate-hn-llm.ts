import { runHermesCodexPrompt, type HermesReasoning } from "./lib/hermes-codex";
import { scrapeHNRawPosts } from "./scrape-hn";
import {
  buildHiringPostCurationPrompt,
  normalizeCuratedJobs,
  type HNRawHiringPost,
  type LLMCuratedJobDraft,
} from "../src/lib/llm-curation";

interface Options {
  limit?: number;
  batchSize: number;
  model: string;
  reasoning: HermesReasoning;
  input?: string;
}

const REASONING_LEVELS = new Set<HermesReasoning>(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

function parseOptions(argv: string[]): Options {
  const configuredReasoning = (process.env.VESPOID_LLM_REASONING ?? "max") as HermesReasoning;
  const options: Options = {
    batchSize: 8,
    model: process.env.VESPOID_LLM_MODEL ?? "gpt-5.6-luna",
    reasoning: configuredReasoning,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--batch-size") options.batchSize = Number(argv[++index]);
    else if (arg === "--model") options.model = argv[++index] ?? options.model;
    else if (arg === "--reasoning") options.reasoning = (argv[++index] ?? options.reasoning) as HermesReasoning;
    else if (arg === "--input") options.input = argv[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 20) throw new Error("--batch-size must be an integer from 1 to 20");
  if (!REASONING_LEVELS.has(options.reasoning)) throw new Error(`Unsupported reasoning level: ${options.reasoning}`);
  return options;
}

function parseJsonPayload(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

function parseCuratedDrafts(value: string): LLMCuratedJobDraft[] {
  const parsed = parseJsonPayload(value);
  const jobs = Array.isArray(parsed) ? parsed : (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { jobs?: unknown }).jobs) ? (parsed as { jobs: unknown[] }).jobs : undefined);
  if (!jobs) throw new Error("LLM response must be a JSON array or an object with a jobs array");
  return jobs as LLMCuratedJobDraft[];
}

async function loadPosts(options: Options): Promise<HNRawHiringPost[]> {
  if (options.input) {
    const input = await Bun.file(options.input).json() as { posts?: HNRawHiringPost[] } | HNRawHiringPost[];
    const posts = Array.isArray(input) ? input : input.posts;
    if (!Array.isArray(posts)) throw new Error("--input JSON must be an array of posts or { posts }");
    return posts.slice(0, options.limit);
  }
  const posts = await scrapeHNRawPosts();
  return posts.slice(0, options.limit);
}

async function curateBatch(posts: HNRawHiringPost[], model: string, reasoning: HermesReasoning): Promise<LLMCuratedJobDraft[]> {
  const prompt = buildHiringPostCurationPrompt(posts);
  const content = await runHermesCodexPrompt(prompt, { model, reasoning });
  return parseCuratedDrafts(content);
}

export async function curateHNWithLLM(options: Options) {
  const posts = await loadPosts(options);
  const drafts: LLMCuratedJobDraft[] = [];
  for (let index = 0; index < posts.length; index += options.batchSize) {
    const batch = posts.slice(index, index + options.batchSize);
    const batchDrafts = await curateBatch(batch, options.model, options.reasoning);
    drafts.push(...batchDrafts);
    console.error(`Curated batch ${Math.floor(index / options.batchSize) + 1}/${Math.ceil(posts.length / options.batchSize)}: ${batchDrafts.length} draft roles`);
  }
  const jobs = normalizeCuratedJobs(posts, drafts);
  return { source: "hn" as const, jobs, stats: { posts: posts.length, drafts: drafts.length, jobs: jobs.length } };
}

if (Bun.main === import.meta.path) {
  curateHNWithLLM(parseOptions(Bun.argv.slice(2)))
    .then((result) => console.log(JSON.stringify({ source: result.source, jobs: result.jobs, stats: result.stats }, null, 2)))
    .catch((error) => {
      console.error("HN LLM curation failed:", error);
      process.exit(1);
    });
}
