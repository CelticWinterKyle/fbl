// Display formatting helpers shared across client components.

/**
 * Format a fantasy points value for display, tolerating null/undefined/NaN.
 * A non-numeric value (e.g. a partial API payload) renders as "0.0" instead of
 * throwing `toFixed is not a function` and crashing the page.
 */
export function fmtPts(n: number | null | undefined, digits = 1): string {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toFixed(digits);
}
