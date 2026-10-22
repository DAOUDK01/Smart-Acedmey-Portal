/**
 * Whole numbers, optionally ending in "%", can be counted up; anything else is shown as-is.
 * Kept out of the "use client" AnimatedNumber module so server components (e.g. PremiumCard on the
 * home page) can call it.
 */
export function parseCountable(text: string): { value: number; suffix: string } | null {
  const match = /^(\d{1,9})(%?)$/.exec(text.trim());
  return match ? { value: Number(match[1]), suffix: match[2] } : null;
}
