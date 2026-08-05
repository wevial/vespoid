import { chromium } from "@playwright/test";

interface JobListing {
  url: string;
  title: string;
  company: string;
  source: "wellfound";
  description: string;
  salaryRange?: string;
  location?: string;
  remoteStatus?: string;
  postedAt?: string;
}

const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => false });
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5].map(() => ({ name: 'Chrome PDF Plugin' })) });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) return 'Intel Inc.';
  if (parameter === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.call(this, parameter);
};
if (navigator.permissions) {
  const originalQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (parameters) => originalQuery(parameters).catch(() => {
    const status = new EventTarget();
    status.state = 'prompt';
    status.onchange = null;
    return status;
  });
}
`;

export async function scrapeWellfound(): Promise<JobListing[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();

    await page.goto("https://wellfound.com/jobs", { waitUntil: "networkidle", timeout: 30000 });
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/signin")) {
      console.warn("Wellfound requires authentication — no public listings available");
      return [];
    }

    return await page.evaluate(() => {
      const selectors = ['[class*="job-card"]', '[class*="JobCard"]', '[data-test*="job"]', 'a[href*="/jobs/"]'];
      let cards: Element[] = [];
      for (const selector of selectors) {
        cards = Array.from(document.querySelectorAll(selector));
        if (cards.length > 0) break;
      }
      return cards
        .map((card) => {
          const link = card.tagName === "A" ? (card as HTMLAnchorElement) : card.querySelector<HTMLAnchorElement>("a");
          return {
            url: link?.href ?? "",
            title: card.querySelector('[class*="title"], [class*="Title"]')?.textContent?.trim() ?? "",
            company: card.querySelector('[class*="company"], [class*="Company"]')?.textContent?.trim() ?? "",
            source: "wellfound" as const,
            description: card.querySelector('[class*="description"], [class*="Description"]')?.textContent?.trim() ?? card.textContent?.trim() ?? "",
            salaryRange: card.querySelector('[class*="salary"], [class*="Salary"]')?.textContent?.trim(),
            location: card.querySelector('[class*="location"], [class*="Location"]')?.textContent?.trim(),
            remoteStatus: card.querySelector('[class*="remote"], [class*="Remote"]')?.textContent?.trim() ?? (card.textContent?.includes("Remote") ? "remote" : undefined),
          };
        })
        .filter((job) => job.url && job.title && job.company);
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

if (Bun.main === import.meta.path) {
  scrapeWellfound()
    .then((jobs) => console.log(JSON.stringify({ source: "wellfound", jobs }, null, 2)))
    .catch((error) => {
      console.error("Wellfound scraper failed:", error);
      process.exit(1);
    });
}
