"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, GraduationCap, Info, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  TIME_PRESETS,
  WEEKDAYS,
  addDays,
  formatMinutes,
  type PlanFormValues,
  type PlannerContext,
  type StudyPlan,
  type TopicInput,
} from "@/lib/study-planner";

const MINUTE_PRESETS = [30, 45, 60, 90, 120, 180];
const MAX_COURSES = 6;
const CONFIDENCE = [
  { value: "", label: "Confidence: not sure" },
  { value: "1", label: "1 · Very low" },
  { value: "2", label: "2 · Low" },
  { value: "3", label: "3 · Okay" },
  { value: "4", label: "4 · Good" },
  { value: "5", label: "5 · Very good" },
];

export function initialFormValues(context: PlannerContext, plan?: StudyPlan | null): PlanFormValues {
  if (plan) {
    const known = new Set(context.courses.map((course) => course.id));
    return {
      courseIds: plan.courseIds.filter((id) => known.has(id)),
      topics: plan.topics.filter((topic) => known.has(topic.courseId)),
      examDate: plan.examDate && plan.examDate > context.today ? plan.examDate : null,
      dailyMinutes: plan.dailyMinutes,
      studyDays: plan.studyDays,
      startTime: plan.startTime,
      targetScore: plan.targetScore,
      goal: plan.goal ?? "",
    };
  }
  return {
    courseIds: context.courses.slice(0, MAX_COURSES).map((course) => course.id),
    topics: [],
    examDate: null,
    dailyMinutes: 60,
    studyDays: [1, 2, 3, 4, 5],
    startTime: "18:00",
    targetScore: null,
    goal: "",
  };
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-bold text-white">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-purple/10 text-xs text-accent-purple">
          {step}
        </span>
        {title}
      </legend>
      {hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </label>
  );
}

export function PlanForm({
  context,
  plan,
  mode,
  busy,
  onSubmit,
  onCancel,
}: {
  context: PlannerContext;
  plan?: StudyPlan | null;
  mode: "create" | "regenerate";
  busy?: boolean;
  onSubmit: (values: PlanFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<PlanFormValues>(() => initialFormValues(context, plan));
  const [customTopic, setCustomTopic] = useState<Record<string, string>>({});
  const [customMinutes, setCustomMinutes] = useState(!MINUTE_PRESETS.includes(values.dailyMinutes));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PlanFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const selectedCourses = useMemo(
    () => context.courses.filter((course) => values.courseIds.includes(course.id)),
    [context.courses, values.courseIds],
  );

  const toggleCourse = (id: string) => {
    if (values.courseIds.includes(id)) {
      set({
        courseIds: values.courseIds.filter((courseId) => courseId !== id),
        topics: values.topics.filter((topic) => topic.courseId !== id),
      });
    } else if (values.courseIds.length < MAX_COURSES) {
      set({ courseIds: [...values.courseIds, id] });
    }
  };

  const hasTopic = (courseId: string, name: string) =>
    values.topics.some((topic) => topic.courseId === courseId && topic.name.toLowerCase() === name.toLowerCase());

  const addTopic = (courseId: string, name: string) => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed || hasTopic(courseId, trimmed) || values.topics.length >= 40) return;
    set({ topics: [...values.topics, { courseId, name: trimmed.slice(0, 120), confidence: null }] });
  };

  const updateTopic = (target: TopicInput, patch: Partial<TopicInput>) =>
    set({ topics: values.topics.map((topic) => (topic === target ? { ...topic, ...patch } : topic)) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (values.courseIds.length === 0) return setError("Choose at least one course.");
    if (values.studyDays.length === 0) return setError("Choose at least one study day.");
    if (!Number.isInteger(values.dailyMinutes) || values.dailyMinutes < 15 || values.dailyMinutes > 480) {
      return setError("Daily study time must be between 15 and 480 minutes.");
    }
    if (values.examDate && values.examDate <= context.today) return setError("The exam date must be after today.");
    setError(null);
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-8" aria-label={mode === "create" ? "Create study plan" : "Regenerate study plan"}>
      <Section
        step={1}
        title="Subjects"
        hint={
          context.enrollmentSource === "admission"
            ? "These are the courses you're enrolled in. Your lecture progress and quiz results are loaded automatically."
            : "These are the published courses available to you. Your lecture progress and quiz results are loaded automatically."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {context.courses.map((course) => {
            const selected = values.courseIds.includes(course.id);
            const disabled = !selected && values.courseIds.length >= MAX_COURSES;
            return (
              <button
                key={course.id}
                type="button"
                role="checkbox"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => toggleCourse(course.id)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                  selected
                    ? "border-accent-purple bg-accent-purple/5 ring-1 ring-accent-purple"
                    : "border-accent-purple/10 bg-accent-purple/[0.04] hover:bg-accent-purple/[0.08]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                    selected ? "border-accent-purple bg-accent-purple text-[#fff]" : "border-accent-purple/30",
                  )}
                >
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-white">
                    <GraduationCap size={14} className="shrink-0 text-accent-purple" />
                    <span className="truncate">{course.title}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {course.lectureCount > 0
                      ? `${course.completedLectures}/${course.lectureCount} lectures finished`
                      : "No published lectures yet"}
                    {" · "}
                    {course.averageScore != null
                      ? `quiz average ${course.averageScore}% (${course.quizAttempts} attempts)`
                      : "no quiz results yet"}
                  </span>
                  {course.upcomingMockExams.length > 0 && (
                    <span className="mt-1 block text-xs text-accent-cyan">
                      {course.upcomingMockExams.length} open mock exam{course.upcomingMockExams.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {selectedCourses.length > 0 && (
        <Section
          step={2}
          title="Topics to prepare (optional)"
          hint="Leave this empty to cover every lecture in a course. Rating your confidence helps when there isn't enough quiz data yet."
        >
          <div className="space-y-4">
            {selectedCourses.map((course) => {
              const suggestions = [
                ...course.lectures
                  .filter((lecture) => !lecture.completed || (lecture.averageScore != null && lecture.averageScore < 60))
                  .map((lecture) => ({
                    name: lecture.title,
                    note: !lecture.completed
                      ? lecture.watchPercent
                        ? `${lecture.watchPercent}% watched`
                        : "not started"
                      : `quiz avg ${lecture.averageScore}%`,
                  })),
                ...course.topics
                  .filter((topic) => topic.averageScore < 60)
                  .map((topic) => ({ name: topic.name, note: `quiz avg ${topic.averageScore}%` })),
              ].filter((item) => !hasTopic(course.id, item.name));
              const courseTopics = values.topics.filter((topic) => topic.courseId === course.id);
              const inputId = `topic-${course.id}`;

              return (
                <div key={course.id} className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.03] p-4">
                  <p className="text-sm font-bold text-white">{course.title}</p>

                  {courseTopics.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {courseTopics.map((topic) => (
                        <li key={topic.name} className="flex flex-col gap-2 rounded-xl bg-ink-900 p-2 sm:flex-row sm:items-center">
                          <span className="min-w-0 flex-1 truncate px-1 text-sm text-slate-700">{topic.name}</span>
                          <Select
                            aria-label={`Confidence for ${topic.name}`}
                            className="py-2 sm:w-48"
                            value={topic.confidence ? String(topic.confidence) : ""}
                            onChange={(event) =>
                              updateTopic(topic, { confidence: event.target.value ? Number(event.target.value) : null })
                            }
                          >
                            {CONFIDENCE.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <button
                            type="button"
                            onClick={() => set({ topics: values.topics.filter((item) => item !== topic) })}
                            className="self-end rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:self-auto"
                            aria-label={`Remove topic ${topic.name}`}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">All lectures in this course will be included.</p>
                  )}

                  {suggestions.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Suggested from your progress
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 8).map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => addTopic(course.id, item.name)}
                            className="inline-flex items-center gap-1 rounded-full border border-accent-purple/20 bg-ink-900 px-3 py-1 text-xs text-slate-700 transition-colors hover:border-accent-purple/50 hover:text-accent-purple"
                          >
                            <Plus size={12} /> {item.name}
                            <span className="text-slate-400">· {item.note}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <label htmlFor={inputId} className="sr-only">
                      Add a topic or chapter for {course.title}
                    </label>
                    <Input
                      id={inputId}
                      className="py-2"
                      maxLength={120}
                      placeholder="Add a topic or chapter…"
                      value={customTopic[course.id] ?? ""}
                      onChange={(event) => setCustomTopic((current) => ({ ...current, [course.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTopic(course.id, customTopic[course.id] ?? "");
                          setCustomTopic((current) => ({ ...current, [course.id]: "" }));
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        addTopic(course.id, customTopic[course.id] ?? "");
                        setCustomTopic((current) => ({ ...current, [course.id]: "" }));
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section step={3} title="Goals" hint="All optional. With an exam date, the plan runs up to the day before it (up to six weeks).">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exam-date">Exam date</Label>
            <Input
              id="exam-date"
              type="date"
              min={addDays(context.today, 1)}
              value={values.examDate ?? ""}
              onChange={(event) => set({ examDate: event.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="target-score">Target score (%)</Label>
            <Input
              id="target-score"
              type="number"
              min={1}
              max={100}
              placeholder="e.g. 80"
              value={values.targetScore ?? ""}
              onChange={(event) => set({ targetScore: event.target.value ? Number(event.target.value) : null })}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="goal">Learning goal</Label>
          <Textarea
            id="goal"
            rows={2}
            maxLength={300}
            placeholder="e.g. Feel confident with SQL joins before the midterm"
            value={values.goal}
            onChange={(event) => set({ goal: event.target.value })}
          />
        </div>
      </Section>

      <Section step={4} title="Availability">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500" id="daily-minutes-label">
            Study time per day
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="daily-minutes-label">
            {MINUTE_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={!customMinutes && values.dailyMinutes === minutes}
                onClick={() => {
                  setCustomMinutes(false);
                  set({ dailyMinutes: minutes });
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                  !customMinutes && values.dailyMinutes === minutes
                    ? "border-accent-purple bg-accent-purple text-[#fff]"
                    : "border-accent-purple/20 text-slate-600 hover:border-accent-purple/50",
                )}
              >
                {formatMinutes(minutes)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customMinutes}
              onClick={() => setCustomMinutes(true)}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                customMinutes ? "border-accent-purple bg-accent-purple text-[#fff]" : "border-accent-purple/20 text-slate-600 hover:border-accent-purple/50",
              )}
            >
              Custom
            </button>
          </div>
          {customMinutes && (
            <div className="mt-2 max-w-[200px]">
              <label htmlFor="custom-minutes" className="sr-only">
                Minutes per day
              </label>
              <Input
                id="custom-minutes"
                type="number"
                min={15}
                max={480}
                step={5}
                value={values.dailyMinutes}
                onChange={(event) => set({ dailyMinutes: Number(event.target.value) })}
              />
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500" id="study-days-label">
            Study days
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="study-days-label">
            {WEEKDAYS.map((day) => {
              const active = values.studyDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={day.long}
                  onClick={() =>
                    set({
                      studyDays: active
                        ? values.studyDays.filter((value) => value !== day.value)
                        : [...values.studyDays, day.value],
                    })
                  }
                  className={cn(
                    "h-10 w-12 rounded-xl border text-xs font-bold transition-colors",
                    active ? "border-accent-cyan bg-accent-cyan text-[#fff]" : "border-accent-purple/20 text-slate-600 hover:border-accent-cyan/60",
                  )}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="start-time">Preferred start time</Label>
          <div className="flex flex-wrap items-center gap-2">
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                aria-pressed={values.startTime === preset.value}
                onClick={() => set({ startTime: preset.value })}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                  values.startTime === preset.value
                    ? "border-accent-purple bg-accent-purple text-[#fff]"
                    : "border-accent-purple/20 text-slate-600 hover:border-accent-purple/50",
                )}
              >
                {preset.label} · {preset.value}
              </button>
            ))}
            <Input
              id="start-time"
              type="time"
              className="w-32 py-2"
              required
              value={values.startTime}
              onChange={(event) => set({ startTime: event.target.value })}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">A 10-minute break is added after every 50 minutes of study.</p>
        </div>
      </Section>

      <div className="flex items-start gap-2 rounded-2xl bg-accent-purple/[0.06] p-4 text-xs leading-5 text-slate-600">
        {context.aiAvailable ? <Sparkles size={14} className="mt-0.5 shrink-0 text-accent-purple" /> : <Info size={14} className="mt-0.5 shrink-0 text-accent-cyan" />}
        <span>
          {context.aiAvailable
            ? "AI helps prioritise your topics. Dates, time limits and resources are always checked by the portal, and only your real progress data is used."
            : "AI isn't configured on this portal, so a rule-based planner will build your plan from your real progress data."}
          {mode === "regenerate" && " Completed and skipped tasks are kept; pending tasks will be replaced."}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || values.courseIds.length === 0}>
          <Sparkles size={16} />
          {busy ? "Building your plan…" : mode === "create" ? "Generate my plan" : "Regenerate plan"}
        </Button>
      </div>
    </form>
  );
}
