/**
 * Shared chart styling for every dashboard, so charts read as one system on the light theme.
 * Categorical and status colors were checked with a colorblind-safety validator (light surface #FFFFFF);
 * re-run it if any color here changes.
 */
export const CHART_COLORS = {
  primary: "#7C3AED",
  secondary: "#0891B2",
  surface: "#FFFFFF",
  // Recessive scaffolding: gridlines sit well below the data, axis text stays readable.
  grid: "#E2E8F0",
  axis: "#64748B",
  cursorFill: "rgba(124, 58, 237, 0.06)",
} as const;

/** Fixed role → color mapping (color follows the entity, so a filtered-out role never repaints the rest). */
export const ROLE_COLORS: Record<string, string> = {
  Students: "#7C3AED",
  Teachers: "#0891B2",
  Guardians: "#DB2777",
  Admins: "#D97706",
};

export type ScoreStatus = "strong" | "fair" | "needs-work";

/** Score bands use the same thresholds the score text colors use (<60, <80, otherwise). */
export const SCORE_STATUS: Record<ScoreStatus, { color: string; label: string }> = {
  strong: { color: "#0D9488", label: "Strong (80%+)" },
  fair: { color: "#D97706", label: "Fair (60–79%)" },
  "needs-work": { color: "#E11D48", label: "Needs work (<60%)" },
};

export function scoreStatus(score: number): ScoreStatus {
  if (score < 60) return "needs-work";
  if (score < 80) return "fair";
  return "strong";
}

/** Props shared by every X/Y axis. */
export const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: "4 4",
} as const;

export const CHART_ANIMATION = {
  animationDuration: 700,
  animationEasing: "ease-out",
} as const;

/** Wait this long after a resize before re-measuring, so dragging a window does not re-render every frame. */
export const CHART_RESIZE_DEBOUNCE_MS = 120;

/** Size used for the very first render, before ResponsiveContainer measures its box (avoids a -1×-1 render). */
export const CHART_INITIAL_DIMENSION = { width: 320, height: 240 } as const;

export const percent = (value: number | string) => `${value}%`;
