import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, QuizStatus, StudyPlan, StudyTask } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import {
  StudyPlannerAiClient,
  allowedFactsFor,
  buildAdvicePrompt,
  validateAdvice,
} from "./study-planner.ai";
import {
  CreateStudyPlanDto,
  CreateStudyTaskDto,
  RegenerateStudyPlanDto,
  RescheduleTaskDto,
  UpdateStudyPlanDto,
} from "./study-planner.dto";
import {
  BREAK_MINUTES,
  DayUsage,
  LECTURE_COMPLETE_PERCENT,
  MINUTES_PER_DAY,
  applyAdvice,
  buildRecommendations,
  buildStudyUnits,
  daysBetween,
  formatClock,
  formatDate,
  generateDraftTasks,
  identityForStoredTask,
  normalizeTopic,
  parseClock,
  parseIsoDate,
  planDays,
  resolveEndDate,
  scheduleTasks,
  sessionEndMinute,
  toIsoDate,
  validateSchedule,
} from "./study-planner.engine";
import {
  CompletedWork,
  DraftTask,
  IsoDate,
  PerformanceStats,
  PlanRecommendation,
  PlannerContext,
  PlannerInput,
  Priority,
  ScheduledTask,
  TaskType,
  TopicInput,
} from "./study-planner.types";

type Student = { userId: string; email: string; keys: string[] };
export type AiStatus = "used" | "unavailable" | "failed" | "invalid";

const MAX_EXAM_DAYS_AHEAD = 365;
/** Minor events don't trigger a suggestion: wait for a few new answers (or repeated wrong ones). */
const NEW_RESULTS_MIN_ATTEMPTS = 3;
const NEW_RESULTS_MIN_FAILED = 2;

const TYPE_LABEL: Record<TaskType, string> = {
  WATCH_LECTURE: "Watch",
  LEARN_TOPIC: "Learn",
  PRACTICE_QUIZ: "Practice quiz",
  REVISE: "Revise",
  REVIEW_MISTAKES: "Review mistakes",
};

const NOTHING_TO_SCHEDULE =
  "There's nothing to schedule yet: the selected courses have no published lectures. Add the topics you need to prepare and try again.";

export type PlanSuggestion = {
  type: "MISSED_TASKS" | "NEW_QUIZ_RESULTS" | "PLAN_ENDED" | "PLAN_COMPLETE";
  message: string;
  count?: number;
};

export function computeProgress(tasks: Pick<StudyTask, "status" | "durationMinutes" | "scheduledDate">[], today: IsoDate) {
  const active = tasks.filter((task) => task.status !== "SKIPPED");
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const todays = active.filter((task) => toIsoDate(task.scheduledDate) === today);
  const totalMinutes = active.reduce((sum, task) => sum + task.durationMinutes, 0);
  const completedMinutes = completed.reduce((sum, task) => sum + task.durationMinutes, 0);
  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    skippedTasks: tasks.length - active.length,
    remainingTasks: active.length - completed.length,
    missedTasks: tasks.filter((task) => task.status === "PENDING" && toIsoDate(task.scheduledDate) < today).length,
    totalMinutes,
    completedMinutes,
    percent: totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0,
    todayTasks: todays.length,
    todayCompleted: todays.filter((task) => task.status === "COMPLETED").length,
    todayMinutes: todays.reduce((sum, task) => sum + task.durationMinutes, 0),
  };
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumberArray(value: Prisma.JsonValue): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function asTopics(value: Prisma.JsonValue): TopicInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { courseId, name, confidence } = item as Record<string, unknown>;
    if (typeof courseId !== "string" || typeof name !== "string") return [];
    return [{ courseId, name, confidence: typeof confidence === "number" ? confidence : null }];
  });
}

function statsFor(attempts: { quizId: string; score: number; passed: boolean }[]): PerformanceStats | null {
  if (attempts.length === 0) return null;
  // attempts are newest first, so the first one seen per quiz is its latest attempt
  const latestPerQuiz = new Map<string, boolean>();
  for (const attempt of attempts) if (!latestPerQuiz.has(attempt.quizId)) latestPerQuiz.set(attempt.quizId, attempt.passed);
  return {
    attempts: attempts.length,
    averageScore: attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length,
    latestScore: attempts[0].score,
    failedQuizCount: [...latestPerQuiz.values()].filter((passed) => !passed).length,
  };
}

@Injectable()
export class StudyPlannerService {
  private readonly logger = new Logger(StudyPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: StudyPlannerAiClient,
  ) {}

  /** Accepts the client's local date when it is within a day of the server's, so timezones line up. */
  resolveToday(raw?: string): IsoDate {
    const serverToday = toIsoDate(new Date());
    if (raw && parseIsoDate(raw) && Math.abs(daysBetween(serverToday, raw)) <= 1) return raw;
    return serverToday;
  }

  private async student(userId?: string): Promise<Student> {
    if (!userId) throw new UnauthorizedException("Authentication required");
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new UnauthorizedException("Authentication required");
    // Quiz attempts, interactions and mock-exam attempts are keyed by email (older rows by user id).
    return { userId, email: user.email, keys: [userId, user.email] };
  }

  // -------------------------------------------------------------------------
  // Academic context
  // -------------------------------------------------------------------------

  async loadContext(student: Student): Promise<{ context: PlannerContext; enrollmentSource: "admission" | "published" }> {
    const [published, admission] = await Promise.all([
      this.prisma.course.findMany({
        where: { isPublished: true },
        select: { id: true, title: true, code: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      this.prisma.studentAdmission.findFirst({
        where: { email: student.email, status: "APPROVED" },
        select: { selectedCourseIds: true },
      }),
    ]);
    const selected = asStringArray((admission?.selectedCourseIds ?? []) as Prisma.JsonValue);
    // The approved admission is the enrolment record; without one, the portal shows every published course.
    const courses = selected.length > 0 ? published.filter((course) => selected.includes(course.id)) : published;
    const courseIds = courses.map((course) => course.id);

    const lectures = courseIds.length
      ? await this.prisma.lecture.findMany({
          where: { courseId: { in: courseIds }, publishedAt: { not: null } },
          select: { id: true, courseId: true, title: true, lectureOrder: true, durationMinutes: true },
          orderBy: [{ lectureOrder: "asc" }, { createdAt: "asc" }],
        })
      : [];
    const lectureIds = lectures.map((lecture) => lecture.id);
    const now = new Date();

    const [interactions, quizzes, attempts, mockExams, mockAttempts] = await Promise.all([
      lectureIds.length
        ? this.prisma.studentInteraction.findMany({
            where: { studentId: { in: student.keys }, lectureId: { in: lectureIds } },
            select: { lectureId: true, watchPercent: true },
          })
        : [],
      lectureIds.length
        ? this.prisma.quizQuestion.findMany({
            where: { status: QuizStatus.APPROVED, lectureId: { in: lectureIds } },
            select: { lectureId: true, topic: true },
          })
        : [],
      this.prisma.quizAttempt.findMany({
        where: { studentId: { in: student.keys }, quiz: { lectureId: { in: lectureIds } } },
        select: {
          quizId: true,
          score: true,
          passed: true,
          quiz: { select: { lectureId: true, topic: true, sourceTopic: true } },
        },
        orderBy: { submittedAt: "desc" },
      }),
      courseIds.length
        ? this.prisma.mockExam.findMany({
            where: {
              status: "PUBLISHED",
              courseId: { in: courseIds },
              OR: [{ endsAt: null }, { endsAt: { gte: now } }],
            },
            select: { id: true, courseId: true, title: true, endsAt: true },
          })
        : [],
      this.prisma.mockExamAttempt.findMany({
        where: { studentId: { in: student.keys } },
        select: { examId: true },
        distinct: ["examId"],
      }),
    ]);

    const watched = new Map<string, number | null>();
    for (const row of interactions) {
      const current = watched.get(row.lectureId) ?? null;
      const value = row.watchPercent;
      watched.set(row.lectureId, value == null ? current : current == null ? value : Math.max(current, value));
    }

    const courseOfLecture = new Map(lectures.map((lecture) => [lecture.id, lecture.courseId]));
    const attemptedExams = new Set(mockAttempts.map((attempt) => attempt.examId));

    const topicGroups = new Map<string, { courseId: string; topic: string; attempts: typeof attempts }>();
    for (const attempt of attempts) {
      const topic = attempt.quiz.topic ?? attempt.quiz.sourceTopic;
      const courseId = attempt.quiz.lectureId ? courseOfLecture.get(attempt.quiz.lectureId) : undefined;
      if (!topic || !courseId) continue;
      const key = `${courseId}|${normalizeTopic(topic)}`;
      const group = topicGroups.get(key) ?? { courseId, topic, attempts: [] as typeof attempts };
      group.attempts.push(attempt);
      topicGroups.set(key, group);
    }

    const context: PlannerContext = {
      courses,
      lectures: lectures.map((lecture) => {
        const lectureQuizzes = quizzes.filter((quiz) => quiz.lectureId === lecture.id);
        return {
          id: lecture.id,
          courseId: lecture.courseId,
          title: lecture.title,
          order: lecture.lectureOrder,
          durationMinutes: lecture.durationMinutes,
          watchPercent: watched.has(lecture.id) ? (watched.get(lecture.id) ?? 0) : null,
          quizCount: lectureQuizzes.length,
          quizTopics: [...new Set(lectureQuizzes.map((quiz) => quiz.topic).filter((t): t is string => Boolean(t)))],
          performance: statsFor(attempts.filter((attempt) => attempt.quiz.lectureId === lecture.id)),
        };
      }),
      topicStats: [...topicGroups.values()].map((group) => ({
        courseId: group.courseId,
        topic: group.topic,
        performance: statsFor(group.attempts)!,
      })),
      mockExams: mockExams.flatMap((exam) =>
        exam.courseId
          ? [
              {
                id: exam.id,
                courseId: exam.courseId,
                title: exam.title,
                endsAt: exam.endsAt ? toIsoDate(exam.endsAt) : null,
                attempted: attemptedExams.has(exam.id),
              },
            ]
          : [],
      ),
    };
    return { context, enrollmentSource: selected.length > 0 ? "admission" : "published" };
  }

  /** What the planner form can prefill from the portal, so students don't retype what it already knows. */
  async getPlannerContext(userId: string, rawToday?: string) {
    const student = await this.student(userId);
    const today = this.resolveToday(rawToday);
    const { context, enrollmentSource } = await this.loadContext(student);
    return {
      today,
      enrollmentSource,
      aiAvailable: this.ai.isConfigured(),
      courses: context.courses.map((course) => {
        const lectures = context.lectures.filter((lecture) => lecture.courseId === course.id);
        const attempts = lectures.reduce((sum, lecture) => sum + (lecture.performance?.attempts ?? 0), 0);
        const scoreSum = lectures.reduce(
          (sum, lecture) => sum + (lecture.performance ? lecture.performance.averageScore * lecture.performance.attempts : 0),
          0,
        );
        return {
          id: course.id,
          title: course.title,
          code: course.code,
          lectureCount: lectures.length,
          completedLectures: lectures.filter((lecture) => (lecture.watchPercent ?? 0) >= LECTURE_COMPLETE_PERCENT).length,
          quizAttempts: attempts,
          averageScore: attempts > 0 ? Math.round(scoreSum / attempts) : null,
          lectures: lectures.map((lecture) => ({
            id: lecture.id,
            title: lecture.title,
            durationMinutes: lecture.durationMinutes,
            watchPercent: lecture.watchPercent != null ? Math.round(lecture.watchPercent) : null,
            completed: (lecture.watchPercent ?? 0) >= LECTURE_COMPLETE_PERCENT,
            quizCount: lecture.quizCount,
            quizAttempts: lecture.performance?.attempts ?? 0,
            averageScore: lecture.performance ? Math.round(lecture.performance.averageScore) : null,
          })),
          topics: context.topicStats
            .filter((stat) => stat.courseId === course.id)
            .map((stat) => ({
              name: stat.topic,
              attempts: stat.performance.attempts,
              averageScore: Math.round(stat.performance.averageScore),
            })),
          upcomingMockExams: context.mockExams
            .filter((exam) => exam.courseId === course.id && !exam.attempted)
            .map((exam) => ({ id: exam.id, title: exam.title, endsAt: exam.endsAt })),
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  private buildInput(
    raw: {
      courseIds: string[];
      topics: { courseId: string; name: string; confidence?: number | null }[];
      examDate: string | null;
      dailyMinutes: number;
      studyDays: number[];
      startTime: string;
      targetScore: number | null;
    },
    context: PlannerContext,
    today: IsoDate,
  ): PlannerInput {
    const enrolled = new Set(context.courses.map((course) => course.id));
    if (raw.courseIds.some((id) => !enrolled.has(id))) {
      throw new BadRequestException("One or more selected courses are not part of your enrolment.");
    }

    const seen = new Set<string>();
    const topics: TopicInput[] = [];
    for (const topic of raw.topics) {
      if (!raw.courseIds.includes(topic.courseId)) {
        throw new BadRequestException("Each topic must belong to one of the selected courses.");
      }
      const name = topic.name.replace(/\s+/g, " ").trim();
      const key = `${topic.courseId}|${normalizeTopic(name)}`;
      if (!normalizeTopic(name) || seen.has(key)) continue;
      seen.add(key);
      topics.push({ courseId: topic.courseId, name, confidence: topic.confidence ?? null });
    }

    let examDate: IsoDate | null = null;
    if (raw.examDate) {
      if (!parseIsoDate(raw.examDate)) throw new BadRequestException("Exam date is not a valid date.");
      if (raw.examDate <= today) throw new BadRequestException("Exam date must be after today.");
      if (daysBetween(today, raw.examDate) > MAX_EXAM_DAYS_AHEAD) {
        throw new BadRequestException("Exam date must be within the next year.");
      }
      examDate = raw.examDate;
    }

    const startMinute = parseClock(raw.startTime);
    if (startMinute === null) throw new BadRequestException("Start time is not a valid time.");
    if (sessionEndMinute(startMinute, raw.dailyMinutes) > MINUTES_PER_DAY) {
      throw new BadRequestException(
        "Your study session would run past midnight. Choose an earlier start time or fewer minutes per day.",
      );
    }

    return {
      courseIds: raw.courseIds,
      topics,
      examDate,
      startDate: today,
      dailyMinutes: raw.dailyMinutes,
      studyDays: [...new Set(raw.studyDays)].sort(),
      startMinute,
      targetScore: raw.targetScore,
    };
  }

  /** Builds a validated schedule. The AI only prioritises and explains; dates and limits are enforced here. */
  async generate(
    context: PlannerContext,
    input: PlannerInput,
    options: { completedWork?: CompletedWork; usage?: DayUsage } = {},
  ) {
    const { units, emptyCourseIds } = buildStudyUnits(context, input);
    if (units.length === 0) throw new BadRequestException(NOTHING_TO_SCHEDULE);

    const endDate = resolveEndDate(input.startDate, input.examDate);
    const days = planDays(input.startDate, endDate, input.studyDays);
    if (days.length === 0) {
      throw new BadRequestException(
        `None of your selected study days fall between ${formatDate(input.startDate)} and ${formatDate(endDate)}. Choose more study days.`,
      );
    }

    let aiStatus: AiStatus = "unavailable";
    let advice = null;
    if (this.ai.isConfigured()) {
      try {
        const raw = await this.ai.requestAdvice(buildAdvicePrompt(units, input, endDate));
        if (raw === null) {
          aiStatus = "unavailable";
        } else {
          advice = validateAdvice(raw, units, allowedFactsFor(units, input));
          aiStatus = advice ? "used" : "invalid";
        }
      } catch (error) {
        aiStatus = "failed";
        this.logger.warn(`Study planner AI failed, using rule-based planner: ${(error as Error).message}`);
      }
    }
    if (advice) applyAdvice(units, advice);

    const unitOrder = new Map(
      [...units]
        .sort((a, b) => (a.aiRank ?? Number.MAX_SAFE_INTEGER) - (b.aiRank ?? Number.MAX_SAFE_INTEGER) || b.score - a.score)
        .map((unit, index) => [unit.key, index]),
    );
    const drafts = generateDraftTasks(units, input, options.completedWork);
    const { scheduled, unscheduled } = scheduleTasks(drafts, {
      days,
      dailyMinutes: input.dailyMinutes,
      startMinute: input.startMinute,
      usage: options.usage,
      unitOrder,
    });

    const errors = validateSchedule(scheduled, {
      days,
      dailyMinutes: input.dailyMinutes,
      usage: options.usage,
      courseIds: new Set(input.courseIds),
      lectureIds: new Set(context.lectures.map((lecture) => lecture.id)),
      mockExamIds: new Set(context.mockExams.map((exam) => exam.id)),
    });
    if (errors.length > 0) {
      this.logger.error(`Generated study plan failed validation: ${errors.join("; ")}`);
      throw new InternalServerErrorException("The study plan could not be validated. Please try again.");
    }

    const recommendations = buildRecommendations({ units, input, context, endDate, unscheduled, emptyCourseIds, advice });
    return {
      scheduled,
      unscheduled,
      endDate,
      recommendations,
      aiStatus,
      generatedBy: advice ? "AI" : "RULES",
      aiSummary: advice?.summary ?? null,
    };
  }

  private taskData(task: ScheduledTask, sortOrder: number) {
    return {
      courseId: task.courseId,
      subject: task.subject,
      topic: task.topic,
      title: task.title.slice(0, 200),
      type: task.type,
      lectureId: task.lectureId,
      mockExamId: task.mockExamId,
      scheduledDate: parseIsoDate(task.scheduledDate)!,
      startMinute: task.startMinute,
      durationMinutes: task.durationMinutes,
      priority: task.priority,
      reason: task.reason,
      sortOrder,
    };
  }

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  private async findOwnedPlan(userId: string, planId: string) {
    // Scoped by owner: another student's plan id is indistinguishable from a missing one.
    const plan = await this.prisma.studyPlan.findFirst({ where: { id: planId, studentId: userId } });
    if (!plan) throw new NotFoundException("Study plan not found");
    return plan;
  }

  private async findActivePlan(userId: string, planId: string) {
    const plan = await this.findOwnedPlan(userId, planId);
    if (plan.status !== "ACTIVE") throw new BadRequestException("Archived plans are read-only.");
    return plan;
  }

  async createPlan(userId: string, dto: CreateStudyPlanDto) {
    const student = await this.student(userId);
    const today = this.resolveToday(dto.today);
    const { context } = await this.loadContext(student);
    // Validate first so the student is never asked to replace a plan with an invalid one.
    const input = this.buildInput(
      {
        courseIds: dto.courseIds,
        topics: dto.topics ?? [],
        examDate: dto.examDate ?? null,
        dailyMinutes: dto.dailyMinutes,
        studyDays: dto.studyDays,
        startTime: dto.startTime,
        targetScore: dto.targetScore ?? null,
      },
      context,
      today,
    );

    const existing = await this.prisma.studyPlan.findFirst({
      where: { studentId: userId, status: "ACTIVE" },
      select: { id: true, title: true },
    });
    if (existing && !dto.replaceExisting) {
      throw new ConflictException({
        statusCode: 409,
        code: "ACTIVE_PLAN_EXISTS",
        message: `You already have an active plan ("${existing.title}"). Confirm to replace it — it will be archived with its history.`,
      });
    }

    const result = await this.generate(context, input);
    if (result.scheduled.length === 0) {
      throw new BadRequestException(
        result.unscheduled.length > 0
          ? "None of the tasks fit your available time. Add more study minutes or study days."
          : "You're already up to date in the selected courses, so there is nothing to schedule. List topics you want to revise to build a plan.",
      );
    }

    const titles = context.courses.filter((course) => input.courseIds.includes(course.id)).map((course) => course.title);
    const title = (dto.title?.trim() || `${titles.join(" & ")} ${input.examDate ? "exam prep" : "study plan"}`).slice(0, 120);

    const plan = await this.prisma.$transaction(async (tx) => {
      const active = await tx.studyPlan.findMany({ where: { studentId: userId, status: "ACTIVE" }, select: { id: true } });
      if (active.length > 0) {
        await tx.studyPlan.updateMany({ where: { id: { in: active.map((p) => p.id) } }, data: { status: "ARCHIVED" } });
        await tx.studyPlanHistory.createMany({
          data: active.map((p) => ({ planId: p.id, action: "ARCHIVED", summary: "Replaced by a new study plan." })),
        });
      }
      return tx.studyPlan.create({
        data: {
          studentId: userId,
          title,
          courseIds: input.courseIds,
          topics: input.topics,
          examDate: input.examDate ? parseIsoDate(input.examDate) : null,
          startDate: parseIsoDate(input.startDate)!,
          endDate: parseIsoDate(result.endDate)!,
          dailyMinutes: input.dailyMinutes,
          studyDays: input.studyDays,
          startMinute: input.startMinute,
          targetScore: input.targetScore,
          goal: dto.goal?.trim() || null,
          generatedBy: result.generatedBy,
          aiSummary: result.aiSummary,
          recommendations: result.recommendations as unknown as Prisma.InputJsonValue,
          tasks: { create: result.scheduled.map((task, index) => this.taskData(task, index)) },
          history: {
            create: {
              action: "CREATED",
              summary: `Plan created with ${result.scheduled.length} tasks (${result.generatedBy === "AI" ? "AI-assisted" : "rule-based"}).`,
              details: { aiStatus: result.aiStatus, unscheduled: result.unscheduled.length },
            },
          },
        },
      });
    });

    return {
      plan: await this.getPlanDetail(userId, plan.id, today),
      generation: { aiStatus: result.aiStatus, unscheduledCount: result.unscheduled.length },
    };
  }

  async listPlans(userId: string) {
    const plans = await this.prisma.studyPlan.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      include: { tasks: { select: { status: true, durationMinutes: true, scheduledDate: true } } },
    });
    const today = this.resolveToday();
    return plans.map(({ tasks, ...plan }) => ({
      id: plan.id,
      title: plan.title,
      status: plan.status,
      startDate: toIsoDate(plan.startDate),
      endDate: toIsoDate(plan.endDate),
      examDate: plan.examDate ? toIsoDate(plan.examDate) : null,
      generatedBy: plan.generatedBy,
      createdAt: plan.createdAt,
      progress: computeProgress(tasks, today),
    }));
  }

  async getActivePlan(userId: string, rawToday?: string) {
    const plan = await this.prisma.studyPlan.findFirst({
      where: { studentId: userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return { plan: plan ? await this.getPlanDetail(userId, plan.id, this.resolveToday(rawToday)) : null };
  }

  async getPlanDetail(userId: string, planId: string, today: IsoDate) {
    const owned = await this.findOwnedPlan(userId, planId);
    if (owned.status === "ACTIVE") await this.syncAutoCompletion(await this.student(userId), owned.id);

    const plan = await this.prisma.studyPlan.findFirstOrThrow({
      where: { id: planId, studentId: userId },
      include: {
        tasks: { orderBy: [{ scheduledDate: "asc" }, { startMinute: "asc" }, { sortOrder: "asc" }] },
        history: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    const courseIds = asStringArray(plan.courseIds);
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, code: true },
    });
    const suggestions = plan.status === "ACTIVE" ? await this.suggestionsFor(userId, plan, plan.tasks, today) : [];

    return {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      courseIds,
      courses,
      topics: asTopics(plan.topics),
      examDate: plan.examDate ? toIsoDate(plan.examDate) : null,
      startDate: toIsoDate(plan.startDate),
      endDate: toIsoDate(plan.endDate),
      dailyMinutes: plan.dailyMinutes,
      studyDays: asNumberArray(plan.studyDays),
      startTime: formatClock(plan.startMinute),
      targetScore: plan.targetScore,
      goal: plan.goal,
      generatedBy: plan.generatedBy,
      aiSummary: plan.aiSummary,
      recommendations: (Array.isArray(plan.recommendations) ? plan.recommendations : []) as unknown as PlanRecommendation[],
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      today,
      tasks: plan.tasks.map((task) => this.serializeTask(task, today)),
      progress: computeProgress(plan.tasks, today),
      suggestions,
      history: plan.history.map((entry) => ({
        id: entry.id,
        action: entry.action,
        summary: entry.summary,
        createdAt: entry.createdAt,
      })),
    };
  }

  private serializeTask(task: StudyTask, today: IsoDate) {
    const scheduledDate = toIsoDate(task.scheduledDate);
    return {
      id: task.id,
      courseId: task.courseId,
      subject: task.subject,
      topic: task.topic,
      title: task.title,
      type: task.type,
      lectureId: task.lectureId,
      mockExamId: task.mockExamId,
      scheduledDate,
      startTime: task.startMinute != null ? formatClock(task.startMinute) : null,
      durationMinutes: task.durationMinutes,
      priority: task.priority,
      status: task.status,
      reason: task.reason,
      skipReason: task.skipReason,
      completedAt: task.completedAt,
      autoCompleted: task.autoCompleted,
      isCustom: task.isCustom,
      isMissed: task.status === "PENDING" && scheduledDate < today,
    };
  }

  /**
   * Marks tasks done when the portal already shows the work happened after the task was planned:
   * the lecture was watched to the end, or its quiz / the mock exam was attempted. Only statuses change;
   * the schedule itself is never moved automatically.
   */
  private async syncAutoCompletion(student: Student, planId: string) {
    const pending = await this.prisma.studyTask.findMany({
      where: { planId, status: "PENDING", OR: [{ type: "WATCH_LECTURE" }, { type: "PRACTICE_QUIZ" }] },
      select: { id: true, type: true, lectureId: true, mockExamId: true, createdAt: true },
    });
    if (pending.length === 0) return;

    const watchLectureIds = pending.filter((t) => t.type === "WATCH_LECTURE" && t.lectureId).map((t) => t.lectureId!);
    const quizLectureIds = pending.filter((t) => t.type === "PRACTICE_QUIZ" && t.lectureId).map((t) => t.lectureId!);
    const examIds = pending.filter((t) => t.mockExamId).map((t) => t.mockExamId!);

    const [views, quizAttempts, examAttempts] = await Promise.all([
      watchLectureIds.length
        ? this.prisma.studentInteraction.findMany({
            where: {
              studentId: { in: student.keys },
              lectureId: { in: watchLectureIds },
              watchPercent: { gte: LECTURE_COMPLETE_PERCENT },
            },
            select: { lectureId: true, interactionDate: true },
          })
        : [],
      quizLectureIds.length
        ? this.prisma.quizAttempt.findMany({
            where: { studentId: { in: student.keys }, quiz: { lectureId: { in: quizLectureIds } } },
            select: { submittedAt: true, quiz: { select: { lectureId: true } } },
          })
        : [],
      examIds.length
        ? this.prisma.mockExamAttempt.findMany({
            where: { studentId: { in: student.keys }, examId: { in: examIds } },
            select: { examId: true, submittedAt: true },
          })
        : [],
    ]);

    const done = pending.filter((task) => {
      if (task.type === "WATCH_LECTURE") {
        return views.some((view) => view.lectureId === task.lectureId && view.interactionDate >= task.createdAt);
      }
      if (task.mockExamId) {
        return examAttempts.some((a) => a.examId === task.mockExamId && a.submittedAt >= task.createdAt);
      }
      return quizAttempts.some((a) => a.quiz.lectureId === task.lectureId && a.submittedAt >= task.createdAt);
    });
    if (done.length === 0) return;
    await this.prisma.studyTask.updateMany({
      where: { id: { in: done.map((task) => task.id) }, planId, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: new Date(), autoCompleted: true },
    });
  }

  /** Suggestions only — nothing here changes the plan without the student confirming. */
  private async suggestionsFor(userId: string, plan: StudyPlan, tasks: StudyTask[], today: IsoDate) {
    const suggestions: PlanSuggestion[] = [];
    const endDate = toIsoDate(plan.endDate);
    const pending = tasks.filter((task) => task.status === "PENDING");
    const missed = pending.filter((task) => toIsoDate(task.scheduledDate) < today);

    if (today > endDate) {
      suggestions.push({
        type: "PLAN_ENDED",
        message: "This plan's schedule has ended. Regenerate it to plan your next study days.",
      });
    } else if (missed.length > 0) {
      suggestions.push({
        type: "MISSED_TASKS",
        count: missed.length,
        message: `You have ${missed.length} unfinished task${missed.length === 1 ? "" : "s"} from previous days. Move ${missed.length === 1 ? "it" : "them"} into your upcoming free study time?`,
      });
    }
    if (tasks.length > 0 && pending.length === 0) {
      suggestions.push({
        type: "PLAN_COMPLETE",
        message: "Every task in this plan is done or skipped. Regenerate it to keep going with your latest results.",
      });
    }

    const lastBuilt = await this.prisma.studyPlanHistory.findFirst({
      where: { planId: plan.id, action: { in: ["CREATED", "REGENERATED"] } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const courseIds = asStringArray(plan.courseIds);
    const student = await this.student(userId);
    const recent = await this.prisma.quizAttempt.findMany({
      where: {
        studentId: { in: student.keys },
        submittedAt: { gt: lastBuilt?.createdAt ?? plan.createdAt },
        quiz: { lectureId: { not: null } },
      },
      select: { passed: true, quiz: { select: { lectureId: true } } },
    });
    if (recent.length > 0 && courseIds.length > 0) {
      const lectures = await this.prisma.lecture.findMany({
        where: { id: { in: recent.map((a) => a.quiz.lectureId!) }, courseId: { in: courseIds } },
        select: { id: true },
      });
      const inPlan = new Set(lectures.map((lecture) => lecture.id));
      const relevant = recent.filter((attempt) => inPlan.has(attempt.quiz.lectureId!));
      const failed = relevant.filter((attempt) => !attempt.passed).length;
      if (relevant.length >= NEW_RESULTS_MIN_ATTEMPTS || failed >= NEW_RESULTS_MIN_FAILED) {
        suggestions.push({
          type: "NEW_QUIZ_RESULTS",
          count: relevant.length,
          message: `You've answered ${relevant.length} quiz question${relevant.length === 1 ? "" : "s"} since this plan was built${failed > 0 ? `, ${failed} incorrectly` : ""}. Regenerate the plan to reprioritise with your latest results.`,
        });
      }
    }
    return suggestions;
  }

  async regeneratePlan(userId: string, planId: string, dto: RegenerateStudyPlanDto) {
    const plan = await this.findActivePlan(userId, planId);
    const student = await this.student(userId);
    const today = this.resolveToday(dto.today);
    const { context } = await this.loadContext(student);

    const previousExam = plan.examDate ? toIsoDate(plan.examDate) : null;
    const examDate = dto.clearExamDate
      ? null
      : (dto.examDate ?? (previousExam && previousExam > today ? previousExam : null));
    const input = this.buildInput(
      {
        courseIds: dto.courseIds ?? asStringArray(plan.courseIds),
        topics: dto.topics ?? asTopics(plan.topics),
        examDate,
        dailyMinutes: dto.dailyMinutes ?? plan.dailyMinutes,
        studyDays: dto.studyDays ?? asNumberArray(plan.studyDays),
        startTime: dto.startTime ?? formatClock(plan.startMinute),
        targetScore: dto.targetScore ?? plan.targetScore,
      },
      context,
      today,
    );

    const tasks = await this.prisma.studyTask.findMany({ where: { planId } });
    const pending = tasks.filter((task) => task.status === "PENDING");
    const completed = tasks.filter((task) => task.status === "COMPLETED");
    const skipped = tasks.filter((task) => task.status === "SKIPPED");

    const completedWork: CompletedWork = new Map();
    const usage: DayUsage = new Map();
    for (const task of completed) {
      const identity = identityForStoredTask(task);
      const work = completedWork.get(identity) ?? { minutes: 0, count: 0 };
      completedWork.set(identity, { minutes: work.minutes + task.durationMinutes, count: work.count + 1 });
      const day = toIsoDate(task.scheduledDate);
      if (day >= today) {
        const current = usage.get(day) ?? { minutes: 0, endMinute: 0 };
        usage.set(day, {
          minutes: current.minutes + task.durationMinutes,
          endMinute: Math.max(current.endMinute, (task.startMinute ?? input.startMinute) + task.durationMinutes),
        });
      }
    }

    const result = await this.generate(context, input, { completedWork, usage });
    const sortBase = tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.studyTask.deleteMany({ where: { planId, status: "PENDING" } });
      await tx.studyPlan.update({
        where: { id: planId },
        data: {
          courseIds: input.courseIds,
          topics: input.topics,
          examDate: input.examDate ? parseIsoDate(input.examDate) : null,
          endDate: parseIsoDate(result.endDate)!,
          dailyMinutes: input.dailyMinutes,
          studyDays: input.studyDays,
          startMinute: input.startMinute,
          targetScore: input.targetScore,
          ...(dto.goal !== undefined ? { goal: dto.goal.trim() || null } : {}),
          generatedBy: result.generatedBy,
          aiSummary: result.aiSummary,
          recommendations: result.recommendations as unknown as Prisma.InputJsonValue,
        },
      });
      if (result.scheduled.length > 0) {
        await tx.studyTask.createMany({
          data: result.scheduled.map((task, index) => ({ planId, ...this.taskData(task, sortBase + index) })),
        });
      }
      await tx.studyPlanHistory.create({
        data: {
          planId,
          action: "REGENERATED",
          summary: `Regenerated: kept ${completed.length} completed and ${skipped.length} skipped task${skipped.length === 1 ? "" : "s"}, replaced ${pending.length} pending with ${result.scheduled.length} new task${result.scheduled.length === 1 ? "" : "s"}.`,
          details: {
            aiStatus: result.aiStatus,
            kept: completed.length + skipped.length,
            removed: pending.length,
            added: result.scheduled.length,
            unscheduled: result.unscheduled.length,
          },
        },
      });
    });

    return {
      plan: await this.getPlanDetail(userId, planId, today),
      generation: { aiStatus: result.aiStatus, unscheduledCount: result.unscheduled.length },
    };
  }

  /** Moves missed pending tasks into free time from today, when the student asks for it. */
  async rescheduleMissed(userId: string, planId: string, rawToday?: string) {
    const plan = await this.findActivePlan(userId, planId);
    const today = this.resolveToday(rawToday);
    const endDate = toIsoDate(plan.endDate);
    if (endDate < today) throw new BadRequestException("This plan has ended — regenerate it to plan new days.");

    const tasks = await this.prisma.studyTask.findMany({
      where: { planId },
      orderBy: [{ scheduledDate: "asc" }, { startMinute: "asc" }],
    });
    const missed = tasks.filter((task) => task.status === "PENDING" && toIsoDate(task.scheduledDate) < today);
    if (missed.length === 0) return { plan: await this.getPlanDetail(userId, planId, today), moved: 0, unplaced: 0 };

    const usage: DayUsage = new Map();
    for (const task of tasks) {
      const day = toIsoDate(task.scheduledDate);
      if (task.status === "SKIPPED" || day < today) continue;
      const current = usage.get(day) ?? { minutes: 0, endMinute: 0 };
      usage.set(day, {
        minutes: current.minutes + task.durationMinutes,
        endMinute: Math.max(current.endMinute, (task.startMinute ?? plan.startMinute) + task.durationMinutes),
      });
    }

    const examIds = missed.map((task) => task.mockExamId).filter((id): id is string => Boolean(id));
    const exams = examIds.length
      ? await this.prisma.mockExam.findMany({ where: { id: { in: examIds } }, select: { id: true, endsAt: true } })
      : [];
    const drafts: DraftTask[] = missed.map((task) => ({
      id: task.id,
      identity: identityForStoredTask(task),
      unitKey: task.id,
      courseId: task.courseId ?? "",
      subject: task.subject,
      topic: task.topic,
      title: task.title,
      type: task.type as TaskType,
      lectureId: task.lectureId,
      mockExamId: task.mockExamId,
      durationMinutes: Math.min(task.durationMinutes, plan.dailyMinutes),
      priority: task.priority as Priority,
      reason: task.reason ?? "",
      dependsOn: null,
      minGapDays: 0,
      deadline: (() => {
        const endsAt = exams.find((exam) => exam.id === task.mockExamId)?.endsAt;
        return endsAt ? toIsoDate(endsAt) : null;
      })(),
    }));

    const { scheduled, unscheduled } = scheduleTasks(drafts, {
      days: planDays(today, endDate, asNumberArray(plan.studyDays)),
      dailyMinutes: plan.dailyMinutes,
      startMinute: plan.startMinute,
      usage,
    });

    await this.prisma.$transaction(async (tx) => {
      for (const task of scheduled) {
        await tx.studyTask.update({
          where: { id: task.id },
          data: { scheduledDate: parseIsoDate(task.scheduledDate)!, startMinute: task.startMinute },
        });
      }
      await tx.studyPlanHistory.create({
        data: {
          planId,
          action: "RESCHEDULED",
          summary: `Moved ${scheduled.length} missed task${scheduled.length === 1 ? "" : "s"} into upcoming days${unscheduled.length > 0 ? `; ${unscheduled.length} didn't fit and stayed where they were` : ""}.`,
          details: { moved: scheduled.length, unplaced: unscheduled.length },
        },
      });
    });

    return {
      plan: await this.getPlanDetail(userId, planId, today),
      moved: scheduled.length,
      unplaced: unscheduled.length,
    };
  }

  async updatePlan(userId: string, planId: string, dto: UpdateStudyPlanDto) {
    await this.findOwnedPlan(userId, planId);
    await this.prisma.studyPlan.update({
      where: { id: planId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.goal !== undefined ? { goal: dto.goal.trim() || null } : {}),
        ...(dto.targetScore !== undefined ? { targetScore: dto.targetScore } : {}),
      },
    });
    return this.getPlanDetail(userId, planId, this.resolveToday());
  }

  async deletePlan(userId: string, planId: string) {
    await this.findOwnedPlan(userId, planId);
    await this.prisma.studyPlan.delete({ where: { id: planId } });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  private async findOwnedTask(userId: string, planId: string, taskId: string) {
    const task = await this.prisma.studyTask.findFirst({
      where: { id: taskId, planId, plan: { studentId: userId } },
      include: { plan: true },
    });
    if (!task) throw new NotFoundException("Task not found");
    if (task.plan.status !== "ACTIVE") throw new BadRequestException("Archived plans are read-only.");
    return task;
  }

  /** Finds a start time on a day while keeping the student's daily study-time limit. */
  private async placeOnDay(
    plan: StudyPlan,
    date: IsoDate,
    durationMinutes: number,
    today: IsoDate,
    options: { excludeTaskId?: string; startTime?: string },
  ) {
    if (!parseIsoDate(date)) throw new BadRequestException("Pick a valid date.");
    if (date < today) throw new BadRequestException("Pick today or a future date.");
    const endDate = toIsoDate(plan.endDate);
    if (date > endDate) {
      throw new BadRequestException(`Pick a date on or before ${formatDate(endDate)}, when this plan ends.`);
    }
    if (durationMinutes > plan.dailyMinutes) {
      throw new BadRequestException(`A task can't be longer than your ${plan.dailyMinutes}-minute daily study time.`);
    }

    const dayTasks = await this.prisma.studyTask.findMany({
      where: {
        planId: plan.id,
        scheduledDate: parseIsoDate(date)!,
        status: { not: "SKIPPED" },
        ...(options.excludeTaskId ? { id: { not: options.excludeTaskId } } : {}),
      },
      select: { startMinute: true, durationMinutes: true },
    });
    const used = dayTasks.reduce((sum, task) => sum + task.durationMinutes, 0);
    if (used + durationMinutes > plan.dailyMinutes) {
      throw new BadRequestException(
        `${formatDate(date)} already has ${used} of your ${plan.dailyMinutes} daily study minutes planned. Pick another day or remove a task first.`,
      );
    }

    if (options.startTime) {
      const start = parseClock(options.startTime);
      if (start === null) throw new BadRequestException("Pick a valid start time.");
      if (start + durationMinutes > MINUTES_PER_DAY) throw new BadRequestException("That task would run past midnight.");
      const overlaps = dayTasks.some(
        (task) =>
          task.startMinute != null &&
          start < task.startMinute + task.durationMinutes &&
          task.startMinute < start + durationMinutes,
      );
      if (overlaps) throw new BadRequestException("That time overlaps another task on the same day.");
      return start;
    }

    const lastEnd = dayTasks.reduce(
      (max, task) => (task.startMinute != null ? Math.max(max, task.startMinute + task.durationMinutes) : max),
      -1,
    );
    const start = lastEnd >= 0 ? Math.max(plan.startMinute, lastEnd + BREAK_MINUTES) : plan.startMinute;
    if (start + durationMinutes > MINUTES_PER_DAY) {
      throw new BadRequestException("That day has no time left before midnight. Pick another day.");
    }
    return start;
  }

  private async taskResponse(userId: string, planId: string, today: IsoDate) {
    return this.getPlanDetail(userId, planId, today);
  }

  async completeTask(userId: string, planId: string, taskId: string, rawToday?: string) {
    const task = await this.findOwnedTask(userId, planId, taskId);
    await this.prisma.studyTask.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date(), autoCompleted: false, skipReason: null },
    });
    return this.taskResponse(userId, planId, this.resolveToday(rawToday));
  }

  async reopenTask(userId: string, planId: string, taskId: string, rawToday?: string) {
    const task = await this.findOwnedTask(userId, planId, taskId);
    await this.prisma.studyTask.update({
      where: { id: task.id },
      data: { status: "PENDING", completedAt: null, autoCompleted: false, skipReason: null },
    });
    return this.taskResponse(userId, planId, this.resolveToday(rawToday));
  }

  async skipTask(userId: string, planId: string, taskId: string, reason?: string, rawToday?: string) {
    const task = await this.findOwnedTask(userId, planId, taskId);
    if (task.status === "COMPLETED") throw new BadRequestException("This task is already completed.");
    await this.prisma.studyTask.update({
      where: { id: task.id },
      data: { status: "SKIPPED", skipReason: reason?.trim() || null, completedAt: null },
    });
    return this.taskResponse(userId, planId, this.resolveToday(rawToday));
  }

  async rescheduleTask(userId: string, planId: string, taskId: string, dto: RescheduleTaskDto) {
    const task = await this.findOwnedTask(userId, planId, taskId);
    if (task.status === "COMPLETED") throw new BadRequestException("Completed tasks can't be rescheduled.");
    const today = this.resolveToday(dto.today);
    const startMinute = await this.placeOnDay(task.plan, dto.scheduledDate, task.durationMinutes, today, {
      excludeTaskId: task.id,
      startTime: dto.startTime,
    });
    await this.prisma.studyTask.update({
      where: { id: task.id },
      // Rescheduling a skipped task brings it back into the plan.
      data: { scheduledDate: parseIsoDate(dto.scheduledDate)!, startMinute, status: "PENDING", skipReason: null },
    });
    return this.taskResponse(userId, planId, today);
  }

  async addTask(userId: string, planId: string, dto: CreateStudyTaskDto) {
    const plan = await this.findActivePlan(userId, planId);
    const today = this.resolveToday(dto.today);
    if (!asStringArray(plan.courseIds).includes(dto.courseId)) {
      throw new BadRequestException("Choose one of the courses in this plan.");
    }
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, isPublished: true },
      select: { title: true },
    });
    if (!course) throw new BadRequestException("That course is not available.");
    if (dto.lectureId) {
      const lecture = await this.prisma.lecture.findFirst({
        where: { id: dto.lectureId, courseId: dto.courseId, publishedAt: { not: null } },
        select: { id: true },
      });
      if (!lecture) throw new BadRequestException("That lecture isn't available in this course.");
    }

    const startMinute = await this.placeOnDay(plan, dto.scheduledDate, dto.durationMinutes, today, {
      startTime: dto.startTime,
    });
    const last = await this.prisma.studyTask.findFirst({
      where: { planId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const topic = dto.topic.replace(/\s+/g, " ").trim();
    await this.prisma.studyTask.create({
      data: {
        planId,
        courseId: dto.courseId,
        subject: course.title,
        topic,
        title: `${TYPE_LABEL[dto.type]}: ${topic}`,
        type: dto.type,
        lectureId: dto.lectureId ?? null,
        scheduledDate: parseIsoDate(dto.scheduledDate)!,
        startMinute,
        durationMinutes: dto.durationMinutes,
        priority: dto.priority ?? "MEDIUM",
        reason: "Added by you.",
        isCustom: true,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
    return this.taskResponse(userId, planId, today);
  }

  async deleteTask(userId: string, planId: string, taskId: string, rawToday?: string) {
    const task = await this.findOwnedTask(userId, planId, taskId);
    if (task.status === "COMPLETED") {
      throw new BadRequestException(
        "Completed tasks are kept as study history. Mark it as not done first if you want to remove it.",
      );
    }
    await this.prisma.studyTask.delete({ where: { id: task.id } });
    return this.taskResponse(userId, planId, this.resolveToday(rawToday));
  }
}

