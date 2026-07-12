export const DEFAULT_PREVIEW_PANEL_WIDTH = 520;
export const MIN_PREVIEW_PANEL_WIDTH = 360;
export const MAX_PREVIEW_PANEL_VIEWPORT_RATIO = 0.85;

export function nextPreviewJobId(currentJobId: string | undefined, clickedJobId: string): string | undefined {
  return currentJobId === clickedJobId ? undefined : clickedJobId;
}

export function selectedPreviewJob<T extends { _id: string }>(jobs: readonly T[] | undefined, selectedJobId: string | undefined): T | undefined {
  if (!jobs || !selectedJobId) return undefined;
  return jobs.find((job) => job._id === selectedJobId);
}

export function clampPreviewPanelWidth({
  clientX,
  viewportWidth,
  minWidth = MIN_PREVIEW_PANEL_WIDTH,
  maxWidth = Math.round(viewportWidth * MAX_PREVIEW_PANEL_VIEWPORT_RATIO),
}: {
  clientX: number;
  viewportWidth: number;
  minWidth?: number;
  maxWidth?: number;
}) {
  return Math.min(Math.max(viewportWidth - clientX, minWidth), maxWidth);
}
