"use client";

import {
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  FileQuestion,
  PlayCircle,
  RotateCcw,
  SkipForward,
  Trash2,
  Undo2,
  AlertCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  endTime,
  formatMinutes,
  type StudyTask,
  type StudyTaskType,
} from "@/lib/study-planner";

const TYPE_ICON: Record<StudyTaskType, typeof BookOpen> = {
  WATCH_LECTURE: PlayCircle,
  LEARN_TOPIC: BookOpen,
  PRACTICE_QUIZ: FileQuestion,
  REVISE: RotateCcw,
  REVIEW_MISTAKES: AlertCircle,
};

const PRIORITY_TONE = {
  HIGH: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  LOW: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
} as const;

export type TaskActions = {
  onToggleComplete: (task: StudyTask) => void;
  onSkip: (task: StudyTask) => void;
  onReschedule: (task: StudyTask) => void;
  onRemove: (task: StudyTask) => void;
  onOpenResource: (task: StudyTask) => void;
};

function IconAction({
  label,
  onClick,
  disabled,
  children,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger" ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-accent-purple/[0.08] hover:text-accent-purple",
      )}
    >
      {children}
    </button>
  );
}

export function TaskCard({
  task,
  busy,
  compact,
  readOnly,
  actions,
}: {
  task: StudyTask;
  busy?: boolean;
  compact?: boolean;
  readOnly?: boolean;
  actions: TaskActions;
}) {
  const Icon = TYPE_ICON[task.type];
  const done = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const hasResource = Boolean(task.lectureId || task.mockExamId);

  return (
    <article
      aria-label={task.title}
      className={cn(
        "rounded-2xl border p-3 transition-colors sm:p-4",
        done
          ? "border-emerald-500/20 bg-emerald-500/[0.05]"
          : skipped
            ? "border-slate-200 bg-slate-50/70"
            : task.isMissed
              ? "border-amber-400/40 bg-amber-50/60"
              : "border-accent-purple/10 bg-accent-purple/[0.04] hover:bg-accent-purple/[0.08]",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => actions.onToggleComplete(task)}
          disabled={busy || readOnly || skipped}
          aria-pressed={done}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as complete`}
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/30 disabled:cursor-not-allowed",
            done
              ? "border-emerald-500 bg-emerald-500 text-[#fff]"
              : "border-accent-purple/30 bg-ink-900 text-transparent hover:border-accent-purple",
            skipped && "opacity-40",
          )}
        >
          <Check size={14} strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className={cn("text-sm font-bold text-white", (done || skipped) && "text-slate-500 line-through decoration-slate-300")}>
              {task.title}
            </h4>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset", PRIORITY_TONE[task.priority])}>
              {PRIORITY_LABEL[task.priority]}
            </span>
            {task.isMissed && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                Missed
              </span>
            )}
            {done && task.autoCompleted && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                Auto-detected
              </span>
            )}
            {skipped && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                Skipped
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-accent-purple">
              <Icon size={12} /> {TASK_TYPE_LABEL[task.type]}
            </span>
            <span className="truncate">{task.subject}</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {task.startTime ? `${task.startTime}–${endTime(task.startTime, task.durationMinutes)} · ` : ""}
              {formatMinutes(task.durationMinutes)}
            </span>
          </div>

          {!compact && task.reason && <p className="mt-2 text-xs leading-5 text-slate-600">{task.reason}</p>}
          {skipped && task.skipReason && <p className="mt-1 text-xs italic text-slate-500">Reason: {task.skipReason}</p>}

          {!readOnly && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {hasResource && !skipped && (
                <IconAction
                  label={task.mockExamId ? "Open mock exams" : task.type === "PRACTICE_QUIZ" ? "Open lecture quiz" : "Open lecture"}
                  onClick={() => actions.onOpenResource(task)}
                  disabled={busy}
                >
                  {task.mockExamId || task.type === "PRACTICE_QUIZ" ? <FileQuestion size={14} /> : <PlayCircle size={14} />}
                  <span>{task.mockExamId ? "Open exam" : task.type === "PRACTICE_QUIZ" ? "Open quiz" : "Open lecture"}</span>
                </IconAction>
              )}
              {!done && (
                <IconAction label={`Reschedule "${task.title}"`} onClick={() => actions.onReschedule(task)} disabled={busy}>
                  <CalendarClock size={14} />
                  <span className={cn(compact && "sr-only")}>{skipped ? "Bring back" : "Reschedule"}</span>
                </IconAction>
              )}
              {!done && !skipped && (
                <IconAction label={`Skip "${task.title}"`} onClick={() => actions.onSkip(task)} disabled={busy}>
                  <SkipForward size={14} />
                  <span className={cn(compact && "sr-only")}>Skip</span>
                </IconAction>
              )}
              {done && (
                <IconAction label={`Mark "${task.title}" as not done`} onClick={() => actions.onToggleComplete(task)} disabled={busy}>
                  <Undo2 size={14} />
                  <span className={cn(compact && "sr-only")}>Undo</span>
                </IconAction>
              )}
              {!done && (
                <IconAction label={`Remove "${task.title}"`} onClick={() => actions.onRemove(task)} disabled={busy} tone="danger">
                  <Trash2 size={14} />
                  <span className="sr-only">Remove</span>
                </IconAction>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
