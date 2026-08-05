export type JobAvailabilityStatus = "open" | "closed" | "unknown";

export type JobAvailabilityResult = {
  status: JobAvailabilityStatus;
  reason: string;
  checkedAt: string;
};

const CLOSED_PATTERNS = [
  /position filled/i,
  /no longer accepting/i,
  /this job has been filled/i,
  /job has been closed/i,
  /job is closed/i,
  /posting has closed/i,
  /posting is closed/i,
  /position has been closed/i,
  /position is closed/i,
  /applications are closed/i,
  /this role is no longer available/i,
  /job is no longer available/i,
  /job no longer exists/i,
  /page not found/i,
  /404\s+not found/i,
  /\[dead\]/i,
  /\[deleted\]/i,
];

const OPEN_PATTERNS = [
  /apply for this job/i,
  /submit application/i,
  /apply now/i,
  /apply to this job/i,
  /application/i,
];

export function assertPublicHttpUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`URL must use HTTP(S): got ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedPrefixes = [
    "localhost",
    "127.",
    "0.",
    "10.",
    "169.254.",
    "192.168.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31.",
    "::1",
  ];

  if (blockedPrefixes.some((prefix) => hostname === prefix || hostname.startsWith(prefix))) {
    throw new Error(`URL hostname is not allowed: ${parsed.hostname}`);
  }
}

export function classifyAvailabilityFromHttpResult(statusCode: number, body: string): Pick<JobAvailabilityResult, "status" | "reason"> {
  if (statusCode === 404 || statusCode === 410) {
    return { status: "closed", reason: `listing returned HTTP ${statusCode}` };
  }

  if (statusCode >= 500) {
    return { status: "unknown", reason: `listing returned HTTP ${statusCode}` };
  }

  if (statusCode >= 400) {
    return { status: "unknown", reason: `listing returned HTTP ${statusCode}` };
  }

  const closedPattern = CLOSED_PATTERNS.find((pattern) => pattern.test(body));
  if (closedPattern) {
    return { status: "closed", reason: `matched closed-listing text: ${closedPattern.source}` };
  }

  const openPattern = OPEN_PATTERNS.find((pattern) => pattern.test(body));
  if (openPattern) {
    return { status: "open", reason: `matched application text: ${openPattern.source}` };
  }

  return { status: "unknown", reason: "no definitive open/closed text found" };
}

export async function checkJobAvailability(url: string): Promise<JobAvailabilityResult> {
  assertPublicHttpUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VespoidAvailabilityChecker/1.0)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const body = await response.text();
    return {
      ...classifyAvailabilityFromHttpResult(response.status, body),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "availability check failed",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
