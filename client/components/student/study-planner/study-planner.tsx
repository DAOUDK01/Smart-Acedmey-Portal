"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  History,
  ListTodo,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Database,
} from "lucide-react";
import { PremiumCard } from "@/components/premium-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  AI_STATUS_MESSAGE,
  PlannerApiError,
  WEEKDAYS,
  addDays,
  breakBetween,
  formatDay,
  formatMinutes,
  groupTasksByDate,
  plannerApi,
  startOfWeek,
  type GenerationResult,
  type PlanFormValues,
  type PlanSuggestion,
  type PlannerContext,
  type StudyPlan,
  type StudyTask,
} from "@/lib/study-planner";
import { PlanForm } from "./plan-form";
import { AddTaskDialog, ConfirmDialog, RescheduleDialog, SkipTaskDialog } from "./planner-dialogs";
import { TaskCard, type TaskActions } from "./task-card";

type DialogState =
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; tone?: "primary" | "danger"; onConfirm: () => Promise<void> }
  | { kind: "skip"; task: StudyTask }
  | { kind: "reschedule"; task: StudyTask }
  | { kind: "add" }
  | null;

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  detail?: string;
  tone: string;
}) {
  return (
    <div className="glass-chip rounded-3xl p-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", tone)}>
        <Icon size={18} />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your study planner">
      <div className="h-28 animate-pulse rounded-[28px] bg-accent-purple/[0.06]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-3xl bg-accent-purple/[0.06]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[28px] bg-accent-purple/[0.06]" />
    </div>
  );
}

export function StudyPlanner({
  onOpenLecture,
  onOpenMockExams,
}: {
  /** Opens the lecture in the portal's player; returns false when the lecture isn't available. */
  onOpenLecture: (lectureId: string) => boolean;
  onOpenMockExams: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [context, setContext] = useState<PlannerContext | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [contextData, active] = await Promise.all([plannerApi.context(), plannerApi.active()]);
      setContext(contextData);
      setPlan(active.plan);
      setFocusDate((current) => current ?? contextData.today);
      setStatus("ready");
    } catch (error) {
      setLoadError(errorMessage(error));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = plan?.today ?? context?.today ?? "";
  const date = focusDate ?? today;

  const announceGeneration = (result: GenerationResult) => {
    const message = AI_STATUS_MESSAGE[result.generation.aiStatus];
    if (result.generation.aiStatus === "used") toast.success(message);
    else toast.info(message);
    if (result.generation.unscheduledCount > 0) {
      toast.warning(`${result.generation.unscheduledCount} task(s) didn't fit your available time.`);
    }
  };

  const createPlan = async (values: PlanFormValues, replaceExisting = false) => {
    setBusy(true);
    try {
      const result = await plannerApi.create(values, replaceExisting);
      setPlan(result.plan);
      setEditing(false);
      setDialog(null);
      setFocusDate(result.plan.today);
      announceGeneration(result);
    } catch (error) {
      if (error instanceof PlannerApiError && error.status === 409 && error.code === "ACTIVE_PLAN_EXISTS") {
        setDialog({
          kind: "confirm",
          title: "Replace your current plan?",
          message: error.message,
          confirmLabel: "Replace plan",
          onConfirm: () => createPlan(values, true),
        });
      } else {
        setDialog(null);
        toast.error(errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const regenerate = (values: PlanFormValues) => {
    if (!plan) return;
    setDialog({
      kind: "confirm",
      title: "Regenerate your plan?",
      message:
        "Your pending tasks will be replaced with a new schedule starting today, using your latest quiz results and lecture progress. Completed and skipped tasks stay in your history.",
      confirmLabel: "Regenerate",
      onConfirm: async () => {
        setBusy(true);
        try {
          const result = await plannerApi.regenerate(plan.id, values);
          setPlan(result.plan);
          setEditing(false);
          setFocusDate(result.plan.today);
          announceGeneration(result);
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
          setDialog(null);
        }
      },
    });
  };

  const runTaskAction = async (task: StudyTask, action: () => Promise<StudyPlan>, success?: string) => {
    setBusyTaskId(task.id);
    try {
      setPlan(await action());
      if (success) toast.success(success);
      setDialog(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const taskActions: TaskActions = {
    onToggleComplete: (task) =>
      plan &&
      runTaskAction(
        task,
        () => (task.status === "COMPLETED" ? plannerApi.reopen(plan.id, task.id) : plannerApi.complete(plan.id, task.id)),
        task.status === "COMPLETED" ? "Task marked as not done." : "Nice work! Task completed.",
      ),
    onSkip: (task) => setDialog({ kind: "skip", task }),
    onReschedule: (task) => setDialog({ kind: "reschedule", task }),
    onRemove: (task) =>
      setDialog({
        kind: "confirm",
        title: "Remove this task?",
        message: `"${task.title}" will be removed from your plan. This can't be undone.`,
        confirmLabel: "Remove task",
        tone: "danger",
        onConfirm: async () => {
          if (plan) await runTaskAction(task, () => plannerApi.removeTask(plan.id, task.id), "Task removed.");
        },
      }),
    onOpenResource: (task) => {
      if (task.mockExamId) return onOpenMockExams();
      if (task.lectureId && !onOpenLecture(task.lectureId)) {
        toast.error("This lecture isn't available right now.");
      }
    },
  };

  const handleSuggestion = async (suggestion: PlanSuggestion) => {
    if (!plan) return;
    if (suggestion.type === "MISSED_TASKS") {
      setBusy(true);
      try {
        const result = await plannerApi.rescheduleMissed(plan.id);
        setPlan(result.plan);
        if (result.moved > 0) toast.success(`Moved ${result.moved} missed task(s) into your upcoming study time.`);
        if (result.unplaced > 0) toast.warning(`${result.unplaced} task(s) couldn't fit before the plan ends.`);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    setEditing(true);
  };

  const deletePlan = () => {
    if (!plan) return;
    setDialog({
      kind: "confirm",
      title: "Delete this study plan?",
      message: "The plan, its tasks and its history will be permanently deleted. Your lectures and quiz results are not affected.",
      confirmLabel: "Delete plan",
      tone: "danger",
      onConfirm: async () => {
        setBusy(true);
        try {
          await plannerApi.remove(plan.id);
          setPlan(null);
          setEditing(false);
          toast.success("Study plan deleted.");
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
          setDialog(null);
        }
      },
    });
  };

  const dayGroups = useMemo(() => {
    if (!plan || !date) return [];
    if (view === "day") return groupTasksByDate(plan.tasks, { from: date, to: date });
    const from = startOfWeek(date);
    return groupTasksByDate(plan.tasks, { from, to: addDays(from, 6) });
  }, [plan, date, view]);

  if (status === "loading") return <LoadingState />;

  if (status === "error" || !context) {
    return (
      <Alert variant="error" className="flex flex-wrap items-center justify-between gap-3">
        <span>Couldn&apos;t load your study planner. {loadError}</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw size={14} /> Try again
        </Button>
      </Alert>
    );
  }

  const dialogs = (
    <>
      {dialog?.kind === "confirm" && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          tone={dialog.tone}
          busy={busy || busyTaskId !== null}
          onConfirm={() => void dialog.onConfirm()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "skip" && plan && (
        <SkipTaskDialog
          task={dialog.task}
          busy={busyTaskId === dialog.task.id}
          onSkip={(reason) =>
            void runTaskAction(dialog.task, () => plannerApi.skip(plan.id, dialog.task.id, reason), "Task skipped.")
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reschedule" && plan && (
        <RescheduleDialog
          task={dialog.task}
          plan={plan}
          busy={busyTaskId === dialog.task.id}
          onSave={(newDate, time) =>
            void runTaskAction(
              dialog.task,
              () => plannerApi.reschedule(plan.id, dialog.task.id, newDate, time),
              `Moved to ${formatDay(newDate)}.`,
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "add" && plan && (
        <AddTaskDialog
          plan={plan}
          courses={context.courses}
          defaultDate={date}
          busy={busy}
          onAdd={async (task) => {
            setBusy(true);
            try {
              setPlan(await plannerApi.addTask(plan.id, task));
              toast.success("Task added to your plan.");
              setDialog(null);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  if (context.courses.length === 0) {
    return (
      <PremiumCard
        eyebrow="AI Study Planner"
        title="No courses to plan yet"
        description="Once you're enrolled in a published course, you can build a personalised study plan here from your lectures and quiz results."
      >
        <div className="flex items-center gap-3 rounded-2xl bg-accent-purple/[0.06] p-4 text-sm text-slate-500">
          <CalendarCheck className="h-4 w-4 shrink-0 text-accent-purple" />
          Check back after your courses are published.
        </div>
      </PremiumCard>
    );
  }

  if (!plan || editing) {
    return (
      <div className="space-y-6">
        <PremiumCard
          eyebrow="AI Study Planner"
          title={plan ? "Adjust your plan" : "Build your personal study plan"}
          description={
            plan
              ? "Change your goals or availability, then regenerate. Your finished work is kept."
              : "Tell us your goals and when you can study. We'll use your lecture progress and quiz results to schedule what matters most — weak topics first, with practice and revision built in."
          }
        >
          <PlanForm
            context={context}
            plan={plan}
            mode={plan ? "regenerate" : "create"}
            busy={busy}
            onSubmit={(values) => (plan ? regenerate(values) : void createPlan(values))}
            onCancel={plan ? () => setEditing(false) : undefined}
          />
        </PremiumCard>
        {dialogs}
      </div>
    );
  }

  const { progress } = plan;
  const studyDayNames = WEEKDAYS.filter((day) => plan.studyDays.includes(day.value)).map((day) => day.short).join(", ");
  const isStudyDay = (day: string) => plan.studyDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay());
  const weekStart = startOfWeek(date);

  return (
    <div className="space-y-6">
      <PremiumCard
        eyebrow="AI Study Planner"
        title={plan.title}
        description={`${formatDay(plan.startDate)} – ${formatDay(plan.endDate)}${plan.examDate ? ` · Exam on ${formatDay(plan.examDate, { weekday: "long", day: "numeric", month: "long" })}` : ""}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold",
                plan.generatedBy === "AI" ? "bg-accent-purple/10 text-accent-purple" : "bg-accent-cyan/10 text-accent-cyan",
              )}
            >
              {plan.generatedBy === "AI" ? <Sparkles size={12} /> : <Database size={12} />}
              {plan.generatedBy === "AI" ? "AI-assisted plan" : "Rule-based plan"}
            </span>
            <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-slate-600">
              {formatMinutes(plan.dailyMinutes)}/day · {studyDayNames} · from {plan.startTime}
            </span>
            {plan.targetScore && (
              <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-slate-600">Target {plan.targetScore}%</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "add" })} disabled={busy}>
              <Plus size={14} /> Add task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <RefreshCw size={14} /> Adjust &amp; regenerate
            </Button>
            <Button size="sm" variant="ghost" onClick={deletePlan} disabled={busy} aria-label="Delete plan">
              <Trash2 size={14} className="text-rose-600" />
              <span className="sr-only sm:not-sr-only">Delete</span>
            </Button>
          </div>
        </div>
        {plan.goal && <p className="mt-3 text-sm text-slate-600">Goal: {plan.goal}</p>}
      </PremiumCard>

      {plan.suggestions.map((suggestion) => (
        <Alert
          key={suggestion.type}
          variant={suggestion.type === "MISSED_TASKS" ? "warning" : "info"}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{suggestion.message}</span>
          <Button size="sm" variant="outline" className="shrink-0 bg-ink-900" onClick={() => void handleSuggestion(suggestion)} disabled={busy}>
            {suggestion.type === "MISSED_TASKS" ? "Move missed tasks" : "Review & regenerate"}
          </Button>
        </Alert>
      ))}

      <section aria-label="Plan overview" aria-live="polite" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          icon={ListTodo}
          label="Today's tasks"
          value={`${progress.todayCompleted}/${progress.todayTasks}`}
          detail={progress.todayTasks ? `${formatMinutes(progress.todayMinutes)} planned today` : "Nothing planned today"}
          tone="bg-accent-purple/10 text-accent-purple ring-accent-purple/20"
        />
        <StatTile
          icon={Clock}
          label="Planned time"
          value={formatMinutes(progress.totalMinutes)}
          detail={`${progress.totalTasks - progress.skippedTasks} tasks in total`}
          tone="bg-accent-cyan/10 text-accent-cyan ring-accent-cyan/20"
        />
        <StatTile
          icon={CheckCircle2}
          label="Completed"
          value={String(progress.completedTasks)}
          detail={`${formatMinutes(progress.completedMinutes)} studied`}
          tone="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
        />
        <StatTile
          icon={Target}
          label="Remaining"
          value={String(progress.remainingTasks)}
          detail={progress.missedTasks ? `${progress.missedTasks} missed` : progress.skippedTasks ? `${progress.skippedTasks} skipped` : undefined}
          tone="bg-amber-500/10 text-amber-600 ring-amber-500/20"
        />
        <div className="glass-chip col-span-2 rounded-3xl p-4 lg:col-span-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20">
            <TrendingUp size={18} />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-white">{progress.percent}%</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Plan progress</p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-accent-purple/[0.08]"
            role="progressbar"
            aria-label="Plan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div
              className="h-2 rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan transition-[width] duration-700 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Study schedule" className="glass-panel rounded-[28px] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-accent-purple" />
              <h3 className="text-lg font-semibold text-white">Schedule</h3>
            </div>
            <div className="inline-flex rounded-xl border border-accent-purple/15 p-1" role="tablist" aria-label="Schedule view">
              {(["day", "week"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={view === option}
                  onClick={() => setView(option)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                    view === option ? "bg-accent-purple text-[#fff]" : "text-slate-500 hover:text-accent-purple",
                  )}
                >
                  {option === "day" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFocusDate(addDays(date, view === "day" ? -1 : -7))}
              className="rounded-xl p-2 text-slate-500 hover:bg-accent-purple/[0.08] hover:text-accent-purple"
              aria-label={view === "day" ? "Previous day" : "Previous week"}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-bold text-white">
                {view === "day"
                  ? formatDay(date, { weekday: "long", day: "numeric", month: "long" })
                  : `${formatDay(weekStart, { day: "numeric", month: "short" })} – ${formatDay(addDays(weekStart, 6), { day: "numeric", month: "short" })}`}
              </p>
              {date !== today && (
                <button type="button" onClick={() => setFocusDate(today)} className="text-xs font-semibold text-accent-purple hover:underline">
                  Back to today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFocusDate(addDays(date, view === "day" ? 1 : 7))}
              className="rounded-xl p-2 text-slate-500 hover:bg-accent-purple/[0.08] hover:text-accent-purple"
              aria-label={view === "day" ? "Next day" : "Next week"}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={cn("mt-4", view === "week" && "grid gap-4 md:grid-cols-2")}>
            {dayGroups.map((group) => (
              <div key={group.date} className={cn(view === "week" && "rounded-2xl border border-accent-purple/10 p-3")}>
                {view === "week" && (
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setFocusDate(group.date);
                        setView("day");
                      }}
                      className={cn("text-sm font-bold hover:text-accent-purple", group.date === today ? "text-accent-purple" : "text-white")}
                    >
                      {formatDay(group.date)}
                      {group.date === today && " · Today"}
                    </button>
                    {group.minutes > 0 && (
                      <span className="text-xs text-slate-500">
                        {formatMinutes(group.completedMinutes)} / {formatMinutes(group.minutes)}
                      </span>
                    )}
                  </div>
                )}
                {group.tasks.length === 0 ? (
                  <p className="rounded-2xl border-2 border-dashed border-accent-purple/10 p-4 text-center text-xs text-slate-500">
                    {group.date < plan.startDate || group.date > plan.endDate
                      ? "Outside this plan's dates."
                      : isStudyDay(group.date)
                        ? "No study tasks on this day."
                        : "Rest day — not one of your study days."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {group.tasks.map((task, index) => {
                      const gap = index > 0 ? breakBetween(group.tasks[index - 1], task) : 0;
                      return (
                        <div key={task.id} className="space-y-2">
                          {view === "day" && gap >= 5 && (
                            <p className="flex items-center gap-2 pl-2 text-xs text-slate-400">
                              <Coffee size={12} /> {gap} min break
                            </p>
                          )}
                          <TaskCard task={task} compact={view === "week"} busy={busyTaskId === task.id} actions={taskActions} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <PremiumCard
            eyebrow="Recommendations"
            title="Why this plan"
            description="Every suggestion is based on your actual lectures, quiz results and dates."
          >
            {plan.aiSummary && (
              <div className="mb-3 rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-4 text-sm leading-6 text-slate-700">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-accent-purple">
                  <Sparkles size={12} /> AI summary
                </p>
                {plan.aiSummary}
              </div>
            )}
            {plan.recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">No specific recommendations — your plan follows your course order.</p>
            ) : (
              <ul className="space-y-2">
                {plan.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-3 rounded-2xl bg-accent-purple/[0.04] p-3 text-sm leading-6 text-slate-600">
                    {recommendation.source === "ai" ? (
                      <Sparkles size={14} className="mt-1 shrink-0 text-accent-purple" aria-label="AI tip" />
                    ) : (
                      <Database size={14} className="mt-1 shrink-0 text-accent-cyan" aria-label="From your data" />
                    )}
                    <span>{recommendation.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </PremiumCard>

          {plan.history.length > 0 && (
            <PremiumCard eyebrow="History" title="Plan changes">
              <ol className="space-y-3">
                {plan.history.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 text-sm">
                    <History size={14} className="mt-1 shrink-0 text-slate-400" />
                    <span>
                      <span className="text-slate-700">{entry.summary}</span>
                      <span className="block text-xs text-slate-400">
                        {new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </PremiumCard>
          )}
        </div>
      </div>
      {dialogs}
    </div>
  );
}
