import { Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADAPTIVE_LEVEL_RANGES,
  ADAPTIVE_STATUS_TOOLTIP,
  LEVEL_BADGE_CLASS,
  formatLevel,
} from "@/lib/adaptive-level";

/** Teacher-facing explanation shown next to the quiz difficulty selector. */
export function AdaptiveLearningInfo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-accent-cyan/20 bg-accent-cyan/[0.06] p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-cyan" aria-hidden />
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
          Adaptive Learning
        </h4>
        <span title={ADAPTIVE_STATUS_TOOLTIP} className="text-slate-500">
          <Info className="h-3.5 w-3.5" aria-label={ADAPTIVE_STATUS_TOOLTIP} />
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        You choose the quiz difficulty. Adaptive Learning automatically determines which difficulty is
        most suitable for each student based on their previous performance.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        The difficulty you select remains the base difficulty of each question and is never changed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold">Student performance:</span>
        {ADAPTIVE_LEVEL_RANGES.map(({ level, range }) => (
          <span
            key={level}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest",
              LEVEL_BADGE_CLASS[level],
            )}
          >
            {range} → {formatLevel(level)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small "Adaptive Learning: ON" status with a tooltip. */
export function AdaptiveLearningStatus({ className }: { className?: string }) {
  return (
    <span
      title={ADAPTIVE_STATUS_TOOLTIP}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-accent-cyan/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-cyan",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      Adaptive Learning: ON
      <Info className="h-3 w-3" aria-label={ADAPTIVE_STATUS_TOOLTIP} />
    </span>
  );
}
