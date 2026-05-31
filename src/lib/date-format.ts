export function formatDateLabel(value: string | undefined, options: Intl.DateTimeFormatOptions, fallback = "Unknown") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", options).format(date);
}
