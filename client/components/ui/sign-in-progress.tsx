"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SignInPhase = "idle" | "verifying" | "success";

// After this long the announcement changes so a slow server does not sound frozen to screen readers.
const SLOW_AFTER_MS = 4000;

/**
 * A slim brand progress bar for sign-in / sign-up requests. The real duration is unknown, so the bar
 * eases towards 90% while the request is in flight and only completes once the server accepts it.
 * Only the bar is shown; progress messages are announced to screen readers. Its height is always
 * reserved so the form never shifts when the bar appears.
 */
export function SignInProgress({
  phase,
  label = "Signing in",
  successMessage = "Signed in successfully. Taking you to your dashboard...",
  className,
}: {
  phase: SignInPhase;
  /** Accessible name of the progress bar, e.g. "Submitting admission request". */
  label?: string;
  successMessage?: string;
  className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (phase === "idle") {
      setProgress(0);
      setSlow(false);
      return;
    }
    if (phase === "success") {
      setProgress(100);
      return;
    }

    setProgress(12);
    setSlow(false);
    const tick = window.setInterval(() => {
      setProgress((current) => current + (90 - current) * 0.08);
    }, 150);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(slowTimer);
    };
  }, [phase]);

  const active = phase !== "idle";
  const success = phase === "success";
  const announcement = success
    ? successMessage
    : slow
      ? "Still working on it. This can take a moment..."
      : `${label}...`;

  return (
    <div className={cn("h-1.5", className)}>
      <div
        {...(active
          ? {
              role: "progressbar",
              "aria-label": label,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": Math.round(progress),
            }
          : { "aria-hidden": true })}
        data-phase={phase}
        className={cn(
          "h-full w-full overflow-hidden rounded-full bg-accent-purple/10 transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className={cn(
            "relative h-full overflow-hidden rounded-full bg-brand-gradient ease-out",
            // Completing is a deliberate, slightly slower fill so the finish is visible.
            success
              ? "shadow-[0_0_12px_rgba(124,58,237,0.45)] transition-[width] duration-500"
              : "transition-[width] duration-300",
          )}
          style={{ width: `${progress}%` }}
        >
          {phase === "verifying" ? <span aria-hidden className="progress-shimmer absolute inset-0" /> : null}
        </div>
      </div>
      {active ? (
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}
