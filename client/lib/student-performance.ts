/** One checkpoint answer from GET /api/student/quiz/history/me. */
export type AttemptHistoryItem = {
  submittedAt: string;
  score: number;
  passed: boolean;
  courseId: string | null;
};

/** Per-course figures from GET /api/student/study-plans/context (real enrolment, lectures and quiz results). */
export type SubjectStat = {
  id: string;
  title: string;
  lectureCount: number;
  completedLectures: number;
  quizAttempts: number;
  averageScore: number | null;
};

export type WeekPoint = {
  /** Monday of the week, YYYY-MM-DD (local calendar). */
  start: string;
  label: string;
  /** Rounded average score, or null when there were no answers that week (drawn as a gap, not 0). */
  average: number | null;
  answers: number;
  correct: number;
};

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayOf(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

/** Average score per calendar week for the last `weeks` weeks, oldest first, optionally for one course. */
export function weeklyScoreTrend(
  history: AttemptHistoryItem[],
  weeks: number,
  options: { now?: Date; courseId?: string | null } = {},
): WeekPoint[] {
  const thisWeek = mondayOf(options.now ?? new Date());
  const points: WeekPoint[] = [];
  const index = new Map<string, WeekPoint>();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    const point: WeekPoint = {
      start: localIso(start),
      label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      average: null,
      answers: 0,
      correct: 0,
    };
    points.push(point);
    index.set(point.start, point);
  }

  const sums = new Map<string, number>();
  for (const attempt of history) {
    if (options.courseId && attempt.courseId !== options.courseId) continue;
    const submitted = new Date(attempt.submittedAt);
    if (Number.isNaN(submitted.getTime())) continue;
    const point = index.get(localIso(mondayOf(submitted)));
    if (!point) continue;
    point.answers += 1;
    if (attempt.passed) point.correct += 1;
    sums.set(point.start, (sums.get(point.start) ?? 0) + attempt.score);
  }
  for (const point of points) {
    if (point.answers > 0) point.average = Math.round((sums.get(point.start) ?? 0) / point.answers);
  }
  return points;
}

/** The existing per-subject advice, now driven by the real score (null = no results yet). */
export function subjectAdvice(score: number | null) {
  if (score == null) return "Answer this course's checkpoint quizzes to see your score here.";
  if (score < 60) return "Rewatch the latest lecture and attempt one extra checkpoint quiz.";
  if (score < 80) return "Do a focused revision session and ask the AI tutor one concept question.";
  return "Maintain momentum with one advanced practice set this week.";
}

export function lectureCompletion(subject: Pick<SubjectStat, "lectureCount" | "completedLectures">) {
  return subject.lectureCount > 0 ? Math.round((subject.completedLectures / subject.lectureCount) * 100) : null;
}
