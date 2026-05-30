export const STATUSES = ["saved", "applied", "screen", "interview", "offer", "rejected", "archived"] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  archived: "Archived",
};

export const SOURCE_LABELS: Record<string, string> = {
  hn: "HN Who's Hiring",
  wellfound: "Wellfound",
};
