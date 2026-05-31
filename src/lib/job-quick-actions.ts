import type { ApplicationStatus } from "./status";

export const QUICK_TRIAGE_ACTIONS = [
  { status: "saved", label: "Save" },
  { status: "applied", label: "Applied" },
  { status: "archived", label: "Archive" },
] as const satisfies readonly { status: ApplicationStatus; label: string }[];

export type QuickTriageStatus = (typeof QUICK_TRIAGE_ACTIONS)[number]["status"];

export function isQuickActionActive(status: QuickTriageStatus, currentStatus: ApplicationStatus | null | undefined) {
  return currentStatus === status;
}
