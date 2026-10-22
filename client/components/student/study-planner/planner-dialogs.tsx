"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  formatMinutes,
  type StudyPlan,
  type StudyPriority,
  type StudyTask,
  type StudyTaskType,
} from "@/lib/study-planner";
import type { PlannerContextCourse } from "@/lib/study-planner";

function Modal({
  label,
  title,
  description,
  onClose,
  children,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  // Portalled so card hover transforms can't trap the fixed overlay.
  return createPortal(
    <Dialog
      label={label}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-accent-purple/15 bg-ink-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-slate-400 transition-colors hover:text-rose-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {description ? <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div> : null}
        <div className="mt-5">{children}</div>
      </div>
    </Dialog>,
    document.body,
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </label>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "primary",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      label={title}
      title={title}
      onClose={onClose}
      description={
        <span className="flex items-start gap-2">
          {tone === "danger" && <AlertTriangle size={16} className="mt-1 shrink-0 text-rose-600" />}
          <span>{message}</span>
        </span>
      }
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function SkipTaskDialog({
  task,
  busy,
  onSkip,
  onClose,
}: {
  task: StudyTask;
  busy?: boolean;
  onSkip: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      label="Skip task"
      title="Skip this task?"
      description={`"${task.title}" will be marked as skipped and kept in your study history.`}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSkip(reason);
        }}
        className="space-y-4"
      >
        <div>
          <FieldLabel htmlFor="skip-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="skip-reason"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Already covered this in class"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Skipping…" : "Skip task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RescheduleDialog({
  task,
  plan,
  busy,
  onSave,
  onClose,
}: {
  task: StudyTask;
  plan: StudyPlan;
  busy?: boolean;
  onSave: (date: string, startTime?: string) => void;
  onClose: () => void;
}) {
  const initial = task.scheduledDate < plan.today ? plan.today : task.scheduledDate;
  const [date, setDate] = useState(initial);
  const [time, setTime] = useState("");
  const tooLate = date > plan.endDate;

  return (
    <Modal
      label="Reschedule task"
      title="Reschedule task"
      description={`${task.title} · ${formatMinutes(task.durationMinutes)}`}
      onClose={onClose}
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSave(date, time || undefined);
        }}
        className="space-y-4"
      >
        <div>
          <FieldLabel htmlFor="reschedule-date">New date</FieldLabel>
          <Input
            id="reschedule-date"
            type="date"
            required
            min={plan.today}
            max={plan.endDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {tooLate && <p className="mt-1 text-xs text-rose-600">Pick a date on or before the plan's end date.</p>}
        </div>
        <div>
          <FieldLabel htmlFor="reschedule-time">Start time (optional)</FieldLabel>
          <Input id="reschedule-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          <p className="mt-1 text-xs text-slate-500">
            Leave empty to place it after that day&apos;s other tasks. Your {plan.dailyMinutes}-minute daily limit is
            checked when you save.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !date || tooLate}>
            {busy ? "Saving…" : "Save new time"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const TYPES = Object.keys(TASK_TYPE_LABEL) as StudyTaskType[];
const PRIORITIES = Object.keys(PRIORITY_LABEL) as StudyPriority[];

export function AddTaskDialog({
  plan,
  courses,
  defaultDate,
  busy,
  onAdd,
  onClose,
}: {
  plan: StudyPlan;
  courses: PlannerContextCourse[];
  defaultDate: string;
  busy?: boolean;
  onAdd: (task: {
    courseId: string;
    topic: string;
    type: StudyTaskType;
    durationMinutes: number;
    scheduledDate: string;
    startTime?: string;
    priority: StudyPriority;
    lectureId?: string;
  }) => void;
  onClose: () => void;
}) {
  const planCourses = plan.courses;
  const [courseId, setCourseId] = useState(planCourses[0]?.id ?? "");
  const [type, setType] = useState<StudyTaskType>("REVISE");
  const [lectureId, setLectureId] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(Math.min(30, plan.dailyMinutes));
  const [date, setDate] = useState(defaultDate < plan.today ? plan.today : defaultDate > plan.endDate ? plan.endDate : defaultDate);
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<StudyPriority>("MEDIUM");
  const lectures = courses.find((course) => course.id === courseId)?.lectures ?? [];

  return (
    <Modal label="Add task" title="Add a study task" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const lecture = lectures.find((item) => item.id === lectureId);
          onAdd({
            courseId,
            topic: topic.trim() || lecture?.title || "",
            type,
            durationMinutes: duration,
            scheduledDate: date,
            ...(time ? { startTime: time } : {}),
            priority,
            ...(lectureId ? { lectureId } : {}),
          });
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="task-course">Course</FieldLabel>
            <Select
              id="task-course"
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setLectureId("");
              }}
            >
              {planCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="task-type">Task type</FieldLabel>
            <Select id="task-type" value={type} onChange={(event) => setType(event.target.value as StudyTaskType)}>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {TASK_TYPE_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="task-lecture">Lecture (optional)</FieldLabel>
          <Select id="task-lecture" value={lectureId} onChange={(event) => setLectureId(event.target.value)}>
            <option value="">No lecture</option>
            {lectures.map((lecture) => (
              <option key={lecture.id} value={lecture.id}>
                {lecture.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="task-topic">Topic</FieldLabel>
          <Input
            id="task-topic"
            maxLength={120}
            required={!lectureId}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={lectureId ? "Uses the lecture title if empty" : "e.g. Chapter 4 exercises"}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="task-duration">Duration (minutes)</FieldLabel>
            <Input
              id="task-duration"
              type="number"
              min={5}
              max={Math.min(240, plan.dailyMinutes)}
              step={5}
              required
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
            <Select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as StudyPriority)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="task-date">Date</FieldLabel>
            <Input
              id="task-date"
              type="date"
              required
              min={plan.today}
              max={plan.endDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="task-time">Start time (optional)</FieldLabel>
            <Input id="task-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !courseId || (!topic.trim() && !lectureId) || duration < 5 || date > plan.endDate}
          >
            {busy ? "Adding…" : "Add task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
