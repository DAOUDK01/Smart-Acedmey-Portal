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
exports.QuizService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma.service");
const key_client_1 = require("./key.client");
const ai_quiz_prompt_1 = require("./ai-quiz.prompt");
const client_1 = require("@prisma/client");
const quiz_serializer_1 = require("./quiz.serializer");
const quiz_fallback_1 = require("./quiz.fallback");
const quiz_provider_1 = require("./quiz.provider");
const transcript_segments_1 = require("./transcript-segments");
let QuizService = class QuizService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listQuizQuestions() {
        const quizzes = await this.prisma.quizQuestion.findMany({ orderBy: { createdAt: "desc" } });
        return (0, quiz_serializer_1.serializeQuizzes)(quizzes);
    }
    async listQuizQuestionsByStatus(status) {
        const quizzes = await this.prisma.quizQuestion.findMany({
            where: { status },
            orderBy: { createdAt: "desc" },
        });
        return (0, quiz_serializer_1.serializeQuizzes)(quizzes);
    }
    async getQuizQuestion(id) {
        const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
        return quiz ? (0, quiz_serializer_1.serializeQuiz)(quiz) : null;
    }
    async requestRemoteQuiz(topic, transcript) {
        const apiKey = process.env.QUIZ_API_KEY;
        if (!(0, quiz_provider_1.isConfiguredApiKey)(apiKey)) {
            return null;
        }
        const client = new key_client_1.QuizApiClient(apiKey, process.env.QUIZ_API_URL);
        return client.generateQuiz(topic || "General", transcript);
    }
    async requestOllamaQuiz(prompt) {
        const ollamaUrl = (0, quiz_provider_1.resolveOllamaUrl)();
        if (!ollamaUrl) {
            return null;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
            const response = await fetch(ollamaUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: process.env.OLLAMA_MODEL ?? "llama3.1",
                    prompt: `${ai_quiz_prompt_1.AI_QUIZ_PROMPT}\n\nTopic/Transcript: ${prompt}`,
                    stream: false,
                    format: "json",
                }),
            });
            if (!response.ok) {
                throw new Error(`Ollama request failed with status ${response.status}`);
            }
            const raw = await response.json();
            if (!raw?.response) {
                throw new Error("Ollama response missing expected field");
            }
            return JSON.parse(raw.response);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    normalizeQuizPayload(quizData, topic, transcript, questionCount) {
        if (!quizData?.questions?.length) {
            return (0, quiz_fallback_1.generateFallbackQuiz)(topic, transcript, questionCount);
        }
        return {
            topic: quizData.topic || topic,
            questions: quizData.questions.slice(0, questionCount),
            provider: quizData.provider ?? "ai",
        };
    }
    async resolveQuizData(topic, transcript, questionCount) {
        const prompt = topic || transcript || "Generate a quiz";
        if ((0, quiz_provider_1.isConfiguredApiKey)(process.env.QUIZ_API_KEY)) {
            try {
                const remote = await this.requestRemoteQuiz(topic, transcript);
                if (remote) {
                    return this.normalizeQuizPayload(remote, topic, transcript, questionCount);
                }
            }
            catch (error) {
                console.warn("Remote quiz provider failed, trying fallback chain.", error);
            }
        }
        const ollamaUrl = (0, quiz_provider_1.resolveOllamaUrl)();
        if (ollamaUrl) {
            try {
                const ollamaQuiz = await this.requestOllamaQuiz(prompt);
                return this.normalizeQuizPayload(ollamaQuiz, topic, transcript, questionCount);
            }
            catch (error) {
                console.warn("Ollama quiz generation failed, using local fallback.", error);
            }
        }
        return (0, quiz_fallback_1.generateFallbackQuiz)(topic, transcript, questionCount);
    }
    attachSegmentMetadata(questions, segments) {
        return questions.map((question, index) => {
            const segment = segments[index] ?? segments[segments.length - 1];
            return {
                ...question,
                timestamp: question.timestamp ?? segment?.timestamp,
                segment: question.segment ?? segment?.label,
                difficulty: segment?.difficulty ?? question.difficulty,
                topic: question.topic ?? (segment ? `${segment.label}|${segment.text.slice(0, 80)}` : undefined),
            };
        });
    }
    async generateQuizQuestions(lectureId, topic, transcript, questionCount = 3, segments, durationSeconds) {
        const prompt = topic || transcript || "Generate a quiz";
        const topicName = topic || "Lecture Review";
        const resolvedSegments = segments?.length && segments.length > 0
            ? segments
            : (0, transcript_segments_1.splitTranscriptIntoSegments)(transcript || topicName, durationSeconds ?? questionCount * 120, Math.max(1, Math.min(questionCount, 8)));
        let quizData = (0, quiz_fallback_1.generateFallbackQuizFromSegments)(topicName, resolvedSegments);
        if ((0, quiz_provider_1.isConfiguredApiKey)(process.env.QUIZ_API_KEY) || (0, quiz_provider_1.resolveOllamaUrl)()) {
            const aiData = await this.resolveQuizData(topicName, transcript, resolvedSegments.length);
            if (aiData?.questions?.length) {
                quizData = {
                    ...aiData,
                    questions: this.attachSegmentMetadata(aiData.questions, resolvedSegments),
                };
            }
        }
        const createdQuestions = [];
        for (const q of quizData.questions) {
            const segment = resolvedSegments[createdQuestions.length];
            const question = await this.prisma.quizQuestion.create({
                data: {
                    lectureId,
                    sourceTopic: quizData.topic,
                    sourceTranscript: segment?.text ?? transcript,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    difficulty: q.difficulty ?? segment?.difficulty ?? "medium",
                    topic: q.topic || quizData.topic,
                    timestamp: q.timestamp ?? segment?.timestamp,
                    status: client_1.QuizStatus.PENDING,
                    aiPrompt: prompt,
                },
            });
            createdQuestions.push({
                ...(0, quiz_serializer_1.serializeQuiz)(question),
                segment: q.segment ?? segment?.label,
            });
        }
        if (lectureId) {
            await this.syncCheckpointsForLecture(lectureId, resolvedSegments);
        }
        return {
            provider: quizData.provider ?? "ai",
            questions: createdQuestions,
            segments: resolvedSegments,
        };
    }
    async syncCheckpointsForLecture(lectureId, segments) {
        const existing = await this.prisma.checkpoint.findMany({
            where: { lectureId },
            orderBy: { sortOrder: "asc" },
        });
        for (const [index, segment] of segments.entries()) {
            const payload = {
                title: `${segment.label} Checkpoint`,
                timestamp: segment.timestamp,
                sortOrder: index + 1,
                unlockScore: 70,
                isBlocking: true,
                isPublished: true,
            };
            if (existing[index]) {
                await this.prisma.checkpoint.update({
                    where: { id: existing[index].id },
                    data: payload,
                });
            }
            else {
                await this.prisma.checkpoint.create({
                    data: { lectureId, ...payload },
                });
            }
        }
    }
    async createQuizQuestion(body) {
        const question = await this.prisma.quizQuestion.create({ data: body });
        return (0, quiz_serializer_1.serializeQuiz)(question);
    }
    async updateQuizQuestion(id, body) {
        const question = await this.prisma.quizQuestion.update({
            where: { id },
            data: {
                ...body,
                reviewedAt: body.status === client_1.QuizStatus.APPROVED ||
                    body.status === client_1.QuizStatus.REJECTED ||
                    body.status === client_1.QuizStatus.TEACHER_APPROVED
                    ? new Date()
                    : undefined,
                publishedAt: body.status === client_1.QuizStatus.APPROVED ? new Date() : undefined,
            },
        });
        return (0, quiz_serializer_1.serializeQuiz)(question);
    }
    async teacherApproveQuiz(id, reviewedBy) {
        const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
        if (!quiz) {
            throw new common_1.BadRequestException("Quiz not found");
        }
        if (quiz.status !== client_1.QuizStatus.PENDING && quiz.status !== client_1.QuizStatus.EDITED) {
            throw new common_1.BadRequestException("Only pending quizzes can be approved by teachers");
        }
        return this.updateQuizQuestion(id, {
            status: client_1.QuizStatus.TEACHER_APPROVED,
            reviewedBy: reviewedBy ?? "Teacher",
        });
    }
    async expertApproveQuiz(id, reviewedBy) {
        const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
        if (!quiz) {
            throw new common_1.BadRequestException("Quiz not found");
        }
        if (quiz.status !== client_1.QuizStatus.TEACHER_APPROVED) {
            throw new common_1.BadRequestException("Only teacher-approved quizzes can be approved by experts");
        }
        return this.updateQuizQuestion(id, {
            status: client_1.QuizStatus.APPROVED,
            reviewedBy: reviewedBy ?? "Expert",
        });
    }
    async rejectQuiz(id, reviewedBy) {
        return this.updateQuizQuestion(id, {
            status: client_1.QuizStatus.REJECTED,
            reviewedBy: reviewedBy ?? "Reviewer",
        });
    }
    deleteQuizQuestion(id) {
        return this.prisma.quizQuestion.delete({ where: { id } });
    }
    async listQuizAttempts(studentId) {
        const attempts = await this.prisma.quizAttempt.findMany({
            where: studentId ? { studentId } : undefined,
            orderBy: { createdAt: "desc" },
        });
        return attempts;
    }
    async getApprovedQuizForAttempt(id) {
        const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
        if (!quiz || quiz.status !== client_1.QuizStatus.APPROVED) {
            return null;
        }
        return (0, quiz_serializer_1.serializeQuiz)(quiz);
    }
    createQuizAttempt(body) {
        return this.prisma.quizAttempt.create({ data: body });
    }
};
exports.QuizService = QuizService;
exports.QuizService = QuizService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], QuizService);
