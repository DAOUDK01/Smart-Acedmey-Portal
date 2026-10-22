"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, Flame, LineChart as LineChartIcon, Target, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PremiumCard } from "@/components/premium-card";
import { Select } from "@/components/ui/input";
import { ChartTooltip, ScoreStatusLegend } from "@/components/charts/chart-parts";
import { ChartEmpty, ChartError, ChartFilter, ChartSkeleton, ProgressBar } from "@/components/charts/chart-states";
import {
  CHART_COLORS,
  CHART_INITIAL_DIMENSION,
  CHART_RESIZE_DEBOUNCE_MS,
  SCORE_STATUS,
  axisProps,
  gridProps,
  percent,
  scoreStatus,
} from "@/lib/chart-theme";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";
import {
  lectureCompletion,
  subjectAdvice,
  weeklyScoreTrend,
  type AttemptHistoryItem,
  type SubjectStat,
} from "@/lib/student-performance";

export type PerformanceData =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; history: AttemptHistoryItem[]; subjects: SubjectStat[] };

type Period = "4" | "8" | "12";
const PERIODS: { value: Period; label: string }[] = [
  { value: "4", label: "4 wks" },
  { value: "8", label: "8 wks" },
  { value: "12", label: "12 wks" },
];

function ProgressRing({ value, label }: { value: number; label: string }) {
  const count = useCountUp(value);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-36 w-36" role="img" aria-label={`${label}: ${Math.round(value)}%`}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
        <defs>
          <linearGradient id="perf-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} />
            <stop offset="100%" stopColor={CHART_COLORS.secondary} />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(124,58,237,0.1)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="url(#perf-ring-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, count) / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-3xl font-bold tracking-tight text-slate-900">{count}%</span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
    </div>
  );
}

function ChartBody({ data, children, empty }: { data: PerformanceData; children: ReactNode; empty: ReactNode | null }) {
  if (data.status === "loading") return <ChartSkeleton className="mt-4" />;
  if (data.status === "error") return null; // shown once above both charts
  return <>{empty ?? children}</>;
}

export function StudentPerformance({
  data,
  onRetry,
  progressPercentage,
  averageScore,
  failedQuizzes,
  streakDays,
  weakTopics,
  recommendations,
  quizzesByCourse,
}: {
  data: PerformanceData;
  onRetry: () => void;
  progressPercentage: number;
  averageScore: number;
  failedQuizzes: number;
  streakDays: number;
  weakTopics: string[];
  recommendations: string[];
  /** Practice questions available per course id (approved checkpoint quizzes). */
  quizzesByCourse: Record<string, number>;
}) {
  const animation = useChartAnimation();
  const [period, setPeriod] = useState<Period>("8");
  const [selectedId, setSelectedId] = useState<string>("all");
  const avgScoreCount = useCountUp(averageScore);

  const subjects = data.status === "ready" ? data.subjects : [];
  const selected = subjects.find((subject) => subject.id === selectedId) ?? null;
  const scored = subjects.filter((subject) => subject.averageScore != null && subject.quizAttempts > 0);
  const unscored = subjects.filter((subject) => !scored.includes(subject));

  const trend = useMemo(
    () =>
      data.status === "ready"
        ? weeklyScoreTrend(data.history, Number(period), { courseId: selected?.id ?? null })
        : [],
    [data, period, selected],
  );
  const trendAnswers = trend.reduce((sum, week) => sum + week.answers, 0);
  const trendCorrect = trend.reduce((sum, week) => sum + week.correct, 0);
  const visibleSubjects = selected ? [selected] : subjects;

  return (
    <div className="space-y-6">
      <PremiumCard
        eyebrow="Performance Center"
        title="Detailed Subject Report"
        description="Pick a subject to focus every chart on it, or compare everything at once."
      >
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <label className="sr-only" htmlFor="performance-subject">
              Subject
            </label>
            <Select id="performance-subject" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="all">All Subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </Select>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-accent-purple/[0.06] p-5">
                <ProgressRing value={progressPercentage} label="Progress" />
              </div>
              <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-accent-cyan" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Average Score</p>
                </div>
                <p className="mt-2 text-3xl font-bold text-accent-cyan">{avgScoreCount}%</p>
                <p className="mt-1 text-xs text-slate-500">
                  {failedQuizzes
                    ? `${failedQuizzes} quiz attempt${failedQuizzes === 1 ? "" : "s"} need a retry`
                    : "Steady across your recent checkpoints"}
                </p>
              </div>
              <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Weak Topics</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {weakTopics.length ? (
                    weakTopics.map((topic) => (
                      <span key={topic} className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                        {topic}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">No weak topics flagged</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {data.status === "error" && <ChartError className="h-auto py-6" message={data.message} onRetry={onRetry} />}

            <div className="grid gap-6">
              <PremiumCard
                eyebrow="Trend"
                title="Quiz Score Trend"
                description={
                  data.status === "ready" && trendAnswers > 0
                    ? `${trendCorrect} of ${trendAnswers} checkpoint answers correct${selected ? ` in ${selected.title}` : ""}.`
                    : "Weekly share of checkpoint answers you got right."
                }
              >
                <div className="mt-3 flex justify-end">
                  <ChartFilter label="Trend period" options={PERIODS} value={period} onChange={setPeriod} />
                </div>
                <ChartBody
                  data={data}
                  empty={
                    trendAnswers === 0 ? (
                      <ChartEmpty
                        className="mt-2 h-56"
                        title="No quiz answers in this period"
                        message="Answer checkpoint questions inside your lectures and your weekly scores will show up here."
                        icon={<LineChartIcon size={18} aria-hidden="true" />}
                      />
                    ) : null
                  }
                >
                  <div
                    className="mt-2 h-56"
                    role="img"
                    aria-label={`Weekly score: ${trend.map((w) => `${w.label} ${w.average == null ? "no answers" : `${w.average}%`}`).join(", ")}`}
                  >
                    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                      <LineChart data={trend} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid {...gridProps} vertical={false} />
                        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
                        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={40} tickFormatter={percent} {...axisProps} />
                        <ReferenceLine
                          y={60}
                          stroke={CHART_COLORS.axis}
                          strokeDasharray="2 4"
                          strokeOpacity={0.55}
                          label={{ value: "60%", position: "insideTopRight", fill: CHART_COLORS.axis, fontSize: 10 }}
                        />
                        <Tooltip
                          cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: "3 3" }}
                          content={({ active, payload, label }) => {
                            const week = payload?.[0]?.payload as (typeof trend)[number] | undefined;
                            if (!active || !week) return null;
                            return (
                              <ChartTooltip
                                active
                                label={`Week of ${label}`}
                                payload={[
                                  week.average == null
                                    ? { name: "No answers", value: "—", color: CHART_COLORS.grid, dataKey: "none" }
                                    : { name: `Score (${week.correct}/${week.answers} correct)`, value: `${week.average}%`, color: CHART_COLORS.primary, dataKey: "average" },
                                ]}
                              />
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="average"
                          stroke={CHART_COLORS.primary}
                          strokeWidth={2}
                          connectNulls={false}
                          dot={{ r: 4, strokeWidth: 2, fill: CHART_COLORS.surface }}
                          activeDot={{ r: 6, strokeWidth: 2, stroke: CHART_COLORS.surface }}
                          {...animation}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Gaps are weeks with no answers. The dotted line marks 60% — below it, revise the topic.</p>
                </ChartBody>
              </PremiumCard>

              <PremiumCard
                eyebrow="Scores"
                title="Subject Comparison"
                description="Your average checkpoint score per subject. Tap a bar to focus it."
              >
                <ChartBody
                  data={data}
                  empty={
                    scored.length === 0 ? (
                      <ChartEmpty
                        className="mt-4 h-56"
                        title="No subject scores yet"
                        message="Scores appear once you answer checkpoint quizzes in a course."
                        icon={<BookOpen size={18} aria-hidden="true" />}
                      />
                    ) : null
                  }
                >
                  <div
                    className="mt-4"
                    style={{ height: Math.max(140, scored.length * 44 + 40) }}
                    role="img"
                    aria-label={`Average score by subject: ${scored.map((s) => `${s.title} ${s.averageScore}%`).join(", ")}`}
                  >
                    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                      <BarChart data={scored} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap="30%">
                        <CartesianGrid {...gridProps} horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={percent} {...axisProps} />
                        <YAxis
                          type="category"
                          dataKey="title"
                          width={150}
                          {...axisProps}
                          tickFormatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)}
                        />
                        <Tooltip
                          cursor={{ fill: CHART_COLORS.cursorFill }}
                          content={
                            <ChartTooltip
                              names={{ averageScore: "Average score" }}
                              valueFormatter={(value) => `${value}%`}
                              colorFor={(entry) => SCORE_STATUS[scoreStatus(Number(entry.payload?.averageScore ?? 0))].color}
                            />
                          }
                        />
                        <Bar
                          dataKey="averageScore"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={22}
                          minPointSize={3}
                          cursor="pointer"
                          onClick={(entry: { id?: string }) => entry?.id && setSelectedId(selectedId === entry.id ? "all" : entry.id)}
                          {...animation}
                        >
                          {scored.map((subject) => (
                            <Cell
                              key={subject.id}
                              fill={SCORE_STATUS[scoreStatus(subject.averageScore ?? 0)].color}
                              fillOpacity={selected && selected.id !== subject.id ? 0.3 : 1}
                            />
                          ))}
                          <LabelList
                            dataKey="averageScore"
                            position="right"
                            offset={8}
                            className="fill-slate-700 text-[11px] font-semibold tabular-nums"
                            formatter={(value: unknown) => `${value}%`}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ScoreStatusLegend className="mt-3" />
                  {unscored.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">No quiz results yet: {unscored.map((s) => s.title).join(", ")}.</p>
                  )}
                </ChartBody>
              </PremiumCard>
            </div>

            {data.status === "ready" && (
              <div className="space-y-3">
                {visibleSubjects.map((subject) => {
                  const isFocused = selected?.id === subject.id;
                  const completion = lectureCompletion(subject);
                  const score = subject.quizAttempts > 0 ? subject.averageScore : null;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      aria-pressed={isFocused}
                      onClick={() => setSelectedId(isFocused ? "all" : subject.id)}
                      className={cn(
                        "group w-full rounded-2xl border p-4 text-left transition-all duration-200",
                        isFocused
                          ? "border-accent-purple bg-accent-purple/[0.08] ring-1 ring-accent-purple/30"
                          : "border-accent-purple/10 bg-accent-purple/[0.06] hover:-translate-y-0.5 hover:border-accent-purple/25 hover:bg-accent-purple/[0.1] active:scale-[0.99]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{subject.title}</h4>
                            {isFocused && (
                              <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-purple">
                                Focused
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{subjectAdvice(score)}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {quizzesByCourse[subject.id] ?? 0} practice question{(quizzesByCourse[subject.id] ?? 0) === 1 ? "" : "s"} available
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-right">
                          {score != null ? (
                            <p className="text-2xl font-bold tabular-nums" style={{ color: SCORE_STATUS[scoreStatus(score)].color }}>
                              {score}%
                            </p>
                          ) : (
                            <p className="text-xs font-semibold text-slate-400">No score yet</p>
                          )}
                          <ArrowRight size={16} className="text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                            <span>Lectures finished</span>
                            <span className="tabular-nums">
                              {subject.completedLectures}/{subject.lectureCount}
                            </span>
                          </div>
                          <ProgressBar value={completion} label={`${subject.title} lectures finished`} />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                            <span>Average score</span>
                            <span className="tabular-nums">
                              {subject.quizAttempts} answer{subject.quizAttempts === 1 ? "" : "s"}
                            </span>
                          </div>
                          <ProgressBar
                            value={score}
                            color={score != null ? SCORE_STATUS[scoreStatus(score)].color : undefined}
                            label={`${subject.title} average score`}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
                {subjects.length === 0 && (
                  <ChartEmpty className="h-40" title="No subjects yet" message="Your enrolled courses will appear here once they are published." />
                )}
              </div>
            )}

            <PremiumCard eyebrow="Recommendations" title="Smart Next Steps" description="Action plan based on your recent learning signals.">
              <div className="space-y-3">
                {recommendations.map((recommendation) => (
                  <div
                    key={recommendation}
                    className="flex items-start gap-3 rounded-2xl bg-accent-purple/[0.06] p-4 text-sm text-slate-600 transition-all duration-200 hover:bg-accent-purple/[0.1]"
                  >
                    <Flame size={16} className="mt-0.5 shrink-0 text-amber-500" />
                    <span className="leading-relaxed">{recommendation}</span>
                  </div>
                ))}
              </div>
            </PremiumCard>

            <div className="flex items-center gap-3 rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-4 text-sm text-slate-600">
              <TrendingUp className="h-4 w-4 shrink-0 text-accent-purple" />
              <span>
                {streakDays
                  ? `You're on a ${streakDays}-day streak — one lecture today keeps the momentum.`
                  : "Start a study streak today with one lecture or quiz."}
              </span>
            </div>
          </div>
        </div>
      </PremiumCard>
    </div>
  );
}
