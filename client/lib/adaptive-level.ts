/**
 * Display helpers for Adaptive Learning. The server decides which checkpoint quizzes a student sees
 * (server/src/modules/quiz/adaptive-difficulty.ts); these thresholds must stay in step with it.
 */
export type AdaptiveLevel = "easy" | "medium" | "hard";

export const DEFAULT_ADAPTIVE_LEVEL: AdaptiveLevel = "medium";

export const ADAPTIVE_LEVEL_RANGES: { level: AdaptiveLevel; range: string }[] = [
  { level: "easy", range: "0–50%" },
  { level: "medium", range: "51–75%" },
  { level: "hard", range: "76–100%" },
];

export function adaptiveLevelForScore(averageScore: number): AdaptiveLevel {
  if (averageScore <= 50) return "easy";
  if (averageScore <= 75) return "medium";
  return "hard";
}

export function formatLevel(level: string) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/** Same pill colours the quiz difficulty badges already use. */
export const LEVEL_BADGE_CLASS: Record<AdaptiveLevel, string> = {
  easy: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25",
  medium: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25",
  hard: "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25",
};

export const LEVEL_FEEDBACK: Record<AdaptiveLevel, string> = {
  easy: "Review the topic and practice again to improve your score.",
  medium: "Keep practicing to unlock harder quizzes.",
  hard: "Great progress! You are ready for more challenging questions.",
};

export const ADAPTIVE_STATUS_TOOLTIP =
  "Students may receive a different quiz difficulty based on their performance.";
