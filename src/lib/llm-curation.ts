import { classifyJobFit } from "./job-fit";

export interface HNRawHiringPost {
  id: number;
  author: string;
  createdAt: string;
  firstLine: string;
  text: string;
}

export interface LLMCuratedJobDraft {
  sourceCommentId: string;
  company: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  salaryRange: string | null;
  location: string | null;
  remoteStatus: string | null;
  fitReasons: string[] | null;
  confidence: number | null;
}

export interface CuratedHNJob {
  url: string;
  title: string;
  company: string;
  source: "hn";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  fitScore: number;
  fitReasons: string[];
  postedAt: string;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "role";
}

function safeHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    const host = url.hostname.toLowerCase();
    if (["localhost", "127.", "0.", "10.", "169.254.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."].some((prefix) => host === prefix || host.startsWith(prefix))) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function allowedUrlsForPost(post: HNRawHiringPost): Set<string> {
  const urls = new Set<string>([`https://news.ycombinator.com/item?id=${post.id}`]);
  for (const match of post.text.matchAll(/https:\/\/[^\s<>")]+/gi)) {
    const normalized = safeHttpsUrl(match[0].replace(/[.,;:]+$/, ""));
    if (normalized) urls.add(normalized);
  }
  return urls;
}

function cleanOptionalString(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 1000) : undefined;
}

function normalizeDraft(post: HNRawHiringPost, draft: LLMCuratedJobDraft): CuratedHNJob | undefined {
  if (draft.sourceCommentId !== String(post.id)) return undefined;
  if ((draft.confidence ?? 0) < 0.6) return undefined;

  const company = cleanOptionalString(draft.company);
  const title = cleanOptionalString(draft.title);
  const description = cleanOptionalString(draft.description);
  if (!company || !title || !description) return undefined;

  const allowedUrls = allowedUrlsForPost(post);
  const requestedUrl = draft.url ? safeHttpsUrl(draft.url) : undefined;
  if (requestedUrl && !allowedUrls.has(requestedUrl)) return undefined;
  const baseUrl = requestedUrl ?? `https://news.ycombinator.com/item?id=${post.id}`;

  const candidate = {
    title,
    company,
    description,
    salaryRange: cleanOptionalString(draft.salaryRange),
    location: cleanOptionalString(draft.location),
    remoteStatus: cleanOptionalString(draft.remoteStatus),
  };
  const fit = classifyJobFit(candidate);
  if (!fit.isRelevant) return undefined;

  const llmReasons = Array.isArray(draft.fitReasons) ? draft.fitReasons.map(cleanOptionalString).filter((reason): reason is string => Boolean(reason)).slice(0, 6) : [];
  const fitReasons = [...new Set([...fit.reasons, ...llmReasons])].slice(0, 8);
  return {
    ...candidate,
    url: `${baseUrl}#hn-${post.id}-${slugify(title)}`,
    source: "hn",
    fitScore: fit.score,
    fitReasons,
    postedAt: new Date(post.createdAt).toISOString(),
  };
}

export function normalizeCuratedJobsForPost(post: HNRawHiringPost, drafts: LLMCuratedJobDraft[]): CuratedHNJob[] {
  const seenUrls = new Set<string>();
  const jobs: CuratedHNJob[] = [];
  for (const draft of drafts) {
    const normalized = normalizeDraft(post, draft);
    if (!normalized || seenUrls.has(normalized.url)) continue;
    seenUrls.add(normalized.url);
    jobs.push(normalized);
  }
  return jobs.sort((a, b) => b.fitScore - a.fitScore);
}

export function normalizeCuratedJobs(posts: HNRawHiringPost[], drafts: LLMCuratedJobDraft[]): CuratedHNJob[] {
  const draftsByPost = new Map<string, LLMCuratedJobDraft[]>();
  for (const draft of drafts) {
    const key = draft.sourceCommentId;
    const group = draftsByPost.get(key) ?? [];
    group.push(draft);
    draftsByPost.set(key, group);
  }
  return posts.flatMap((post) => normalizeCuratedJobsForPost(post, draftsByPost.get(String(post.id)) ?? []));
}

export function buildHiringPostCurationPrompt(posts: HNRawHiringPost[]): string {
  return `You are curating Hacker News Who is Hiring posts for Ko's personal job-search CRM, Vespoid.

Target profile:
- Product Engineer / Full-stack / Frontend-leaning Software Engineer.
- Strong matches: TypeScript, JavaScript, React, Next.js, Go, Python, frontend/product engineering, devtools, AI/LLM, APIs, SDKs, workflow automation, platform/internal tools.
- Locations: US remote, Seattle/Bellevue/Redmond, SF Bay Area, Denver/Boulder. Spain-only is possible/uncertain. Reject EU/EMEA/APAC/Canada-only roles unless the post explicitly includes US eligibility.
- Compensation: missing comp is allowed. Prefer $180k+. Reject explicit comp below $170k max, except Denver/Boulder can be acceptable around $150k+.
- reject Product Manager, Program Manager, Project Manager, Design, Designer, Sales, Account Executive, Marketing, Customer Success, Recruiting, pure Data Scientist, pure ML Research, internships, and agency/staffing posts.

Task:
For each HN company post, split it into individual role listings. Keep only roles matching Ko's target profile. If one company post lists both engineering roles and Product Manager/Sales/etc, include only the relevant engineering roles.

Safety rules:
- Return strict JSON only: an array of objects, no markdown, no comments.
- Do not invent companies, titles, salary, location, remote policy, descriptions, or URLs.
- Use null for absent fields.
- url must be one of the URLs present in that exact post, or null to use the HN comment URL.
- sourceCommentId must exactly match the input post id as a string.
- confidence is 0 to 1 and should be below 0.6 if the role is uncertain.

Object schema:
{
  "sourceCommentId": "123",
  "company": "Company name or null",
  "title": "Individual role title or null",
  "description": "Brief factual description from the post, role-specific if possible, or null",
  "url": "https://... or null",
  "salaryRange": "$180k-$220k or null",
  "location": "SF / Remote US / Seattle / etc or null",
  "remoteStatus": "remote / hybrid / onsite details or null",
  "fitReasons": ["short factual reasons"],
  "confidence": 0.0
}

Posts:
${JSON.stringify(posts, null, 2)}`;
}
