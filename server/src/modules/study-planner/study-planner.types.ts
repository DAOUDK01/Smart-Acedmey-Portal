export const TASK_TYPES = [
  "WATCH_LECTURE",
  "LEARN_TOPIC",
  "PRACTICE_QUIZ",
  "REVISE",
  "REVIEW_MISTAKES",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_STATUSES = ["PENDING", "COMPLETED", "SKIPPED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Calendar date in the student's local calendar, "YYYY-MM-DD". */
export type IsoDate = string;

export type PerformanceStats = {
  attempts: number;
  averageScore: number;
  latestScore: number;
  /** Distinct quizzes whose latest attempt was not passed. */
  failedQuizCount: number;
};

export type ContextCourse = { id: string; title: string; code: string | null };

export type ContextLecture = {
  id: string;
  courseId: string;
  title: string;
  order: number;
  durationMinutes: number | null;
  /** Highest recorded watch progress (0-100), null when never opened. */
  watchPercent: number | null;
  /** Approved checkpoint quizzes attached to the lecture. */
  quizCount: number;
  quizTopics: string[];
  performance: PerformanceStats | null;
};

export type ContextTopicStat = {
  courseId: string;
  topic: string;
  performance: PerformanceStats;
};

export type ContextMockExam = {
  id: string;
  courseId: string;
  title: string;
  endsAt: IsoDate | null;
  attempted: boolean;
};

/** Everything the planner knows about the student, loaded from the database. */
export type PlannerContext = {
  courses: ContextCourse[];
  lectures: ContextLecture[];
  topicStats: ContextTopicStat[];
  mockExams: ContextMockExam[];
};

export type TopicInput = { courseId: string; name: string; confidence: number | null };

export type PlannerInput = {
  courseIds: string[];
  topics: TopicInput[];
  examDate: IsoDate | null;
  startDate: IsoDate;
  dailyMinutes: number;
  studyDays: number[];
  startMinute: number;
  targetScore: number | null;
};

export type UnitKind = "lecture" | "topic" | "mock-exam";

export type StudyUnit = {
  key: string;
  kind: UnitKind;
  courseId: string;
  subject: string;
  topic: string;
  lectureId: string | null;
  lectureMinutes: number | null;
  watchPercent: number | null;
  lectureCompleted: boolean;
  quizCount: number;
  performance: PerformanceStats | null;
  /** True when there are enough quiz attempts to trust the performance figures. */
  reliable: boolean;
  confidence: number | null;
  mockExamId: string | null;
  deadline: IsoDate | null;
  score: number;
  priority: Priority;
  /** Position in the AI's suggested focus order, when validated AI advice was applied. */
  aiRank: number | null;
  reasons: string[];
};

export type DraftTask = {
  id: string;
  identity: string;
  unitKey: string;
  courseId: string;
  subject: string;
  topic: string;
  title: string;
  type: TaskType;
  lectureId: string | null;
  mockExamId: string | null;
  durationMinutes: number;
  priority: Priority;
  reason: string;
  dependsOn: string | null;
  minGapDays: number;
  deadline: IsoDate | null;
};

export type ScheduledTask = DraftTask & { scheduledDate: IsoDate; startMinute: number };

export type RecommendationKind =
  | "weak-topic"
  | "lecture"
  | "exam"
  | "deadline"
  | "capacity"
  | "no-data"
  | "strength"
  | "empty-course"
  | "ai-tip";

export type PlanRecommendation = {
  kind: RecommendationKind;
  text: string;
  source: "data" | "ai";
  courseId?: string;
  lectureId?: string;
};

export type ValidatedAdvice = {
  summary: string | null;
  units: { key: string; priority: Priority; note: string | null }[];
  tips: string[];
};

/** Already-completed work, keyed by task identity, so regeneration does not repeat it. */
export type CompletedWork = Map<string, { minutes: number; count: number }>;
