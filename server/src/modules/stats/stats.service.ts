import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { QuizStatus, UserRole } from "@prisma/client";

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminStats() {
    const users = await this.prisma.user.findMany({
      select: { role: true, createdAt: true, isActive: true },
    });

    const roleCounts: Record<string, number> = {
      Students: 0,
      Teachers: 0,
      Experts: 0,
      Guardians: 0,
      Admins: 0,
    };

    for (const user of users) {
      if (user.role === UserRole.STUDENT) roleCounts.Students += 1;
      if (user.role === UserRole.TEACHER) roleCounts.Teachers += 1;
      if (user.role === UserRole.EXPERT) roleCounts.Experts += 1;
      if (user.role === UserRole.GUARDIAN) roleCounts.Guardians += 1;
      if (user.role === UserRole.ADMIN) roleCounts.Admins += 1;
    }

    const userDistribution = [
      { name: "Students", value: roleCounts.Students, color: "#8B5CF6" },
      { name: "Teachers", value: roleCounts.Teachers, color: "#06b6d4" },
      { name: "Experts", value: roleCounts.Experts, color: "#f59e0b" },
      { name: "Guardians", value: roleCounts.Guardians, color: "#ec4899" },
      { name: "Admins", value: roleCounts.Admins, color: "#10b981" },
    ].filter((item) => item.value > 0);

    const now = new Date();
    const monthlySignups = [];
    for (let i = 5; i >= 0; i -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const count = users.filter(
        (user) => user.createdAt >= monthStart && user.createdAt <= monthEnd,
      ).length;
      monthlySignups.push({
        month: monthStart.toLocaleString("en-US", { month: "short" }),
        signups: count,
      });
    }

    const [courses, lectures, quizzes, attempts] = await Promise.all([
      this.prisma.course.count(),
      this.prisma.lecture.count(),
      this.prisma.quizQuestion.count({ where: { status: QuizStatus.APPROVED } }),
      this.prisma.quizAttempt.count(),
    ]);

    return {
      userDistribution,
      monthlySignups,
      totals: {
        courses,
        lectures,
        approvedQuizzes: quizzes,
        quizAttempts: attempts,
        activeUsers: users.filter((user) => user.isActive).length,
      },
    };
  }

  async getTeacherStats() {
    const [attempts, progressRecords] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        orderBy: { submittedAt: "asc" },
        select: { score: true, submittedAt: true, passed: true },
      }),
      this.prisma.studentProgress.findMany({
        select: { lastActivityAt: true, avgScore: true },
      }),
    ]);

    const weeklyBuckets = new Map<string, { total: number; count: number }>();
    for (const attempt of attempts) {
      const weekLabel = `Week ${Math.ceil(
        (attempt.submittedAt.getTime() - Date.now() + 6 * 7 * 24 * 60 * 60 * 1000) /
          (7 * 24 * 60 * 60 * 1000),
      )}`;
      const bucket = weeklyBuckets.get(weekLabel) ?? { total: 0, count: 0 };
      bucket.total += attempt.score;
      bucket.count += 1;
      weeklyBuckets.set(weekLabel, bucket);
    }

    const performanceData =
      attempts.length === 0
        ? [{ name: "No data", score: 0 }]
        : Array.from(weeklyBuckets.entries())
            .slice(-6)
            .map(([name, bucket]) => ({
              name,
              score: Math.round(bucket.total / bucket.count),
            }));

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const studentActivityData = dayNames.map((name, index) => {
      const active = progressRecords.filter((record) => {
        if (!record.lastActivityAt) return false;
        return record.lastActivityAt.getDay() === index;
      }).length;
      return { name, active };
    });

    const avgQuizScore =
      attempts.length === 0
        ? 0
        : Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length);

    return {
      performanceData,
      studentActivityData,
      avgQuizScore,
      totalAttempts: attempts.length,
      passRate:
        attempts.length === 0
          ? 0
          : Math.round(
              (attempts.filter((item) => item.passed).length / attempts.length) * 100,
            ),
    };
  }

  async getExpertStats() {
    const quizzes = await this.prisma.quizQuestion.findMany({
      select: { status: true, reviewedBy: true, reviewedAt: true },
    });

    const teacherApproved = quizzes.filter(
      (quiz) => quiz.status === QuizStatus.TEACHER_APPROVED,
    ).length;
    const approved = quizzes.filter((quiz) => quiz.status === QuizStatus.APPROVED).length;
    const rejected = quizzes.filter((quiz) => quiz.status === QuizStatus.REJECTED).length;
    const reviewed = approved + rejected;
    const auditAccuracy = reviewed === 0 ? 0 : Math.round((approved / reviewed) * 1000) / 10;

    const expertReviews = quizzes.filter(
      (quiz) =>
        quiz.reviewedBy &&
        quiz.reviewedBy.toLowerCase().includes("expert") &&
        quiz.reviewedAt,
    ).length;

    return {
      pendingReview: teacherApproved,
      auditAccuracy,
      expertReviews,
      approved,
      rejected,
    };
  }
}
