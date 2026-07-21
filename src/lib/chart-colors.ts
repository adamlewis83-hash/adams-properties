/**
 * Chart palette from the UI System Spec (design handoff).
 *
 * Categorical series use CHART_CATEGORICAL in order — never more than 8
 * slices/series; everything past #8 rolls into "Everything else" (Stone).
 *
 * Semantic colors never rotate: income is always Pine, expenses always
 * Brick, debt service always Gold.
 */

export const CHART_CATEGORICAL = [
  "#14213D", // 1 · Navy
  "#C9962E", // 2 · Gold
  "#1D7A4F", // 3 · Pine
  "#3D5A80", // 4 · Slate blue
  "#B4402F", // 5 · Brick
  "#9C6B4A", // 6 · Clay
  "#7A8B6F", // 7 · Sage
  "#A39D93", // 8 · Stone
] as const;

export const CHART_INCOME = "#1D7A4F"; // Pine
export const CHART_EXPENSE = "#B4402F"; // Brick
export const CHART_DEBT = "#C9962E"; // Gold
export const CHART_STONE = "#A39D93"; // "Everything else"

export const CHART_GRID = "#E7E3DC"; // Line

/**
 * Roll a labeled series into at most 8 slices: top 7 by value plus an
 * "Everything else" bucket in Stone.
 */
export function capSeries<T extends { value: number }>(
  items: Array<T & { label: string }>,
  max = 8,
): Array<{ label: string; value: number; color: string }> {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) {
    return sorted.map((d, i) => ({ label: d.label, value: d.value, color: CHART_CATEGORICAL[i % CHART_CATEGORICAL.length] }));
  }
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  return [
    ...head.map((d, i) => ({ label: d.label, value: d.value, color: CHART_CATEGORICAL[i % CHART_CATEGORICAL.length] })),
    { label: "Everything else", value: rest.reduce((s, d) => s + d.value, 0), color: CHART_STONE },
  ];
}
