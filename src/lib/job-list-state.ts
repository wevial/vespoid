export interface JobListItem {
  _id: string;
}

export function beginJobListFilterGeneration(currentGeneration: number) {
  return {
    generation: currentGeneration + 1,
    isLoadingMore: false,
  };
}

export function isCurrentRequestGeneration(requestGeneration: number, currentGeneration: number) {
  return requestGeneration === currentGeneration;
}

export function removeJobFromPages<T extends JobListItem>(
  pages: readonly (readonly T[])[],
  jobId: string,
  previewJobId?: string,
) {
  return {
    pages: pages.map((page) => page.filter((job) => job._id !== jobId)),
    previewJobId: previewJobId === jobId ? undefined : previewJobId,
  };
}
