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
exports.ContentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma.service");
const transcript_segments_1 = require("../quiz/transcript-segments");
const quiz_provider_1 = require("../quiz/quiz.provider");
let ContentService = class ContentService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listCourses() {
        return this.prisma.course.findMany({ orderBy: { createdAt: "desc" } });
    }
    createCourse(body) {
        return this.prisma.course.create({
            data: {
                teacherId: body.teacherId,
                code: body.code,
                title: body.title,
                description: body.description,
                level: body.level,
                isPublished: body.isPublished ?? false,
                sortOrder: body.sortOrder ?? 0,
            },
        });
    }
    updateCourse(id, body) {
        const payload = body;
        return this.prisma.course.update({
            where: { id },
            data: {
                teacherId: payload.teacherId,
                code: payload.code,
                title: payload.title,
                description: payload.description,
                level: payload.level,
                isPublished: payload.isPublished,
                sortOrder: payload.sortOrder,
            },
        });
    }
    deleteCourse(id) {
        return this.prisma.course.delete({ where: { id } });
    }
    listLectures() {
        return this.prisma.lecture.findMany({ orderBy: { createdAt: "desc" } });
    }
    async generateTranscriptForVideo(title, videoUrl) {
        const prompt = `You are an AI video transcriber. Generate a realistic lecture transcript for "${title}".
Return exactly 3 segments separated by blank lines. Label each segment implicitly by paragraph order:
1) introduction and motivation
2) core concepts and examples
3) summary, best practices, and review
Return ONLY the transcript text without headings or markdown.`;
        if ((0, quiz_provider_1.isConfiguredApiKey)(process.env.QUIZ_API_KEY)) {
            const url = process.env.QUIZ_API_URL;
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.QUIZ_API_KEY}`,
                        "x-api-key": process.env.QUIZ_API_KEY,
                    },
                    body: JSON.stringify({ prompt, topic: title, format: "text" }),
                });
                if (response.ok) {
                    const raw = await response.json();
                    const text = raw?.response ?? raw?.text ?? raw?.transcript;
                    if (text)
                        return String(text).trim();
                }
            }
            catch {
                // fallback below
            }
        }
        const ollamaUrl = (0, quiz_provider_1.resolveOllamaUrl)();
        if (ollamaUrl) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            try {
                const response = await fetch(ollamaUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        model: process.env.OLLAMA_MODEL ?? "llama3.1",
                        prompt,
                        stream: false,
                    }),
                });
                if (response.ok) {
                    const raw = await response.json();
                    if (raw?.response)
                        return String(raw.response).trim();
                }
            }
            catch {
                // fallback below
            }
            finally {
                clearTimeout(timeout);
            }
        }
        return (0, transcript_segments_1.buildFallbackTranscript)(title);
    }
    async createLecture(body) {
        let transcript = body.transcript;
        if (!transcript || !transcript.trim()) {
            transcript = await this.generateTranscriptForVideo(body.title, body.videoUrl);
        }
        const durationMinutes = body.durationMinutes ?? 10;
        const durationSeconds = durationMinutes * 60;
        const isCheckpointLocked = body.isCheckpointLocked ?? true;
        const publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();
        const structuredTranscript = transcript && transcript.includes("[Segment")
            ? transcript
            : (0, transcript_segments_1.buildStructuredTranscript)(body.title, (0, transcript_segments_1.splitTranscriptIntoSegments)(transcript || body.title, durationSeconds, 3).map((segment) => segment.text));
        const lecture = await this.prisma.lecture.create({
            data: {
                courseId: body.courseId,
                videoUrl: body.videoUrl,
                transcript: structuredTranscript,
                title: body.title,
                lectureOrder: body.lectureOrder ?? 0,
                durationMinutes,
                videoProvider: body.videoProvider ??
                    (body.videoUrl.includes("youtube.com") || body.videoUrl.includes("youtu.be")
                        ? "YouTube"
                        : "Upload"),
                isCheckpointLocked,
                publishedAt,
            },
        });
        const segments = (0, transcript_segments_1.splitTranscriptIntoSegments)(structuredTranscript, durationSeconds, 3);
        await this.prisma.checkpoint.createMany({
            data: segments.map((segment, index) => ({
                lectureId: lecture.id,
                title: `${segment.label} Checkpoint`,
                timestamp: segment.timestamp,
                sortOrder: index + 1,
                unlockScore: 70,
                isBlocking: true,
                isPublished: true,
            })),
        });
        return lecture;
    }
    async updateLecture(id, body) {
        const payload = body;
        const lecture = await this.prisma.lecture.findUnique({ where: { id } });
        if (!lecture) {
            return this.createLecture(body);
        }
        return this.prisma.lecture.update({
            where: { id },
            data: {
                courseId: payload.courseId,
                videoUrl: payload.videoUrl,
                transcript: payload.transcript,
                title: payload.title,
                lectureOrder: payload.lectureOrder,
                durationMinutes: payload.durationMinutes,
                videoProvider: payload.videoProvider,
                isCheckpointLocked: payload.isCheckpointLocked,
                publishedAt: payload.publishedAt === null ? null : payload.publishedAt ? new Date(payload.publishedAt) : undefined,
            },
        });
    }
    deleteLecture(id) {
        return this.prisma.lecture.delete({ where: { id } });
    }
    listCheckpoints() {
        return this.prisma.checkpoint.findMany({ orderBy: { timestamp: "asc" } });
    }
    createCheckpoint(body) {
        return this.prisma.checkpoint.create({
            data: {
                lectureId: body.lectureId,
                title: body.title ?? "Checkpoint",
                timestamp: body.timestamp,
                requiredQuizId: body.requiredQuizId,
                sortOrder: body.sortOrder ?? 0,
                unlockScore: body.unlockScore ?? 70,
                isBlocking: body.isBlocking ?? true,
                isPublished: body.isPublished ?? false,
            },
        });
    }
    updateCheckpoint(id, body) {
        const payload = body;
        return this.prisma.checkpoint.update({
            where: { id },
            data: {
                lectureId: payload.lectureId,
                title: payload.title,
                timestamp: payload.timestamp,
                requiredQuizId: payload.requiredQuizId,
                sortOrder: payload.sortOrder,
                unlockScore: payload.unlockScore,
                isBlocking: payload.isBlocking,
                isPublished: payload.isPublished,
            },
        });
    }
    deleteCheckpoint(id) {
        return this.prisma.checkpoint.delete({ where: { id } });
    }
    listProgress() {
        return this.prisma.studentProgress.findMany({
            orderBy: { updatedAt: "desc" },
        });
    }
    createProgress(body) {
        return this.prisma.studentProgress.create({
            data: {
                studentId: body.studentId,
                guardianName: body.guardianName,
                currentCourseId: body.currentCourseId,
                currentLectureId: body.currentLectureId,
                avgScore: body.avgScore ?? 0,
                weakTopics: body.weakTopics,
                streakDays: body.streakDays ?? 0,
                lastActivityAt: body.lastActivityAt ? new Date(body.lastActivityAt) : undefined,
                completedCheckpoints: body.completedCheckpoints ?? 0,
                lockedCheckpoints: body.lockedCheckpoints ?? 0,
                progressPercentage: body.progressPercentage ?? 0,
                completedLectures: body.completedLectures ?? 0,
                failedQuizzes: body.failedQuizzes ?? 0,
            },
        });
    }
    updateProgress(id, body) {
        const payload = body;
        return this.prisma.studentProgress.update({
            where: { id },
            data: {
                studentId: payload.studentId,
                guardianName: payload.guardianName,
                currentCourseId: payload.currentCourseId,
                currentLectureId: payload.currentLectureId,
                avgScore: payload.avgScore,
                weakTopics: payload.weakTopics,
                streakDays: payload.streakDays,
                lastActivityAt: payload.lastActivityAt ? new Date(payload.lastActivityAt) : undefined,
                completedCheckpoints: payload.completedCheckpoints,
                lockedCheckpoints: payload.lockedCheckpoints,
                progressPercentage: payload.progressPercentage,
                completedLectures: payload.completedLectures,
                failedQuizzes: payload.failedQuizzes,
            },
        });
    }
    deleteProgress(id) {
        return this.prisma.studentProgress.delete({ where: { id } });
    }
};
exports.ContentService = ContentService;
exports.ContentService = ContentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContentService);
