export interface InterviewProcessSource {
  label: string;
  url: string;
}

export interface InterviewProcessNotes {
  company: string;
  confidence: "high" | "medium-high" | "medium" | "low-medium";
  summary: string;
  stages: string[];
  technicalSignals: string[];
  prepTips: string[];
  caveat: string;
  sources: InterviewProcessSource[];
}

const INTERVIEW_PROCESS_BY_COMPANY: Record<string, InterviewProcessNotes> = {
  anthropic: {
    company: "Anthropic",
    confidence: "high",
    summary: "Technical loops are practical and role-specific, with strong emphasis on product judgment, collaboration, and mission/safety alignment.",
    stages: [
      "Recruiter or intro screen",
      "Hiring manager or team screen",
      "Technical screen using tools such as Google Meet, Colab, or CodeSignal",
      "Final loop with live coding, frontend/full-stack architecture, system design, product judgment, and values/safety alignment",
      "Team matching may happen after the main interview loop for some full-stack/product roles",
    ],
    technicalSignals: [
      "React, Next.js, TypeScript, Node.js, complex client state, streaming/chat UI, latency, performance, accessibility, and product polish",
      "Staff+ roles likely emphasize system design, platform tradeoffs, scaling, technical leadership, and ambiguity",
      "Accessibility roles emphasize WCAG 2.2 AA, ARIA, semantic HTML, keyboard navigation, screen readers, and design-system primitives",
    ],
    prepTips: [
      "Prepare a crisp why Anthropic / why beneficial AI answer",
      "Practice practical live coding in non-local-IDE tools",
      "Prepare deep product/full-stack project walkthroughs with architecture, tradeoffs, reliability, and UX decisions",
      "Review AI product system design: streaming UI, retrieval, latency, queues, caching, observability, and safety boundaries",
    ],
    caveat: "High confidence on official tools/format and role expectations; medium confidence on exact stage order because Anthropic does not publish one universal loop.",
    sources: [
      { label: "Anthropic careers", url: "https://www.anthropic.com/careers" },
      { label: "IGotAnOffer Anthropic guide", url: "https://igotanoffer.com/en/advice/anthropic-interview-process" },
      { label: "GreatFrontEnd Anthropic FE guide", url: "https://www.greatfrontend.com/interviews/company/anthropic/questions-guides" },
    ],
  },
  openai: {
    company: "OpenAI",
    confidence: "high",
    summary: "OpenAI publishes a structured process: intro call, skills-based assessment, then a 4–6 hour final loop with 4–6 interviewers over 1–2 days.",
    stages: [
      "Application and resume review, often around one week",
      "Intro call with recruiter or hiring manager",
      "Skills-based assessment that may include pair coding, a take-home project, technical test, or multiple assessments",
      "Final interviews: usually 4–6 hours with 4–6 people over 1–2 days, virtual by default with optional SF onsite",
      "Decision usually within about one week after finals; references may be requested",
    ],
    technicalSignals: [
      "Engineering interviews evaluate well-designed solutions, high-quality code, performance, testing, communication, and collaboration",
      "Forward Deployed SWE emphasizes customer-facing full-stack work, OpenAI API integrations, POCs-to-production, system design, and relational databases",
      "Product/Statsig roles emphasize experimentation platforms, rollouts, canaries, analytics infrastructure, internal tooling, and distributed systems",
    ],
    prepTips: [
      "Prepare practical coding with clean tests, edge cases, and narrated tradeoffs",
      "Practice system design for feature flags, experimentation, rollout safety, LLM API integrations, and customer-specific deployments",
      "Prepare project deep-dives covering architecture, metrics, failure modes, and what you would change now",
      "Have concise answers for why OpenAI, safety/product responsibility, and high-ambiguity execution",
    ],
    caveat: "High confidence on official stages; assessment format still varies by team and role.",
    sources: [
      { label: "OpenAI interview guide", url: "https://openai.com/interview-guide/" },
      { label: "OpenAI FDSE listing", url: "https://jobs.ashbyhq.com/openai/7b90b83c-ec28-4e65-a235-6675e37b91c3" },
      { label: "OpenAI Senior Product listing", url: "https://jobs.ashbyhq.com/openai/73e56947-5d8b-414d-a0ac-9dc9b04e2406" },
      { label: "Interviewing.io OpenAI guide", url: "https://interviewing.io/openai-interview-questions" },
    ],
  },
  casco: {
    company: "Casco",
    confidence: "high",
    summary: "Casco's YC listing explicitly publishes a founder chat, technical project walkthrough, and paid one-week work trial.",
    stages: [
      "Founder chat, 30 minutes, focused on agent experience and excitement about AI/security",
      "Technical discussion, 45 minutes: show something you built and walk through your decisions",
      "Paid one-week work trial on a real team problem",
    ],
    technicalSignals: [
      "TypeScript, Next.js, AWS, agent systems, cloud-native/distributed systems, and cybersecurity/red-team workflows",
      "Security mindset: web/API/cloud vulnerabilities, prompt injection, tool abuse, data leakage, validation of findings",
      "Product tradeoffs around shipping fast while keeping agent outputs reliable and useful",
    ],
    prepTips: [
      "Prepare a polished 10–15 minute walkthrough of an agent/devtools/full-stack project",
      "Be ready to explain how to build and evaluate an autonomous security-testing agent",
      "Brush up on OWASP basics, SSRF, IDOR, API auth bugs, prompt injection, and tool-use guardrails",
      "For the work trial, optimize for fast shipping, clear async updates, and documented decisions",
    ],
    caveat: "High confidence because the YC listing explicitly states the process; technical topics are derived from the listing and product.",
    sources: [
      { label: "Casco YC job listing", url: "https://www.ycombinator.com/companies/casco/jobs/EGFscZJ-software-engineer" },
      { label: "Casco YC profile", url: "https://www.ycombinator.com/companies/casco" },
      { label: "Casco careers", url: "https://casco.com/careers" },
    ],
  },
  "moonset health": {
    company: "Moonset Health",
    confidence: "medium",
    summary: "No public process was found; likely a small early-startup loop centered on founder fit, full-stack/product judgment, and practical healthcare AI architecture.",
    stages: [
      "Founder intro / mission-fit call",
      "Technical/product screen on full-stack experience, AI/LLM usage, and data modeling",
      "Practical coding, project walkthrough, or small take-home is plausible but not confirmed",
      "Product/customer-fit discussion around clinical workflows, regulated systems, and ambiguity",
      "A short trial or working session is possible for a tiny YC team, but not publicly stated",
    ],
    technicalSignals: [
      "React, React Native, Expo, TypeScript, Python, FastAPI, AWS",
      "AI scribe workflow: audio capture, transcription, structured note generation, clinician review, EHR writeback, audit logs, and hallucination mitigation",
      "Healthcare constraints: HIPAA-aware design, data privacy/security, clinical documentation, and EHR integration",
    ],
    prepTips: [
      "Prepare a design for an AI charting assistant for hospice/post-acute nurses",
      "Have a crisp why healthcare / why senior care answer",
      "Prepare product/full-stack stories showing customer discovery, messy workflow modeling, fast iteration, and measurable impact",
      "Review LLM reliability: evals, human-in-the-loop approval, uncertainty, privacy, and auditability",
    ],
    caveat: "Official sources establish role expectations, but the actual interview stages are inferred because no public process or candidate reports were found.",
    sources: [
      { label: "Moonset Health YC job listing", url: "https://www.ycombinator.com/companies/moonset-health/jobs/hLOMAGp-product-engineer" },
      { label: "Moonset Health YC profile", url: "https://www.ycombinator.com/companies/moonset-health" },
      { label: "Moonset Health site", url: "https://www.moonsethealth.com" },
    ],
  },
  digitalocean: {
    company: "DigitalOcean",
    confidence: "medium-high",
    summary: "DigitalOcean candidate resources describe structured recruiter, remote/onsite, and behavioral interviewing; this AI/GPU-flavored role likely adds backend/cloud/system-design depth.",
    stages: [
      "Recruiter screen and/or hiring manager screen",
      "Technical screen focused on backend/cloud fundamentals",
      "Virtual or onsite loop with coding, debugging, systems/cloud infrastructure, and behavioral interviews",
      "Structured behavioral questions; DigitalOcean says there is not a standalone culture interview",
    ],
    technicalSignals: [
      "Go or Python, REST APIs, Docker, Kubernetes, cloud infrastructure, production reliability, and operational excellence",
      "AI/GPU platform topics: model serving, GPU utilization, batch inference, prefix caching, quantization, model catalogs, and benchmarking",
      "Public reports mention system design such as ML job schedulers, TinyURL, LRU cache, DB indexing, DNS/HTTPS flow, and latency debugging",
    ],
    prepTips: [
      "Prepare why DigitalOcean / why AI infrastructure around developer-first cloud and reliable GPU platforms",
      "Practice infra designs: inference serving platform, ML job scheduler, autoscaling API, and cache-heavy service",
      "Review Go/Python coding, Kubernetes/container basics, distributed systems, queues, caching, and observability",
      "Prepare STAR stories for incidents, performance wins, learning quickly, and cross-functional collaboration",
    ],
    caveat: "Medium-high confidence on broad process/topics; exact stage count for this specific AI/GPU req was not published.",
    sources: [
      { label: "DigitalOcean Built In listing", url: "https://builtin.com/job/software-engineer/9567014" },
      { label: "DigitalOcean candidate resources", url: "https://www.digitalocean.com/careers/resources" },
      { label: "DigitalOcean engineering team", url: "https://www.digitalocean.com/careers/engineering-team" },
      { label: "CodingKaro DigitalOcean candidate report", url: "https://www.codingkaro.in/jobs-internships/leetcode-interview-experience/DigitalOcean" },
    ],
  },
  workwhile: {
    company: "WorkWhile",
    confidence: "low-medium",
    summary: "No reliable public candidate loop was found; the Staff Frontend role likely centers on frontend architecture, product/design collaboration, and staff-level leadership.",
    stages: [
      "Recruiter screen",
      "Hiring manager screen",
      "Frontend technical screen or code review/live React/TypeScript exercise is likely but not confirmed",
      "Staff-level architecture/design discussion around frontend systems, design systems, state, performance, and accessibility",
      "Behavioral/leadership interviews focused on mentoring, technical strategy, and influence across product/design/engineering",
    ],
    technicalSignals: [
      "JavaScript, React, React Native, TypeScript, Styled Components, Expo, Storybook, component libraries, and design systems",
      "Frontend architecture, state management, accessibility, testing, performance, mobile performance, internationalization, and long-term maintainability",
      "Company tech content signals interest in practical AI-assisted engineering with verification and shared standards",
    ],
    prepTips: [
      "Prepare staff-level frontend stories: raising quality, building scalable UI systems, mentoring, and partnering with product/design",
      "Practice designing a component library / Storybook rollout and shared React + React Native architecture",
      "Review React performance, accessibility/testing strategy, state management, and design-system governance",
      "Use their AI-assisted engineering blog as a conversation hook for practical devtools/agent workflows with verification",
    ],
    caveat: "Role expectations are grounded in the listing and tech pages, but exact stage order is inferred because public candidate reports were sparse or blocked.",
    sources: [
      { label: "WorkWhile Built In listing", url: "https://builtin.com/job/staff-software-engineer-frontend/9436307" },
      { label: "WorkWhile Ashby posting", url: "https://jobs.ashbyhq.com/workwhilejobs/d7bf0280-ebbd-4e84-bfef-f73076297e26" },
      { label: "WorkWhile tech site", url: "https://tech.workwhile.ai/" },
      { label: "WorkWhile AI engineering blog", url: "https://tech.workwhile.ai/blog/principles-and-plans-for-ai-driven-engineering-cltnrkw6" },
    ],
  },
};

export function getInterviewProcessForCompany(company: string): InterviewProcessNotes | undefined {
  return INTERVIEW_PROCESS_BY_COMPANY[company.trim().toLowerCase()];
}
