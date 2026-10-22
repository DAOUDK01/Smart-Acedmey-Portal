import { AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCORE_STATUS, type ScoreStatus } from "@/lib/chart-theme";

type TooltipEntry = {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  fill?: string;
  stroke?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

export type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Readable name per data key, e.g. { score: "Avg score" }. */
  names?: Record<string, string>;
  valueFormatter?: (value: number | string) => string;
  /** Swatch color per entry when it differs from the series color (e.g. per-bar fills). */
  colorFor?: (entry: TooltipEntry) => string | undefined;
};

/**
 * Light tooltip card that matches the app surface. Text always uses ink colors; the series color only
 * appears on the swatch, so values stay readable whatever the series color is.
 */
export function ChartTooltip({ active, label, payload, names, valueFormatter, colorFor }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip min-w-[9rem] rounded-xl border border-slate-200 bg-[#ffffff]/95 px-3 py-2 shadow-lg shadow-slate-900/10 backdrop-blur">
      {label !== undefined && label !== "" ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const swatch = colorFor?.(entry) ?? entry.color ?? entry.fill ?? entry.stroke;
          const raw = Array.isArray(entry.value) ? entry.value.join(" – ") : entry.value ?? "";
          return (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#ffffff]"
                style={{ backgroundColor: swatch }}
              />
              <span className="text-slate-600">{names?.[key] ?? entry.name ?? key}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">
                {valueFormatter ? valueFormatter(raw) : raw}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_ICON: Record<ScoreStatus, typeof CheckCircle2> = {
  strong: CheckCircle2,
  fair: CircleDot,
  "needs-work": AlertTriangle,
};

/** Legend for score-band colors: icon + label + swatch, so the band never relies on color alone. */
export function ScoreStatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600", className)}>
      {(Object.keys(SCORE_STATUS) as ScoreStatus[]).map((status) => {
        const Icon = STATUS_ICON[status];
        return (
          <li key={status} className="inline-flex items-center gap-1.5">
            <Icon aria-hidden className="h-3.5 w-3.5" style={{ color: SCORE_STATUS[status].color }} />
            {SCORE_STATUS[status].label}
          </li>
        );
      })}
    </ul>
  );
}
