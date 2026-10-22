"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Recharts animation props for every chart: a short ease-out entrance (bars grow, lines draw, areas
 * expand) that is switched off entirely when the user prefers reduced motion. Recharts only replays it
 * when the data itself changes, so hovering or resizing never restarts it.
 */
export function useChartAnimation(duration = 650) {
  const reduceMotion = useReducedMotion();
  return {
    isAnimationActive: !reduceMotion,
    animationBegin: 0,
    animationDuration: duration,
    animationEasing: "ease-out" as const,
  };
}
