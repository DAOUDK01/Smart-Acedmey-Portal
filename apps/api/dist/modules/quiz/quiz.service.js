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
let QuizService = class QuizService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listQuizQuestions() {
        return this.prisma.quizQuestion.findMany({ orderBy: { createdAt: "desc" } });
    }
    getQuizQuestion(id) {
        return this.prisma.quizQuestion.findUnique({ where: { id } });
    }
    async generateQuizQuestions(lectureId, topic, transcript) {
        const apiKey = process.env.QUIZ_API_KEY;
        const useLocalOllama = !apiKey;
        const prompt = topic || transcript || "Generate a quiz";
        let quizData;
        if (useLocalOllama) {
            const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
            try {
                const response = await fetch(ollamaUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: process.env.OLLAMA_MODEL ?? "llama3.1",
                        prompt: `${ai_quiz_prompt_1.AI_QUIZ_PROMPT}\n\nTopic/Transcript: ${prompt}`,
                        stream: false,
                        format: "json",
                    }),
                });
                if (response.ok) {
                    const raw = await response.json();
                    if (raw?.response) {
                        try {
                            quizData = JSON.parse(raw.response);
                        }
                        catch (e) {
                            console.warn("Failed to parse Ollama JSON, falling back to mock data");
                        }
                    }
                }
            }
            catch (e) {
                console.warn("Ollama request failed, falling back to mock data");
            }
        }
        else {
            const client = new key_client_1.QuizApiClient(apiKey, process.env.QUIZ_API_URL);
            try {
                quizData = await client.generateQuiz(topic || "General", transcript);
            }
            catch (e) {
                console.warn("Quiz API request failed, falling back to mock data");
            }
        }
        if (!quizData) {
            quizData = {
                topic: topic || "General",
                questions: [
                    { difficulty: "easy", question: "Sample question 1?", options: ["A", "B", "C", "D"], correctAnswer: "A", topic: "Sample" },
                    { difficulty: "medium", question: "Sample question 2?", options: ["W", "X", "Y", "Z"], correctAnswer: "X", topic: "Sample" },
                ],
            };
        }
        const createdQuestions = [];
        for (const q of quizData.questions) {
            const question = await this.prisma.quizQuestion.create({
                data: {
                    lectureId,
                    sourceTopic: quizData.topic,
                    sourceTranscript: transcript,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    difficulty: q.difficulty,
                    topic: q.topic || quizData.topic,
                    status: "PENDING",
                    aiPrompt: prompt,
                },
            });
            createdQuestions.push(question);
        }
        return createdQuestions;
    }
    createQuizQuestion(body) {
        return this.prisma.quizQuestion.create({ data: body });
    }
    updateQuizQuestion(id, body) {
        return this.prisma.quizQuestion.update({
            where: { id },
            data: {
                ...body,
                reviewedAt: body.status === "APPROVED" || body.status === "REJECTED" ? new Date() : undefined,
            },
        });
    }
    deleteQuizQuestion(id) {
        return this.prisma.quizQuestion.delete({ where: { id } });
    }
    listQuizAttempts() {
        return this.prisma.quizAttempt.findMany({ orderBy: { createdAt: "desc" } });
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
