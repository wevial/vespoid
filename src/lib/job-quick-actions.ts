import type { ApplicationStatus } from "./status";

export const QUICK_TRIAGE_ACTIONS = [
  { status: "saved", label: "Save" },
  { status: "applied", label: "Applied" },
  { status: "archived", label: "Archive" },
] as const satisfies readonly { status: ApplicationStatus; label: string }[];

export type QuickTriageStatus = (typeof QUICK_TRIAGE_ACTIONS)[number]["status"];

const QUICK_ACTION_INACTIVE_TONES: Record<QuickTriageStatus, string> = {
  saved: "border-amber-200/70 bg-amber-400/18 text-amber-50 hover:border-amber-100 hover:bg-amber-300/28 hover:text-white",
  applied: "border-emerald-200/70 bg-emerald-400/18 text-emerald-50 hover:border-emerald-100 hover:bg-emerald-300/28 hover:text-white",
  archived: "border-rose-200/70 bg-rose-400/18 text-rose-50 hover:border-rose-100 hover:bg-rose-300/28 hover:text-white",
};

const QUICK_ACTION_ACTIVE_TONES: Record<QuickTriageStatus, string> = {
  saved: "border-amber-100 bg-amber-300/32 text-white",
  applied: "border-emerald-100 bg-emerald-300/32 text-white",
  archived: "border-rose-100 bg-rose-300/32 text-white",
};

export function isQuickActionActive(status: QuickTriageStatus, currentStatus: ApplicationStatus | null | undefined) {
  return currentStatus === status;
}

export function getQuickActionButtonTone(status: QuickTriageStatus, isActive: boolean) {
  return isActive ? QUICK_ACTION_ACTIVE_TONES[status] : QUICK_ACTION_INACTIVE_TONES[status];
}
