"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Placeholder with the chart's footprint, so nothing jumps and no wrong values flash while data loads. */
export function ChartSkeleton({ className, variant = "bars" }: { className?: string; variant?: "bars" | "line" }) {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      className={cn("relative flex h-64 w-full items-end gap-3 overflow-hidden rounded-2xl px-2 pb-6", className)}
    >
      <div className="absolute inset-x-2 top-4 space-y-12" aria-hidden="true">
        {[0, 1, 2, 3].map((line) => (
          <div key={line} className="h-px bg-slate-200/80" />
        ))}
      </div>
      {variant === "bars" ? (
        [44, 68, 52, 80, 36, 60].map((height, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="relative flex-1 animate-pulse rounded-t-md bg-accent-purple/[0.08]"
            style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }}
          />
        ))
      ) : (
        <div aria-hidden="true" className="relative h-1/2 w-full animate-pulse rounded-xl bg-gradient-to-t from-accent-purple/[0.08] to-transparent" />
      )}
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}

/** Explains why a chart is empty instead of drawing zeros that look like real results. */
export function ChartEmpty({
  title,
  message,
  icon,
  className,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-purple/10 px-6 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-purple/[0.06] text-accent-purple">
        {icon ?? <BarChart3 size={18} aria-hidden="true" />}
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {message ? <p className="max-w-xs text-xs leading-5 text-slate-500">{message}</p> : null}
    </div>
  );
}

export function ChartError({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 px-6 text-center",
        className,
      )}
    >
      <TriangleAlert size={20} className="text-rose-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-rose-800">Couldn&apos;t load this chart</p>
      <p className="max-w-xs text-xs leading-5 text-rose-700">{message ?? "Please check your connection and try again."}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#ffffff] px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <RefreshCw size={12} aria-hidden="true" /> Try again
        </button>
      ) : null}
    </div>
  );
}

/** Compact segmented control for chart filters (period, category). */
export function ChartFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-accent-purple/15 bg-[#ffffff]/70 p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40",
              selected ? "bg-accent-purple text-[#fff] shadow-sm" : "text-slate-500 hover:text-accent-purple",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Horizontal progress indicator that grows from 0 to its value on first show and glides between values
 * afterwards. The global reduced-motion rule turns the transition off.
 */
export function ProgressBar({
  value,
  label,
  color,
  className,
  trackClassName,
}: {
  /** 0–100; null renders an empty track (no data). */
  value: number | null;
  label: string;
  color?: string;
  className?: string;
  trackClassName?: string;
}) {
  const target = value == null ? 0 : Math.max(0, Math.min(100, value));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(target)}
      aria-valuetext={value == null ? "No data yet" : `${Math.round(target)}%`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-accent-purple/[0.08]", trackClassName)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !color && "bg-gradient-to-r from-accent-purple to-accent-cyan",
          className,
        )}
        style={{ width: `${width}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </div>
  );
}
