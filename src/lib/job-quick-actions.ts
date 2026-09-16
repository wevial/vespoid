import type { ApplicationStatus } from "./status";

export const QUICK_TRIAGE_ACTIONS = [
  { status: "saved", label: "Save" },
  { status: "applied", label: "Applied" },
  { status: "archived", label: "Archive" },
] as const satisfies readonly { status: ApplicationStatus; label: string }[];

export type QuickTriageStatus = (typeof QUICK_TRIAGE_ACTIONS)[number]["status"];

const QUICK_ACTION_INACTIVE_TONES: Record<QuickTriageStatus, string> = {
  saved: "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 hover:bg-amber-100",
  applied: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100",
  archived: "border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-500 hover:bg-rose-100",
};

const QUICK_ACTION_ACTIVE_TONES: Record<QuickTriageStatus, string> = {
  saved: "border-amber-600 bg-amber-100 text-amber-950 ring-1 ring-amber-600",
  applied: "border-emerald-600 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-600",
  archived: "border-rose-600 bg-rose-100 text-rose-950 ring-1 ring-rose-600",
};

export function isQuickActionActive(status: QuickTriageStatus, currentStatus: ApplicationStatus | null | undefined) {
  return currentStatus === status;
}

export function getQuickActionButtonTone(status: QuickTriageStatus, isActive: boolean) {
  return isActive ? QUICK_ACTION_ACTIVE_TONES[status] : QUICK_ACTION_INACTIVE_TONES[status];
}
