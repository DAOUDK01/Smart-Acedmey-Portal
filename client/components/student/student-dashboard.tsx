"use client";

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Flame,
  PlayCircle,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { PremiumCard } from "../premium-card";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";

type StudentStats = {
  progress: number;
  completedLectures: number;
  totalLectures: number;
  quizAvg: number;
  streakDays: number;
};

function StatCard({
  icon: Icon,
  value,
  label,
  suffix,
  tone,
  onClick,
}: {
  icon: typeof TrendingUp;
  value: string;
  label: string;
  suffix?: string;
  tone: "purple" | "cyan" | "emerald" | "amber";
  onClick?: () => void;
}) {
  const tones = {
    purple:
      "bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20",
    cyan: "bg-accent-cyan/10 text-accent-cyan ring-1 ring-inset ring-accent-cyan/20",
    emerald:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "glass-chip group relative flex flex-col items-start overflow-hidden rounded-3xl p-5 text-left transition-all duration-200",
        onClick && "hover:-translate-y-1 hover:border-accent-purple/30 active:scale-[0.98]",
        !onClick && "cursor-default",
      )}
    >
      <div className="flex w-full items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl backdrop-blur-sm", tones[tone])}>
          <Icon size={20} />
        </div>
        {onClick && (
          <ArrowRight
            size={16}
            className="text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-purple"
          />
        )}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
        {value}
        {suffix ? <span className="text-lg text-slate-500">{suffix}</span> : null}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
    </button>
  );
}

export function StudentDashboard({
  stats,
  onNavigate,
}: {
  stats: StudentStats;
  onNavigate?: (tab: string) => void;
}) {
  const progress = useCountUp(stats.progress);
  const quizAvg = useCountUp(stats.quizAvg);
  const streak = useCountUp(stats.streakDays ?? 0);

  const quickActions = [
    {
      tab: "courses",
      label: "Continue learning",
      hint: "Resume your lectures and checkpoint quizzes",
      icon: PlayCircle,
      tone: "bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20",
    },
    {
      tab: "exams",
      label: "Practice mock exams",
      hint: "Test yourself before the real thing",
      icon: Target,
      tone: "bg-accent-cyan/10 text-accent-cyan ring-1 ring-inset ring-accent-cyan/20",
    },
    {
      tab: "progress",
      label: "Review performance",
      hint: "See subject scores, trends and next steps",
      icon: BarChart3,
      tone: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          value={`${progress}`}
          suffix="%"
          label="Overall Progress"
          tone="purple"
          onClick={onNavigate ? () => onNavigate("progress") : undefined}
        />
        <StatCard
          icon={BookOpen}
          value={`${stats.completedLectures}/${stats.totalLectures}`}
          label="Lectures Completed"
          tone="cyan"
          onClick={onNavigate ? () => onNavigate("courses") : undefined}
        />
        <StatCard
          icon={Target}
          value={`${quizAvg}`}
          suffix="%"
          label="Quiz Average"
          tone="emerald"
          onClick={onNavigate ? () => onNavigate("exams") : undefined}
        />
        <StatCard
          icon={Flame}
          value={`${streak}`}
          suffix=" days"
          label="Study Streak"
          tone="amber"
          onClick={onNavigate ? () => onNavigate("courses") : undefined}
        />
      </div>

      <PremiumCard
        eyebrow="Overview"
        title="Today's Learning Focus"
        description="Pick up where you left off — your progress is saved automatically."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.tab}
              type="button"
              onClick={() => onNavigate?.(action.tab)}
              className={cn(
                "group flex items-start gap-3 rounded-2xl bg-accent-purple/[0.06] p-4 text-left transition-all duration-200",
                "hover:-translate-y-0.5 hover:bg-accent-purple/[0.1] active:scale-[0.98]",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl backdrop-blur-sm transition-transform duration-200 group-hover:scale-110",
                  action.tone,
                )}
              >
                <action.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{action.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {action.hint}
                </p>
              </div>
            </button>
          ))}
        </div>
      </PremiumCard>

      <div className="flex items-center gap-3 rounded-2xl border border-accent-cyan/15 bg-accent-cyan/[0.06] p-4 text-sm text-slate-600">
        <Sparkles className="h-4 w-4 shrink-0 text-accent-cyan" />
        <span>
          Tip: keep your streak alive with one lecture or quiz a day — consistency
          beats intensity.
        </span>
      </div>
    </div>
  );
}