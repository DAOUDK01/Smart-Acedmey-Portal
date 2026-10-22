import {
  CompletedWork,
  DraftTask,
  IsoDate,
  PRIORITIES,
  PlanRecommendation,
  PlannerContext,
  PlannerInput,
  Priority,
  ScheduledTask,
  StudyUnit,
  TASK_TYPES,
  TaskType,
  ValidatedAdvice,
} from "./study-planner.types";

/** Fewer attempts than this are not enough to call a topic weak or strong. */
export const MIN_RELIABLE_ATTEMPTS = 2;
/** Average quiz score below which a topic counts as weak (matches the portal's pass mark). */
export const WEAK_SCORE = 60;
export const STRONG_SCORE = 80;
/** Watch progress at which a lecture counts as finished (same rule as the recommendation service). */
export const LECTURE_COMPLETE_PERCENT = 80;
export const DEFAULT_LECTURE_MINUTES = 20;
export const MAX_TASK_MINUTES = 50;
export const FOCUS_BLOCK_MINUTES = 50;
export const BREAK_MINUTES = 10;
export const DEFAULT_HORIZON_DAYS = 14;
export const MAX_HORIZON_DAYS = 42;
export const MINUTES_PER_DAY = 24 * 60;
export const MAX_TASKS_PER_UNIT_PER_DAY = 2;
const MS_PER_DAY = 86_400_000;
const EXAM_SOON_DAYS = 14;
const DEADLINE_SOON_DAYS = 7;

// ---------------------------------------------------------------------------
// Dates. Plans work on calendar dates ("YYYY-MM-DD") so the student's local
// day never shifts with the server's timezone.
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(date)!.getTime() + days * MS_PER_DAY));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to)!.getTime() - parseIsoDate(from)!.getTime()) / MS_PER_DAY);
}

export function weekday(date: IsoDate): number {
  return parseIsoDate(date)!.getUTCDay();
}

export function formatDate(date: IsoDate): string {
  return parseIsoDate(date)!.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Last planned day: the day before the exam (capped), or a default two-week window. */
export function resolveEndDate(startDate: IsoDate, examDate: IsoDate | null): IsoDate {
  const cap = addDays(startDate, MAX_HORIZON_DAYS - 1);
  if (!examDate) return addDays(startDate, DEFAULT_HORIZON_DAYS - 1);
  const dayBefore = addDays(examDate, -1);
  return dayBefore < cap ? dayBefore : cap;
}

export function planDays(startDate: IsoDate, endDate: IsoDate, studyDays: number[]): IsoDate[] {
  const allowed = new Set(studyDays);
  const days: IsoDate[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    if (allowed.has(weekday(day))) days.push(day);
  }
  return days;
}

/** Latest clock time a day's session can reach: study time plus the breaks between focus blocks. */
export function sessionEndMinute(startMinute: number, dailyMinutes: number): number {
  const breaks = Math.max(0, Math.ceil(dailyMinutes / FOCUS_BLOCK_MINUTES) - 1);
  return startMinute + dailyMinutes + breaks * BREAK_MINUTES;
}

// ---------------------------------------------------------------------------
// Study units: one per lecture, student-entered topic, or open mock exam.
// ---------------------------------------------------------------------------

export function normalizeTopic(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesTopic(lecture: { title: string; quizTopics: string[] }, name: string) {
  const wanted = normalizeTopic(name);
  if (!wanted) return false;
  const candidates = [lecture.title, ...lecture.quizTopics].map(normalizeTopic).filter(Boolean);
  return candidates.some(
    (candidate) => candidate.includes(wanted) || (candidate.length >= 4 && wanted.includes(candidate)),
  );
}

export type UnitBuildResult = { units: StudyUnit[]; emptyCourseIds: string[] };

export function buildStudyUnits(context: PlannerContext, input: PlannerInput): UnitBuildResult {
  const units: StudyUnit[] = [];
  const emptyCourseIds: string[] = [];

  for (const courseId of input.courseIds) {
    const course = context.courses.find((item) => item.id === courseId);
    if (!course) continue;
    const lectures = context.lectures
      .filter((lecture) => lecture.courseId === courseId)
      .sort((a, b) => a.order - b.order);
    const topics = input.topics.filter((topic) => topic.courseId === courseId);

    // With no topics listed the whole course is in scope; otherwise only the lectures that cover them.
    const lectureConfidence = new Map<string, number | null>();
    const unmatchedTopics: typeof topics = [];
    if (topics.length === 0) {
      for (const lecture of lectures) lectureConfidence.set(lecture.id, null);
    } else {
      for (const topic of topics) {
        const matches = lectures.filter((lecture) => matchesTopic(lecture, topic.name));
        if (matches.length === 0) unmatchedTopics.push(topic);
        for (const lecture of matches) {
          const current = lectureConfidence.get(lecture.id) ?? null;
          const next =
            topic.confidence == null ? current : current == null ? topic.confidence : Math.min(current, topic.confidence);
          lectureConfidence.set(lecture.id, next);
        }
      }
    }

    const courseUnits: StudyUnit[] = [];
    for (const lecture of lectures) {
      if (!lectureConfidence.has(lecture.id)) continue;
      courseUnits.push({
        key: `lecture:${lecture.id}`,
        kind: "lecture",
        courseId,
        subject: course.title,
        topic: lecture.title,
        lectureId: lecture.id,
        lectureMinutes: lecture.durationMinutes,
        watchPercent: lecture.watchPercent,
        lectureCompleted: (lecture.watchPercent ?? 0) >= LECTURE_COMPLETE_PERCENT,
        quizCount: lecture.quizCount,
        performance: lecture.performance,
        reliable: (lecture.performance?.attempts ?? 0) >= MIN_RELIABLE_ATTEMPTS,
        confidence: lectureConfidence.get(lecture.id) ?? null,
        mockExamId: null,
        deadline: null,
        score: 0,
        priority: "MEDIUM",
        aiRank: null,
        reasons: [],
      });
    }

    for (const topic of unmatchedTopics) {
      const stat = context.topicStats.find(
        (item) => item.courseId === courseId && normalizeTopic(item.topic) === normalizeTopic(topic.name),
      );
      courseUnits.push({
        key: `topic:${courseId}:${normalizeTopic(topic.name).replace(/ /g, "-")}`,
        kind: "topic",
        courseId,
        subject: course.title,
        topic: topic.name.trim(),
        lectureId: null,
        lectureMinutes: null,
        watchPercent: null,
        lectureCompleted: false,
        quizCount: 0,
        performance: stat?.performance ?? null,
        reliable: (stat?.performance.attempts ?? 0) >= MIN_RELIABLE_ATTEMPTS,
        confidence: topic.confidence,
        mockExamId: null,
        deadline: null,
        score: 0,
        priority: "MEDIUM",
        aiRank: null,
        reasons: [],
      });
    }

    if (courseUnits.length === 0) {
      emptyCourseIds.push(courseId);
      continue;
    }

    for (const exam of context.mockExams) {
      if (exam.courseId !== courseId || exam.attempted) continue;
      if (exam.endsAt && exam.endsAt < input.startDate) continue;
      courseUnits.push({
        key: `mock-exam:${exam.id}`,
        kind: "mock-exam",
        courseId,
        subject: course.title,
        topic: exam.title,
        lectureId: null,
        lectureMinutes: null,
        watchPercent: null,
        lectureCompleted: false,
        quizCount: 0,
        performance: null,
        reliable: false,
        confidence: null,
        mockExamId: exam.id,
        deadline: exam.endsAt,
        score: 0,
        priority: "MEDIUM",
        aiRank: null,
        reasons: [],
      });
    }

    units.push(...courseUnits);
  }

  for (const unit of units) scoreUnit(unit, input);
  return { units, emptyCourseIds };
}

export function priorityForScore(score: number): Priority {
  if (score >= 3.2) return "HIGH";
  if (score >= 2) return "MEDIUM";
  return "LOW";
}

/** Deterministic priority from real data only: quiz performance, stated confidence, lecture progress, deadlines. */
export function scoreUnit(unit: StudyUnit, input: PlannerInput) {
  let score = 1;
  const reasons: string[] = [];
  const perf = unit.performance;

  if (unit.kind === "mock-exam") {
    score = 2;
    if (unit.deadline) {
      const days = daysBetween(input.startDate, unit.deadline);
      if (days <= DEADLINE_SOON_DAYS) score += 1.5;
      reasons.push(`The mock exam "${unit.topic}" closes on ${formatDate(unit.deadline)}.`);
    } else {
      reasons.push(`The mock exam "${unit.topic}" is open and you haven't attempted it yet.`);
    }
  } else {
    if (perf && unit.reliable) {
      const average = Math.round(perf.averageScore);
      score += ((100 - perf.averageScore) / 100) * 3;
      if (perf.averageScore < WEAK_SCORE) {
        // Reliably below the pass mark: always high priority.
        score += 1;
        reasons.push(`Your average quiz score here is ${average}% across ${perf.attempts} attempts.`);
      } else if (perf.latestScore < WEAK_SCORE) {
        reasons.push(`Your latest quiz score here was ${Math.round(perf.latestScore)}%.`);
      }
    } else if (unit.confidence != null) {
      score += ((5 - unit.confidence) / 4) * 2;
      if (unit.confidence <= 2) reasons.push(`You rated your confidence ${unit.confidence}/5.`);
    } else if (perf && perf.attempts > 0) {
      // A single attempt is weak evidence: count it lightly and say so.
      score += ((100 - perf.latestScore) / 100) * 1.5;
      if (perf.latestScore < WEAK_SCORE) {
        reasons.push(`Your only quiz attempt here scored ${Math.round(perf.latestScore)}%.`);
      }
    } else {
      score += 0.5;
    }

    if (unit.kind === "lecture" && !unit.lectureCompleted) {
      score += 1.5;
      reasons.push(
        unit.watchPercent != null && unit.watchPercent > 0
          ? `You stopped at ${Math.round(unit.watchPercent)}% of this lecture.`
          : "You haven't watched this lecture yet.",
      );
    }
    if (unit.kind === "topic") score += 1;

    if (input.examDate && daysBetween(input.startDate, input.examDate) <= EXAM_SOON_DAYS) score += 0.5;
  }

  unit.score = Math.round(score * 100) / 100;
  unit.priority = priorityForScore(unit.score);
  unit.reasons = reasons;
}

/**
 * Applies validated AI prioritisation. The AI may reorder and re-prioritise units, but it cannot
 * mark a topic LOW when the student's reliable quiz data shows it is weak.
 */
export function applyAdvice(units: StudyUnit[], advice: ValidatedAdvice) {
  advice.units.forEach((item, index) => {
    const unit = units.find((candidate) => candidate.key === item.key);
    if (!unit) return;
    let priority = item.priority;
    if (priority === "LOW" && unit.reliable && unit.performance && unit.performance.averageScore < WEAK_SCORE) {
      priority = "MEDIUM";
    }
    unit.priority = priority;
    unit.aiRank = index;
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function taskIdentity(type: TaskType, courseId: string | null, ref: string) {
  return `${type}|${courseId ?? ""}|${ref}`;
}

function unitRef(unit: Pick<StudyUnit, "lectureId" | "mockExamId" | "topic">) {
  return unit.lectureId ?? unit.mockExamId ?? normalizeTopic(unit.topic);
}

export function identityForStoredTask(task: {
  type: TaskType;
  courseId: string | null;
  lectureId: string | null;
  mockExamId: string | null;
  topic: string;
}) {
  return taskIdentity(task.type, task.courseId, task.lectureId ?? task.mockExamId ?? normalizeTopic(task.topic));
}

export function splitDuration(total: number, maxChunk: number): number[] {
  const parts = Math.max(1, Math.ceil(total / maxChunk));
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, index) => base + (index < total % parts ? 1 : 0));
}

function roundUpToFive(minutes: number) {
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

const REVISION_MINUTES: Record<Priority, number> = { HIGH: 30, MEDIUM: 20, LOW: 15 };

export function generateDraftTasks(
  units: StudyUnit[],
  input: PlannerInput,
  completedWork: CompletedWork = new Map(),
): DraftTask[] {
  const maxChunk = Math.min(MAX_TASK_MINUTES, input.dailyMinutes);
  const drafts: DraftTask[] = [];
  let counter = 0;

  for (const unit of units) {
    const ref = unitRef(unit);
    let previousId: string | null = null;
    const done = (type: TaskType) => completedWork.get(taskIdentity(type, unit.courseId, ref));

    const add = (
      type: TaskType,
      title: string,
      minutes: number,
      reason: string,
      minGapDays = 0,
      split = true,
    ) => {
      const parts = split ? splitDuration(minutes, maxChunk) : [Math.min(minutes, input.dailyMinutes)];
      parts.forEach((partMinutes, index) => {
        const id = `t${++counter}`;
        drafts.push({
          id,
          identity: taskIdentity(type, unit.courseId, ref),
          unitKey: unit.key,
          courseId: unit.courseId,
          subject: unit.subject,
          topic: unit.topic,
          title: parts.length > 1 ? `${title} (part ${index + 1} of ${parts.length})` : title,
          type,
          lectureId: unit.lectureId,
          mockExamId: unit.mockExamId,
          durationMinutes: partMinutes,
          priority: unit.priority,
          reason,
          dependsOn: previousId,
          minGapDays: index === 0 ? minGapDays : 0,
          deadline: unit.deadline,
        });
        previousId = id;
      });
    };

    if (unit.kind === "mock-exam") {
      if (!done("PRACTICE_QUIZ")) {
        add("PRACTICE_QUIZ", `Mock exam: ${unit.topic}`, 30, unit.reasons[0] ?? "Practise under exam conditions.", 0, false);
      }
      continue;
    }

    const perf = unit.performance;
    const weak = Boolean(perf && unit.reliable && perf.averageScore < WEAK_SCORE);
    const strong = Boolean(perf && unit.reliable && perf.averageScore >= STRONG_SCORE);
    let learned = false;

    if (unit.kind === "lecture" && !unit.lectureCompleted) {
      const total = roundUpToFive(unit.lectureMinutes ?? DEFAULT_LECTURE_MINUTES);
      const remaining = total - (done("WATCH_LECTURE")?.minutes ?? 0);
      if (remaining >= 5) {
        add("WATCH_LECTURE", `Watch: ${unit.topic}`, remaining, unit.reasons.find((r) => r.includes("lecture")) ?? "Watch this lecture.");
        learned = true;
      }
    }

    if (unit.kind === "topic") {
      const total = unit.confidence != null && unit.confidence <= 2 ? 45 : 30;
      const remaining = total - (done("LEARN_TOPIC")?.minutes ?? 0);
      if (remaining >= 5) {
        add(
          "LEARN_TOPIC",
          `Learn: ${unit.topic}`,
          remaining,
          "You listed this topic and no published lecture covers it yet — study it from your notes or textbook.",
        );
        learned = true;
      }
    }

    if (weak && perf!.failedQuizCount > 0 && unit.lectureId && !done("REVIEW_MISTAKES")) {
      add(
        "REVIEW_MISTAKES",
        `Review mistakes: ${unit.topic}`,
        15,
        `You missed ${perf!.failedQuizCount} checkpoint question${perf!.failedQuizCount === 1 ? "" : "s"} in this lecture — go over the explanations.`,
      );
    }

    const needsPractice = unit.quizCount > 0 && (!perf || perf.attempts === 0 || weak);
    if (needsPractice && unit.lectureId && !done("PRACTICE_QUIZ")) {
      add(
        "PRACTICE_QUIZ",
        `Practice quiz: ${unit.topic}`,
        15,
        weak
          ? "Retake this lecture's checkpoint quiz to check your improvement."
          : `Complete this lecture before attempting its ${unit.quizCount} checkpoint question${unit.quizCount === 1 ? "" : "s"}.`,
      );
    }

    // Revision passes: weak or low-priority-but-examined topics get spaced revision; mastered ones none.
    let passes = 0;
    if (unit.priority === "HIGH") passes = input.examDate ? 2 : 1;
    else if (unit.priority === "MEDIUM") passes = 1;
    else if (input.examDate) passes = 1;
    if (strong && unit.lectureCompleted && !input.examDate) passes = 0;
    passes -= done("REVISE")?.count ?? 0;

    for (let pass = 0; pass < passes; pass++) {
      const reason =
        pass > 0 && input.examDate
          ? `Spaced second revision before your exam on ${formatDate(input.examDate)}.`
          : unit.reasons.find((r) => /quiz|confidence/.test(r)) ??
            (input.examDate
              ? `Keep this topic fresh before your exam on ${formatDate(input.examDate)}.`
              : learned
                ? "Revise soon after learning to help it stick."
                : "A short revision keeps this topic fresh.");
      add(
        "REVISE",
        pass > 0 ? `Revise again: ${unit.topic}` : `Revise: ${unit.topic}`,
        REVISION_MINUTES[unit.priority],
        reason,
        pass > 0 ? 2 : learned ? 1 : 0,
      );
    }
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type DayUsage = Map<IsoDate, { minutes: number; endMinute: number }>;

export type ScheduleOptions = {
  days: IsoDate[];
  dailyMinutes: number;
  startMinute: number;
  /** Minutes and clock time already taken on a day by tasks kept from before (regeneration). */
  usage?: DayUsage;
  /** Order of units; earlier units are scheduled first within the same priority. */
  unitOrder?: Map<string, number>;
};

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Greedy, deterministic scheduler. Highest priority first, respecting each task's dependency and
 * spacing, deadlines, the daily study-time limit, focus blocks with breaks, and midnight.
 */
export function scheduleTasks(drafts: DraftTask[], options: ScheduleOptions) {
  const unitOrder = options.unitOrder ?? new Map<string, number>();
  const queue = drafts
    .map((draft, index) => ({ draft, index }))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.draft.priority] - PRIORITY_RANK[b.draft.priority] ||
        (unitOrder.get(a.draft.unitKey) ?? 0) - (unitOrder.get(b.draft.unitKey) ?? 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.draft);

  const placedDay = new Map<string, number>();
  const scheduled: ScheduledTask[] = [];

  options.days.forEach((day, dayIndex) => {
    const existing = options.usage?.get(day);
    let used = existing?.minutes ?? 0;
    let clock = Math.max(options.startMinute, existing?.endMinute ?? options.startMinute);
    let continuous = 0;
    const perUnit = new Map<string, number>();

    for (;;) {
      const next = queue.find((task) => {
        if (placedDay.has(task.id)) return false;
        if (task.dependsOn) {
          const dependencyDay = placedDay.get(task.dependsOn);
          if (dependencyDay === undefined || dayIndex < dependencyDay) return false;
          if (task.minGapDays > 0 && daysBetween(options.days[dependencyDay], day) < task.minGapDays) return false;
        }
        if (task.deadline && day > task.deadline) return false;
        if ((perUnit.get(task.unitKey) ?? 0) >= MAX_TASKS_PER_UNIT_PER_DAY) return false;
        if (used + task.durationMinutes > options.dailyMinutes) return false;
        const needsBreak = continuous > 0 && continuous + task.durationMinutes > FOCUS_BLOCK_MINUTES;
        const start = clock + (needsBreak ? BREAK_MINUTES : 0);
        return start + task.durationMinutes <= MINUTES_PER_DAY;
      });
      if (!next) break;

      const needsBreak = continuous > 0 && continuous + next.durationMinutes > FOCUS_BLOCK_MINUTES;
      const start = clock + (needsBreak ? BREAK_MINUTES : 0);
      scheduled.push({ ...next, scheduledDate: day, startMinute: start });
      placedDay.set(next.id, dayIndex);
      used += next.durationMinutes;
      clock = start + next.durationMinutes;
      continuous = needsBreak ? next.durationMinutes : continuous + next.durationMinutes;
      perUnit.set(next.unitKey, (perUnit.get(next.unitKey) ?? 0) + 1);
    }
  });

  const unscheduled = queue.filter((task) => !placedDay.has(task.id));
  scheduled.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.startMinute - b.startMinute);
  return { scheduled, unscheduled };
}

/**
 * Final guard before anything is saved: every rule is re-checked in code, whatever produced the plan.
 * Returns human-readable violations; an empty list means the schedule is valid.
 */
export function validateSchedule(
  tasks: ScheduledTask[],
  rules: {
    days: IsoDate[];
    dailyMinutes: number;
    usage?: DayUsage;
    lectureIds: Set<string>;
    mockExamIds: Set<string>;
    courseIds: Set<string>;
  },
): string[] {
  const errors: string[] = [];
  const allowedDays = new Set(rules.days);
  const perDay = new Map<IsoDate, ScheduledTask[]>();
  const seen = new Set<string>();

  for (const task of tasks) {
    if (!allowedDays.has(task.scheduledDate)) errors.push(`${task.title}: ${task.scheduledDate} is not a study day`);
    if (!Number.isInteger(task.durationMinutes) || task.durationMinutes <= 0) errors.push(`${task.title}: invalid duration`);
    if (task.startMinute < 0 || task.startMinute + task.durationMinutes > MINUTES_PER_DAY) {
      errors.push(`${task.title}: runs past midnight`);
    }
    if (!(TASK_TYPES as readonly string[]).includes(task.type)) errors.push(`${task.title}: invalid type`);
    if (!(PRIORITIES as readonly string[]).includes(task.priority)) errors.push(`${task.title}: invalid priority`);
    if (!rules.courseIds.has(task.courseId)) errors.push(`${task.title}: unknown course`);
    if (task.lectureId && !rules.lectureIds.has(task.lectureId)) errors.push(`${task.title}: unknown lecture`);
    if (task.mockExamId && !rules.mockExamIds.has(task.mockExamId)) errors.push(`${task.title}: unknown mock exam`);
    if (task.deadline && task.scheduledDate > task.deadline) errors.push(`${task.title}: after its deadline`);
    const uniqueKey = `${task.identity}|${task.title}`;
    if (seen.has(uniqueKey)) errors.push(`${task.title}: duplicated`);
    seen.add(uniqueKey);
    perDay.set(task.scheduledDate, [...(perDay.get(task.scheduledDate) ?? []), task]);
  }

  for (const [day, dayTasks] of perDay) {
    const existing = rules.usage?.get(day)?.minutes ?? 0;
    const total = existing + dayTasks.reduce((sum, task) => sum + task.durationMinutes, 0);
    if (total > rules.dailyMinutes) errors.push(`${day}: ${total} minutes exceeds the ${rules.dailyMinutes}-minute daily limit`);
    const sorted = [...dayTasks].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].startMinute + sorted[i - 1].durationMinutes) {
        errors.push(`${day}: overlapping tasks`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Recommendations — every sentence is built from a real data point.
// ---------------------------------------------------------------------------

export function buildRecommendations(params: {
  units: StudyUnit[];
  input: PlannerInput;
  context: PlannerContext;
  endDate: IsoDate;
  unscheduled: DraftTask[];
  emptyCourseIds: string[];
  advice?: ValidatedAdvice | null;
}): PlanRecommendation[] {
  const { units, input, context, endDate, unscheduled, emptyCourseIds, advice } = params;
  const recommendations: PlanRecommendation[] = [];
  const courseTitle = (id: string) => context.courses.find((course) => course.id === id)?.title ?? "this course";

  if (input.examDate) {
    const days = daysBetween(input.startDate, input.examDate);
    recommendations.push({
      kind: "exam",
      source: "data",
      text:
        days <= EXAM_SOON_DAYS
          ? `Your exam is on ${formatDate(input.examDate)} (${days} day${days === 1 ? "" : "s"} away), so high-priority topics come first.`
          : `Your exam is on ${formatDate(input.examDate)}. Revision is spaced out so weak topics come back more than once.`,
    });
    if (daysBetween(input.startDate, input.examDate) > MAX_HORIZON_DAYS) {
      recommendations.push({
        kind: "capacity",
        source: "data",
        text: `This plan covers the next ${MAX_HORIZON_DAYS / 7} weeks. Regenerate it later to extend it toward your exam.`,
      });
    }
  }

  const weak = units
    .filter((unit) => unit.reliable && unit.performance && unit.performance.averageScore < WEAK_SCORE)
    .sort((a, b) => a.performance!.averageScore - b.performance!.averageScore)
    .slice(0, 3);
  for (const unit of weak) {
    recommendations.push({
      kind: "weak-topic",
      source: "data",
      courseId: unit.courseId,
      lectureId: unit.lectureId ?? undefined,
      text: `Revise "${unit.topic}" because your average quiz score there is ${Math.round(unit.performance!.averageScore)}% (${unit.performance!.attempts} attempts).`,
    });
  }

  const unfinishedWithQuiz = units.find(
    (unit) => unit.kind === "lecture" && !unit.lectureCompleted && unit.quizCount > 0,
  );
  if (unfinishedWithQuiz) {
    recommendations.push({
      kind: "lecture",
      source: "data",
      courseId: unfinishedWithQuiz.courseId,
      lectureId: unfinishedWithQuiz.lectureId ?? undefined,
      text: `Complete "${unfinishedWithQuiz.topic}" before attempting its checkpoint quiz.`,
    });
  }

  for (const unit of units.filter((item) => item.kind === "mock-exam" && item.deadline)) {
    recommendations.push({
      kind: "deadline",
      source: "data",
      courseId: unit.courseId,
      text: `The mock exam "${unit.topic}" closes on ${formatDate(unit.deadline!)} — it is scheduled before then.`,
    });
  }

  const strong = units.filter(
    (unit) => unit.reliable && unit.performance && unit.performance.averageScore >= STRONG_SCORE && unit.lectureCompleted,
  );
  if (strong.length > 0) {
    const best = strong[0];
    recommendations.push({
      kind: "strength",
      source: "data",
      courseId: best.courseId,
      text: `You're doing well in "${best.topic}" (${Math.round(best.performance!.averageScore)}% average), so it only gets a light review.`,
    });
  }

  for (const courseId of input.courseIds) {
    const courseUnits = units.filter((unit) => unit.courseId === courseId && unit.kind !== "mock-exam");
    if (courseUnits.length > 0 && courseUnits.every((unit) => !unit.reliable)) {
      const usesConfidence = courseUnits.some((unit) => unit.confidence != null);
      recommendations.push({
        kind: "no-data",
        source: "data",
        courseId,
        text: usesConfidence
          ? `There isn't enough quiz data for ${courseTitle(courseId)} yet, so priorities there use your confidence ratings and lecture progress.`
          : `There isn't enough quiz data for ${courseTitle(courseId)} yet, so priorities there follow your lecture progress. Rate your confidence per topic for a sharper plan.`,
      });
    }
  }

  for (const courseId of emptyCourseIds) {
    recommendations.push({
      kind: "empty-course",
      source: "data",
      courseId,
      text: `${courseTitle(courseId)} has no published lectures yet and no topics were listed, so nothing was scheduled for it.`,
    });
  }

  if (unscheduled.length > 0) {
    const minutes = unscheduled.reduce((sum, task) => sum + task.durationMinutes, 0);
    recommendations.push({
      kind: "capacity",
      source: "data",
      text: `${unscheduled.length} task${unscheduled.length === 1 ? "" : "s"} (${minutes} min) didn't fit your available time before ${formatDate(endDate)}. Add study time or days to cover them.`,
    });
  }

  if (advice) {
    for (const item of advice.units.filter((unit) => unit.note).slice(0, 3)) {
      const unit = units.find((candidate) => candidate.key === item.key);
      if (!unit) continue;
      recommendations.push({
        kind: "ai-tip",
        source: "ai",
        courseId: unit.courseId,
        lectureId: unit.lectureId ?? undefined,
        text: `${unit.topic}: ${item.note}`,
      });
    }
    for (const tip of advice.tips) recommendations.push({ kind: "ai-tip", source: "ai", text: tip });
  }

  return recommendations;
}
