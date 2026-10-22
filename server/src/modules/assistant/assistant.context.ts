import { Injectable, Logger } from "@nestjs/common";
import { QuizStatus } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { GuardianService } from "../guardian/guardian.service";
import { StatsService } from "../stats/stats.service";
import { LECTURE_COMPLETE_PERCENT, toIsoDate } from "../study-planner/study-planner.engine";
import { StudyPlannerService } from "../study-planner/study-planner.service";
import { AssistantRole } from "./assistant.guide";

/** Below this average (with at least NEEDS_SUPPORT_MIN_ATTEMPTS answers) a student is flagged for support. */
const NEEDS_SUPPORT_SCORE = 50;
const NEEDS_SUPPORT_MIN_ATTEMPTS = 2;
const MAX_MISTAKES = 8;

const round = (value: number) => Math.round(value);
const average = (values: number[]) => (values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null);

export type AssistantUser = { userId: string; role: AssistantRole };

/**
 * Builds the facts the assistant may use for one user. Every query is scoped to the authenticated
 * user (their own records, their child, their assigned courses, or platform totals for admins),
 * and only names — never emails or ids of other people — are included.
 */
@Injectable()
export class AssistantContextService {
  private readonly logger = new Logger(AssistantContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: StudyPlannerService,
    private readonly guardian: GuardianService,
    private readonly stats: StatsService,
  ) {}

  async firstName(userId: string) {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return account?.name?.split(" ")[0] ?? "there";
  }

  async build(user: AssistantUser): Promise<{ name: string; data: Record<string, unknown> | null }> {
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true, email: true },
    });
    const name = account?.name?.split(" ")[0] ?? "there";
    if (!account) return { name, data: null };
    try {
      switch (user.role) {
        case "STUDENT":
          return { name, data: await this.student(user.userId, account.email) };
        case "TEACHER":
          return { name, data: await this.teacher(user.userId) };
        case "GUARDIAN":
          return { name, data: await this.guardianData(account.email) };
        case "ADMIN":
          return { name, data: await this.admin() };
      }
    } catch (error) {
      this.logger.warn(`Assistant context for ${user.role} could not be loaded: ${(error as Error).message}`);
      return { name, data: null };
    }
  }

  async student(userId: string, email: string) {
    const keys = [userId, email];
    const { context } = await this.planner.loadContext({ userId, email, keys });

    const failed = await this.prisma.quizAttempt.findMany({
      where: { studentId: { in: keys }, passed: false, quiz: { lectureId: { not: null } } },
      orderBy: { submittedAt: "desc" },
      take: 40,
      select: {
        quizId: true,
        submittedAt: true,
        quiz: { select: { question: true, correctAnswer: true, answerExplanation: true, topic: true, lectureId: true } },
      },
    });
    const passedLater = new Set(
      (
        await this.prisma.quizAttempt.findMany({
          where: { studentId: { in: keys }, passed: true, quizId: { in: failed.map((a) => a.quizId) } },
          select: { quizId: true },
        })
      ).map((a) => a.quizId),
    );
    const lectureTitle = new Map(context.lectures.map((l) => [l.id, l.title]));
    // One entry per question the student still hasn't answered correctly, newest first.
    const latestPerQuiz = new Map<string, (typeof failed)[number]>();
    for (const attempt of failed) {
      if (!passedLater.has(attempt.quizId) && !latestPerQuiz.has(attempt.quizId)) latestPerQuiz.set(attempt.quizId, attempt);
    }
    const mistakes = [...latestPerQuiz.values()]
      .slice(0, MAX_MISTAKES)
      .map((attempt) => ({
        lecture: attempt.quiz.lectureId ? (lectureTitle.get(attempt.quiz.lectureId) ?? null) : null,
        topic: attempt.quiz.topic,
        question: attempt.quiz.question,
        correctAnswer: attempt.quiz.correctAnswer,
        explanation: attempt.quiz.answerExplanation,
      }));

    const plan = await this.prisma.studyPlan.findFirst({
      where: { studentId: userId, status: "ACTIVE" },
      select: {
        title: true,
        examDate: true,
        endDate: true,
        tasks: { select: { title: true, status: true, durationMinutes: true, scheduledDate: true } },
      },
    });
    const today = toIsoDate(new Date());

    return {
      courses: context.courses.map((course) => {
        const lectures = context.lectures.filter((l) => l.courseId === course.id);
        return {
          title: course.title,
          lectures: lectures.map((l) => ({
            title: l.title,
            finished: (l.watchPercent ?? 0) >= LECTURE_COMPLETE_PERCENT,
            watchPercent: l.watchPercent != null ? round(l.watchPercent) : null,
            checkpointQuestions: l.quizCount,
            quizAttempts: l.performance?.attempts ?? 0,
            averageQuizScore: l.performance ? round(l.performance.averageScore) : null,
          })),
          openMockExams: context.mockExams
            .filter((e) => e.courseId === course.id && !e.attempted)
            .map((e) => ({ title: e.title, closes: e.endsAt })),
        };
      }),
      recentUnresolvedQuizMistakes: mistakes,
      studyPlan: plan
        ? {
            title: plan.title,
            examDate: plan.examDate ? toIsoDate(plan.examDate) : null,
            endDate: toIsoDate(plan.endDate),
            completedTasks: plan.tasks.filter((t) => t.status === "COMPLETED").length,
            totalTasks: plan.tasks.filter((t) => t.status !== "SKIPPED").length,
            todaysTasks: plan.tasks
              .filter((t) => toIsoDate(t.scheduledDate) === today)
              .map((t) => ({ title: t.title, status: t.status, minutes: t.durationMinutes })),
          }
        : null,
      notes: [
        "A topic is only 'weak' when it has at least 2 quiz attempts averaging below 60%.",
        "A lecture counts as finished at 80% watch progress.",
      ],
    };
  }

  async teacher(userId: string) {
    const assignments = await this.prisma.sectionCourseAssignment.findMany({
      where: { teacherId: userId, isActive: true },
      select: {
        courseId: true,
        course: { select: { title: true, isPublished: true } },
        section: { select: { name: true, academicClass: { select: { name: true } } } },
      },
    });
    if (assignments.length === 0) {
      const overall = await this.stats.getTeacherStats();
      return {
        assignedCourses: [],
        note: "No course assignments were found for this teacher. Only the portal-wide quiz totals shown on the teacher dashboard are available.",
        portalQuizTotals: { averageScore: overall.avgQuizScore, attempts: overall.totalAttempts, passRate: overall.passRate },
      };
    }

    const courseIds = [...new Set(assignments.map((a) => a.courseId))];
    const lectures = await this.prisma.lecture.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true, courseId: true, title: true, publishedAt: true, processingStatus: true },
    });
    const lectureIds = lectures.map((l) => l.id);
    const [quizCounts, attempts, mockExams] = await Promise.all([
      this.prisma.quizQuestion.groupBy({
        by: ["status"],
        where: { lectureId: { in: lectureIds } },
        _count: { _all: true },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quiz: { lectureId: { in: lectureIds } } },
        select: { studentId: true, score: true, passed: true, quiz: { select: { lectureId: true } } },
      }),
      this.prisma.mockExam.groupBy({
        by: ["status"],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
    ]);

    const courseOfLecture = new Map(lectures.map((l) => [l.id, l.courseId]));
    const byStudent = new Map<string, number[]>();
    for (const attempt of attempts) {
      byStudent.set(attempt.studentId, [...(byStudent.get(attempt.studentId) ?? []), attempt.score]);
    }
    const flaggedKeys = [...byStudent.entries()]
      .filter(([, scores]) => scores.length >= NEEDS_SUPPORT_MIN_ATTEMPTS && (average(scores) ?? 100) < NEEDS_SUPPORT_SCORE)
      .sort((a, b) => (average(a[1]) ?? 0) - (average(b[1]) ?? 0))
      .slice(0, 10);
    const people = await this.prisma.user.findMany({
      where: { OR: [{ email: { in: flaggedKeys.map(([key]) => key) } }, { id: { in: flaggedKeys.map(([key]) => key) } }] },
      select: { id: true, email: true, name: true },
    });
    const nameOf = (key: string) => people.find((p) => p.email === key || p.id === key)?.name ?? "A student";

    return {
      assignedCourses: courseIds.map((courseId) => {
        const assignment = assignments.find((a) => a.courseId === courseId)!;
        const courseLectures = lectures.filter((l) => l.courseId === courseId);
        const scores = attempts.filter((a) => a.quiz.lectureId && courseOfLecture.get(a.quiz.lectureId) === courseId);
        return {
          title: assignment.course.title,
          published: assignment.course.isPublished,
          sections: assignments
            .filter((a) => a.courseId === courseId)
            .map((a) => `${a.section.academicClass.name} – ${a.section.name}`),
          lectures: courseLectures.length,
          publishedLectures: courseLectures.filter((l) => l.publishedAt).length,
          lecturesStillProcessing: courseLectures.filter((l) => l.processingStatus === "PROCESSING").length,
          lecturesFailedProcessing: courseLectures.filter((l) => l.processingStatus === "FAILED").length,
          quizAttempts: scores.length,
          averageScore: average(scores.map((s) => s.score)),
          passRate: scores.length ? round((scores.filter((s) => s.passed).length / scores.length) * 100) : null,
        };
      }),
      quizQuestionsByStatus: Object.fromEntries(quizCounts.map((q) => [q.status, q._count._all])),
      mockExamsByStatus: Object.fromEntries(mockExams.map((m) => [m.status, m._count._all])),
      studentsWhoMayNeedSupport: flaggedKeys.map(([key, scores]) => ({
        name: nameOf(key),
        averageScore: average(scores),
        attempts: scores.length,
      })),
      notes: [
        `Students are flagged when they have at least ${NEEDS_SUPPORT_MIN_ATTEMPTS} quiz answers in your courses averaging below ${NEEDS_SUPPORT_SCORE}%.`,
      ],
    };
  }

  async guardianData(email: string) {
    const dashboard = await this.guardian.dashboard(email);
    if (!dashboard.student) {
      return { child: null, note: "No student is linked to this parent account yet." };
    }
    const progress = dashboard.progress;
    const attemptedCourses = dashboard.courses.filter((course) => course.attemptCount > 0);
    return {
      child: { name: dashboard.student.name },
      progress: progress
        ? {
            overallProgressPercent: round(progress.progressPercentage),
            averageQuizScore: round(progress.avgScore),
            completedLectures: progress.completedLectures,
            failedQuizzes: progress.failedQuizzes,
            streakDays: progress.streakDays,
            lastActivity: progress.lastActivityAt ? toIsoDate(new Date(progress.lastActivityAt)) : null,
          }
        : null,
      weakTopics: dashboard.weakTopics,
      subjects: attemptedCourses.map((course) => ({
        title: course.title,
        averageScore: course.avgScore,
        quizAnswers: course.attemptCount,
        correct: course.passed,
        incorrect: course.failed,
      })),
      subjectsWithoutQuizAttempts: dashboard.courses.filter((course) => course.attemptCount === 0).map((c) => c.title),
      lecturesAttempted: dashboard.lectures.filter((l) => l.attempted).length,
      lecturesNeedingReview: dashboard.lectures
        .filter((l) => l.attempted && l.avgScore < NEEDS_SUPPORT_SCORE)
        .map((l) => ({ title: l.title, averageScore: l.avgScore })),
      recentQuizAnswers: dashboard.attempts.slice(0, 10).map((a) => ({
        topic: a.topic,
        correct: a.passed,
        date: toIsoDate(new Date(a.submittedAt)),
      })),
    };
  }

  async admin() {
    const [stats, staffPending, admissions, coursesPublished, coursesDraft, pendingQuizzes] = await Promise.all([
      this.stats.getAdminStats(),
      this.prisma.staffInvitation.count({ where: { status: "SUBMITTED" } }),
      this.prisma.studentAdmission.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.course.count({ where: { isPublished: true } }),
      this.prisma.course.count({ where: { isPublished: false } }),
      this.prisma.quizQuestion.count({ where: { status: QuizStatus.PENDING } }),
    ]);
    return {
      totals: stats.totals,
      usersByRole: Object.fromEntries(stats.userDistribution.map((item) => [item.name, item.value])),
      signupsLastSixMonths: stats.monthlySignups,
      teacherRegistrationsAwaitingReview: staffPending,
      admissionsByStatus: Object.fromEntries(admissions.map((a) => [a.status, a._count._all])),
      courses: { published: coursesPublished, unpublished: coursesDraft },
      quizQuestionsAwaitingTeacherReview: pendingQuizzes,
    };
  }
}
