"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma.service");
const client_1 = require("@prisma/client");
let StatsService = class StatsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAdminStats() {
        const users = await this.prisma.user.findMany({
            select: { role: true, createdAt: true, isActive: true },
        });
        const roleCounts = {
            Students: 0,
            Teachers: 0,
            Experts: 0,
            Guardians: 0,
            Admins: 0,
        };
        for (const user of users) {
            if (user.role === client_1.UserRole.STUDENT)
                roleCounts.Students += 1;
            if (user.role === client_1.UserRole.TEACHER)
                roleCounts.Teachers += 1;
            if (user.role === client_1.UserRole.EXPERT)
                roleCounts.Experts += 1;
            if (user.role === client_1.UserRole.GUARDIAN)
                roleCounts.Guardians += 1;
            if (user.role === client_1.UserRole.ADMIN)
                roleCounts.Admins += 1;
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
            const count = users.filter((user) => user.createdAt >= monthStart && user.createdAt <= monthEnd).length;
            monthlySignups.push({
                month: monthStart.toLocaleString("en-US", { month: "short" }),
                signups: count,
            });
        }
        const [courses, lectures, quizzes, attempts] = await Promise.all([
            this.prisma.course.count(),
            this.prisma.lecture.count(),
            this.prisma.quizQuestion.count({ where: { status: client_1.QuizStatus.APPROVED } }),
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
        const weeklyBuckets = new Map();
        for (const attempt of attempts) {
            const weekLabel = `Week ${Math.ceil((attempt.submittedAt.getTime() - Date.now() + 6 * 7 * 24 * 60 * 60 * 1000) /
                (7 * 24 * 60 * 60 * 1000))}`;
            const bucket = weeklyBuckets.get(weekLabel) ?? { total: 0, count: 0 };
            bucket.total += attempt.score;
            bucket.count += 1;
            weeklyBuckets.set(weekLabel, bucket);
        }
        const performanceData = attempts.length === 0
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
                if (!record.lastActivityAt)
                    return false;
                return record.lastActivityAt.getDay() === index;
            }).length;
            return { name, active };
        });
        const avgQuizScore = attempts.length === 0
            ? 0
            : Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length);
        return {
            performanceData,
            studentActivityData,
            avgQuizScore,
            totalAttempts: attempts.length,
            passRate: attempts.length === 0
                ? 0
                : Math.round((attempts.filter((item) => item.passed).length / attempts.length) * 100),
        };
    }
    async getExpertStats() {
        const quizzes = await this.prisma.quizQuestion.findMany({
            select: { status: true, reviewedBy: true, reviewedAt: true },
        });
        const teacherApproved = quizzes.filter((quiz) => quiz.status === client_1.QuizStatus.TEACHER_APPROVED).length;
        const approved = quizzes.filter((quiz) => quiz.status === client_1.QuizStatus.APPROVED).length;
        const rejected = quizzes.filter((quiz) => quiz.status === client_1.QuizStatus.REJECTED).length;
        const reviewed = approved + rejected;
        const auditAccuracy = reviewed === 0 ? 0 : Math.round((approved / reviewed) * 1000) / 10;
        const expertReviews = quizzes.filter((quiz) => quiz.reviewedBy &&
            quiz.reviewedBy.toLowerCase().includes("expert") &&
            quiz.reviewedAt).length;
        return {
            pendingReview: teacherApproved,
            auditAccuracy,
            expertReviews,
            approved,
            rejected,
        };
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StatsService);
