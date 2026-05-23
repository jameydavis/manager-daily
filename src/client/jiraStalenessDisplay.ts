export type StalenessTone = "fresh" | "normal" | "stale" | "old";

/** Human-readable age label for the issue modal staleness widget. */
export function formatDaysAgo(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** CSS tone bucket for staleness row coloring. */
export function stalenessTone(days: number): StalenessTone {
  if (days <= 2) return "fresh";
  if (days <= 7) return "normal";
  if (days <= 14) return "stale";
  return "old";
}
