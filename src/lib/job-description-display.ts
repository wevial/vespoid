export const DEFAULT_DESCRIPTION_COLLAPSE_LENGTH = 1400;

export function descriptionNeedsExpansion(description: string | undefined, maxLength = DEFAULT_DESCRIPTION_COLLAPSE_LENGTH): boolean {
  return (description?.trim().length ?? 0) > maxLength;
}

export function getCollapsedDescription(description: string | undefined, maxLength = DEFAULT_DESCRIPTION_COLLAPSE_LENGTH): string {
  const normalized = description?.trim() || "No description captured.";
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength);
  const lastWhitespace = slice.search(/\s+\S*$/);
  const boundary = lastWhitespace > Math.floor(maxLength * 0.72) ? lastWhitespace : maxLength;
  return `${slice.slice(0, boundary).trimEnd()}…`;
}
