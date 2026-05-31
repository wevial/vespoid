export function nextPreviewJobId(currentJobId: string | undefined, clickedJobId: string): string | undefined {
  return currentJobId === clickedJobId ? undefined : clickedJobId;
}

export function selectedPreviewJob<T extends { _id: string }>(jobs: readonly T[] | undefined, selectedJobId: string | undefined): T | undefined {
  if (!jobs || !selectedJobId) return undefined;
  return jobs.find((job) => job._id === selectedJobId);
}
