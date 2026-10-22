"use client";

import type { ReactNode } from "react";
import { CalendarDays, LineChart as LineChartIcon } from "lucide-react";
import { PremiumCard } from "../premium-card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  LabelList,
} from "recharts";
import { ChartTooltip } from "@/components/charts/chart-parts";
import { ChartEmpty, ChartError, ChartSkeleton } from "@/components/charts/chart-states";
import {
  CHART_COLORS,
  CHART_INITIAL_DIMENSION,
  CHART_RESIZE_DEBOUNCE_MS,
  SCORE_STATUS,
  axisProps,
  gridProps,
  percent,
} from "@/lib/chart-theme";
import { useChartAnimation } from "@/lib/use-chart-animation";
import type { ChartStatus } from "../admin/admin-dashboard";

type PerformanceItem = { name: string; score: number };
type ActivityItem = { name: string; active: number };

/**
 * The stats API labels buckets "Week N" relative to now (6 = this week, older weeks can go negative).
 * Show them as "This week" / "3 wks ago" instead; the values themselves are untouched.
 */
export function relativeWeekLabel(name: string) {
  const match = /^Week (-?\d+)$/.exec(name);
  if (!match) return name;
  const weeksAgo = 6 - Number(match[1]);
  if (weeksAgo <= 0) return "This week";
  return weeksAgo === 1 ? "1 wk ago" : `${weeksAgo} wks ago`;
}

/** The score below which the portal flags work as "needs work" (same band as the score legend). */
const NEEDS_WORK_BELOW = 60;

export function TeacherDashboard({
  stats,
  performanceData = [],
  studentActivityData = [],
  chartStatus = "ready",
  onRetry,
}: {
  stats: {
    totalStudents: number;
    activeStudents: number;
    totalCourses: number;
    totalLectures: number;
    avgQuizScore: number;
  };
  performanceData?: PerformanceItem[];
  studentActivityData?: ActivityItem[];
  chartStatus?: ChartStatus;
  onRetry?: () => void;
}) {
  const animation = useChartAnimation(750);
  // The stats API sends a single "No data" row when nobody has answered a quiz yet.
  const performance = performanceData
    .filter((item) => item.name !== "No data")
    .map((item) => ({ ...item, name: relativeWeekLabel(item.name) }));
  const activity = studentActivityData;
  const hasActivity = activity.some((item) => item.active > 0);
  const busiest = hasActivity ? activity.reduce((best, item) => (item.active > best.active ? item : best)) : null;
  const latest = performance.at(-1);

  const state = (
    isEmpty: boolean,
    variant: "bars" | "line",
    empty: { title: string; message: string; icon: ReactNode },
  ) => {
    if (chartStatus === "loading") return <ChartSkeleton className="mt-4" variant={variant} />;
    if (chartStatus === "error") return <ChartError className="mt-4" onRetry={onRetry} />;
    if (isEmpty) return <ChartEmpty className="mt-4" {...empty} />;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="motion-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <PremiumCard title={stats.totalStudents.toString()} description="Total Students" />
        <PremiumCard title={stats.activeStudents.toString()} description="Active Students" />
        <PremiumCard title={stats.totalCourses.toString()} description="Total Courses" />
        <PremiumCard title={stats.totalLectures.toString()} description="Total Lectures" />
        <PremiumCard title={`${stats.avgQuizScore}%`} description="Avg Quiz Score" />
      </div>

      <div className="motion-stagger grid gap-6 lg:grid-cols-2">
        <PremiumCard
          eyebrow="Analytics"
          title="Class Performance"
          description={
            chartStatus === "ready" && latest
              ? `Average checkpoint score per week with answers — ${latest.name.toLowerCase()}: ${latest.score}%.`
              : "Average quiz scores over time."
          }
        >
          {state(performance.length === 0, "line", {
            title: "No quiz results yet",
            message: "Weekly averages appear once students start answering checkpoint quizzes.",
            icon: <LineChartIcon size={18} aria-hidden="true" />,
          }) ?? (
            <>
              <div
                className="mt-4 h-60 w-full"
                role="img"
                aria-label={`Average score by week: ${performance.map((p) => `${p.name} ${p.score}%`).join(", ")}`}
              >
                <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                  <AreaChart data={performance} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="teacher-score-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} vertical={false} />
                    <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={40} tickFormatter={percent} {...axisProps} />
                    <ReferenceLine
                      y={NEEDS_WORK_BELOW}
                      stroke={SCORE_STATUS["needs-work"].color}
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      ifOverflow="extendDomain"
                    />
                    <Tooltip
                      cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: "3 3" }}
                      content={<ChartTooltip names={{ score: "Average score" }} valueFormatter={percent} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke={CHART_COLORS.primary}
                      fill="url(#teacher-score-fill)"
                      strokeWidth={2}
                      dot={performance.length <= 8 ? { r: 3.5, strokeWidth: 2, fill: CHART_COLORS.surface } : false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.surface }}
                      {...animation}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: SCORE_STATUS["needs-work"].color }} />
                Below {NEEDS_WORK_BELOW}% the class may need a revision session.
              </p>
            </>
          )}
        </PremiumCard>

        <PremiumCard
          eyebrow="Engagement"
          title="Student Activity"
          description={
            chartStatus === "ready" && busiest
              ? `Students by the weekday they were last active — busiest on ${busiest.name}.`
              : "Students by the weekday they were last active."
          }
        >
          {state(!hasActivity, "bars", {
            title: "No student activity yet",
            message: "This fills in as students watch lectures and answer quizzes.",
            icon: <CalendarDays size={18} aria-hidden="true" />,
          }) ?? (
            <div
              className="mt-4 h-64 w-full"
              role="img"
              aria-label={`Students last active by weekday: ${activity.map((a) => `${a.name} ${a.active}`).join(", ")}`}
            >
              <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                <BarChart data={activity} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis allowDecimals={false} width={32} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: CHART_COLORS.cursorFill }}
                    content={<ChartTooltip names={{ active: "Students" }} />}
                  />
                  <Bar dataKey="active" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} maxBarSize={32} {...animation}>
                    <LabelList
                      dataKey="active"
                      position="top"
                      offset={6}
                      className="fill-slate-600 text-[11px] font-semibold tabular-nums"
                      formatter={(value: unknown) => (Number(value) > 0 ? String(value) : "")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </PremiumCard>
      </div>
    </div>
  );
}
