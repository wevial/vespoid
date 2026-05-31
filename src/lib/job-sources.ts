export const JOB_SOURCES = ["hn", "wellfound", "yc", "company_board", "city_board"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const SOURCE_LABELS: Record<JobSource, string> = {
  hn: "HN Who's Hiring",
  yc: "YC Work at a Startup",
  wellfound: "Wellfound",
  company_board: "Company boards",
  city_board: "City boards",
};

export function isJobSource(value: unknown): value is JobSource {
  return typeof value === "string" && (JOB_SOURCES as readonly string[]).includes(value);
}
