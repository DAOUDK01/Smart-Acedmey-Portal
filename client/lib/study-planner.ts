import { authenticatedFetch } from "@/lib/api";

export type StudyTaskType = "WATCH_LECTURE" | "LEARN_TOPIC" | "PRACTICE_QUIZ" | "REVISE" | "REVIEW_MISTAKES";
export type StudyPriority = "HIGH" | "MEDIUM" | "LOW";
export type StudyTaskStatus = "PENDING" | "COMPLETED" | "SKIPPED";
export type AiStatus = "used" | "unavailable" | "failed" | "invalid";

export type StudyTask = {
  id: string;
  courseId: string | null;
  subject: string;
  topic: string;
  title: string;
  type: StudyTaskType;
  lectureId: string | null;
  mockExamId: string | null;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number;
  priority: StudyPriority;
  status: StudyTaskStatus;
  reason: string | null;
  skipReason: string | null;
  completedAt: string | null;
  autoCompleted: boolean;
  isCustom: boolean;
  isMissed: boolean;
};

export type PlanRecommendation = {
  kind: string;
  text: string;
  source: "data" | "ai";
  courseId?: string;
  lectureId?: string;
};

export type PlanSuggestion = {
  type: "MISSED_TASKS" | "NEW_QUIZ_RESULTS" | "PLAN_ENDED" | "PLAN_COMPLETE";
  message: string;
  count?: number;
};

export type PlanProgress = {
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  remainingTasks: number;
  missedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
  percent: number;
  todayTasks: number;
  todayCompleted: number;
  todayMinutes: number;
};

export type TopicInput = { courseId: string; name: string; confidence: number | null };

export type StudyPlan = {
  id: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED";
  courseIds: string[];
  courses: { id: string; title: string; code: string | null }[];
  topics: TopicInput[];
  examDate: string | null;
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  studyDays: number[];
  startTime: string;
  targetScore: number | null;
  goal: string | null;
  generatedBy: "AI" | "RULES";
  aiSummary: string | null;
  recommendations: PlanRecommendation[];
  createdAt: string;
  updatedAt: string;
  today: string;
  tasks: StudyTask[];
  progress: PlanProgress;
  suggestions: PlanSuggestion[];
  history: { id: string; action: string; summary: string; createdAt: string }[];
};

export type PlannerContextCourse = {
  id: string;
  title: string;
  code: string | null;
  lectureCount: number;
  completedLectures: number;
  quizAttempts: number;
  averageScore: number | null;
  lectures: {
    id: string;
    title: string;
    durationMinutes: number | null;
    watchPercent: number | null;
    completed: boolean;
    quizCount: number;
    quizAttempts: number;
    averageScore: number | null;
  }[];
  topics: { name: string; attempts: number; averageScore: number }[];
  upcomingMockExams: { id: string; title: string; endsAt: string | null }[];
};

export type PlannerContext = {
  today: string;
  enrollmentSource: "admission" | "published";
  aiAvailable: boolean;
  courses: PlannerContextCourse[];
};

export type PlanFormValues = {
  title?: string;
  courseIds: string[];
  topics: TopicInput[];
  examDate: string | null;
  dailyMinutes: number;
  studyDays: number[];
  startTime: string;
  targetScore: number | null;
  goal: string;
};

export type GenerationResult = { plan: StudyPlan; generation: { aiStatus: AiStatus; unscheduledCount: number } };

export const TASK_TYPE_LABEL: Record<StudyTaskType, string> = {
  WATCH_LECTURE: "Watch Lecture",
  LEARN_TOPIC: "Learn Topic",
  PRACTICE_QUIZ: "Practice Quiz",
  REVISE: "Revise",
  REVIEW_MISTAKES: "Review Mistakes",
};

export const PRIORITY_LABEL: Record<StudyPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export const TIME_PRESETS = [
  { label: "Morning", value: "08:00" },
  { label: "Afternoon", value: "14:00" },
  { label: "Evening", value: "18:00" },
];

export const AI_STATUS_MESSAGE: Record<AiStatus, string> = {
  used: "Plan created with AI-assisted prioritisation.",
  unavailable: "AI isn't configured, so the plan was built by the rule-based planner.",
  failed: "The AI service didn't respond, so the plan was built by the rule-based planner.",
  invalid: "The AI response couldn't be verified, so the plan was built by the rule-based planner.",
};

// --- Dates (local calendar, "YYYY-MM-DD") -----------------------------------

export function localToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function toUtc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function startOfWeek(date: string): string {
  const weekday = toUtc(date).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function formatDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return toUtc(date).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function endTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours * 60 + minutes + durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type DayGroup = { date: string; tasks: StudyTask[]; minutes: number; completedMinutes: number };

/** Tasks grouped by day in order; when a range is given, empty days inside it are included. */
export function groupTasksByDate(tasks: StudyTask[], range?: { from: string; to: string }): DayGroup[] {
  const byDate = new Map<string, StudyTask[]>();
  for (const task of tasks) {
    if (range && (task.scheduledDate < range.from || task.scheduledDate > range.to)) continue;
    byDate.set(task.scheduledDate, [...(byDate.get(task.scheduledDate) ?? []), task]);
  }
  if (range) {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      if (!byDate.has(day)) byDate.set(day, []);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTasks]) => {
      const sorted = [...dayTasks].sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
      const active = sorted.filter((task) => task.status !== "SKIPPED");
      return {
        date,
        tasks: sorted,
        minutes: active.reduce((sum, task) => sum + task.durationMinutes, 0),
        completedMinutes: active
          .filter((task) => task.status === "COMPLETED")
          .reduce((sum, task) => sum + task.durationMinutes, 0),
      };
    });
}

/** Minutes of break between two consecutive timed tasks (0 when back-to-back or untimed). */
export function breakBetween(previous: StudyTask, next: StudyTask): number {
  if (!previous.startTime || !next.startTime) return 0;
  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(0, toMinutes(next.startTime) - (toMinutes(previous.startTime) + previous.durationMinutes));
}

// --- API ----------------------------------------------------------------------

export class PlannerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/student/study-plans${path}`, init);
  } catch {
    throw new PlannerApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    let code: string | undefined;
    try {
      const body = (await response.json()) as { message?: string | string[]; code?: string };
      if (Array.isArray(body.message)) message = body.message.join(". ");
      else if (body.message) message = body.message;
      code = body.code;
    } catch {
      // keep the generic message
    }
    throw new PlannerApiError(message, response.status, code);
  }
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function planPayload(values: PlanFormValues) {
  return {
    ...(values.title?.trim() ? { title: values.title.trim() } : {}),
    courseIds: values.courseIds,
    topics: values.topics
      .filter((topic) => topic.name.trim())
      .map((topic) => ({
        courseId: topic.courseId,
        name: topic.name.trim(),
        ...(topic.confidence ? { confidence: topic.confidence } : {}),
      })),
    ...(values.examDate ? { examDate: values.examDate } : {}),
    dailyMinutes: values.dailyMinutes,
    studyDays: values.studyDays,
    startTime: values.startTime,
    ...(values.targetScore ? { targetScore: values.targetScore } : {}),
    ...(values.goal.trim() ? { goal: values.goal.trim() } : {}),
  };
}

export const plannerApi = {
  context: () => request<PlannerContext>(`/context?today=${localToday()}`),
  active: () => request<{ plan: StudyPlan | null }>(`/active?today=${localToday()}`),
  create: (values: PlanFormValues, replaceExisting = false) =>
    request<GenerationResult>("", json("POST", { ...planPayload(values), replaceExisting, today: localToday() })),
  regenerate: (planId: string, values: PlanFormValues) =>
    request<GenerationResult>(
      `/${planId}/regenerate`,
      json("POST", {
        ...planPayload({ ...values, title: undefined }),
        ...(values.examDate ? {} : { clearExamDate: true }),
        confirm: true,
        today: localToday(),
      }),
    ),
  remove: (planId: string) => request<{ success: boolean }>(`/${planId}`, { method: "DELETE" }),
  rescheduleMissed: (planId: string) =>
    request<{ plan: StudyPlan; moved: number; unplaced: number }>(
      `/${planId}/reschedule-missed`,
      json("POST", { today: localToday() }),
    ),
  complete: (planId: string, taskId: string) =>
    request<StudyPlan>(`/${planId}/tasks/${taskId}/complete`, json("POST", { today: localToday() })),
  reopen: (planId: string, taskId: string) =>
    request<StudyPlan>(`/${planId}/tasks/${taskId}/reopen`, json("POST", { today: localToday() })),
  skip: (planId: string, taskId: string, reason: string) =>
    request<StudyPlan>(
      `/${planId}/tasks/${taskId}/skip`,
      json("POST", { ...(reason.trim() ? { reason: reason.trim() } : {}), today: localToday() }),
    ),
  reschedule: (planId: string, taskId: string, scheduledDate: string, startTime?: string) =>
    request<StudyPlan>(
      `/${planId}/tasks/${taskId}/schedule`,
      json("PATCH", { scheduledDate, ...(startTime ? { startTime } : {}), today: localToday() }),
    ),
  addTask: (
    planId: string,
    task: {
      courseId: string;
      topic: string;
      type: StudyTaskType;
      durationMinutes: number;
      scheduledDate: string;
      startTime?: string;
      priority: StudyPriority;
      lectureId?: string;
    },
  ) => request<StudyPlan>(`/${planId}/tasks`, json("POST", { ...task, today: localToday() })),
  removeTask: (planId: string, taskId: string) =>
    request<StudyPlan>(`/${planId}/tasks/${taskId}?today=${localToday()}`, { method: "DELETE" }),
};
