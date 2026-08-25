import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { QuizApiClient } from "./key.client";
import { AI_QUIZ_PROMPT } from "./ai-quiz.prompt";
import { CreateQuizQuestionDto, UpdateQuizQuestionDto, CreateQuizAttemptDto } from "./quiz.dto";
import { QuizStatus } from "@prisma/client";
import { serializeQuiz, serializeQuizzes } from "./quiz.serializer";
import { generateFallbackQuiz, generateFallbackQuizFromSegments } from "./quiz.fallback";
import { isConfiguredApiKey, resolveOllamaUrl, resolveQuizAiApiKey, resolveQuizAiBaseUrl, resolveQuizAiModel, resolveQuizAiProvider } from "./quiz.provider";
import {
  LectureSegmentInput,
  splitTranscriptIntoSegments,
} from "./transcript-segments";

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  async listQuizQuestions() {
    const quizzes = await this.prisma.quizQuestion.findMany({ orderBy: { createdAt: "desc" } });
    return serializeQuizzes(quizzes);
  }

  async listQuizQuestionsByStatus(status: QuizStatus) {
    const quizzes = await this.prisma.quizQuestion.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    });
    return serializeQuizzes(quizzes);
  }

  async listApprovedMockExams() {
    const quizzes = await this.prisma.quizQuestion.findMany({
      where: { status: QuizStatus.APPROVED, lectureId: null },
      orderBy: { createdAt: "desc" },
    });
    return serializeQuizzes(quizzes);
  }

  async getQuizQuestion(id: string) {
    const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
    return quiz ? serializeQuiz(quiz) : null;
  }

  private async requestRemoteQuiz(topic: string, transcript?: string) {
    const apiKey = process.env.QUIZ_API_KEY;
    if (!isConfiguredApiKey(apiKey)) {
      return null;
    }

    const client = new QuizApiClient(apiKey!, process.env.QUIZ_API_URL);
    return client.generateQuiz(topic || "General", transcript);
  }

  private async requestOllamaQuiz(prompt: string) {
    const ollamaUrl = resolveOllamaUrl();
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
          prompt: `${AI_QUIZ_PROMPT}\n\nTopic/Transcript: ${prompt}`,
          stream: false,
          format: "json",
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
      }

      const raw = (await response.json()) as { response?: string };
      if (!raw?.response) {
        throw new Error("Ollama response missing expected field");
      }

      return JSON.parse(raw.response);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestAiQuiz(
    topic: string,
    transcript: string | undefined,
    segments: LectureSegmentInput[],
    questionCount: number,
  ) {
    const apiKey = resolveQuizAiApiKey();
    const baseUrl = resolveQuizAiBaseUrl();
    const model = resolveQuizAiModel();
    if (!apiKey || !baseUrl || !model) {
      return null;
    }

    const segmentText =
      segments.length > 0
        ? segments
            .map(
              (segment) =>
                `[${segment.label} at ${segment.timestamp}s] ${segment.text}`,
            )
            .join("\n\n")
        : transcript;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            { role: "system", content: AI_QUIZ_PROMPT },
            {
              role: "user",
              content: `Lecture topic: ${topic}\n\nLecture transcript:\n${segmentText || topic}\n\nGenerate ${Math.max(1, Math.min(questionCount, 12))} quiz questions covering the content above.`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(`AI quiz request failed with status ${response.status}`);
      }

      const raw = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = raw.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("AI quiz response missing content");
      }

      return JSON.parse(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeQuizPayload(
    quizData: any,
    topic: string,
    transcript: string | undefined,
    questionCount: number,
  ) {
    if (!quizData?.questions?.length) {
      return generateFallbackQuiz(topic, transcript, questionCount);
    }

    return {
      topic: quizData.topic || topic,
      questions: quizData.questions.slice(0, questionCount),
      provider: quizData.provider ?? "ai",
    };
  }

  private async resolveQuizData(
    topic: string,
    transcript: string | undefined,
    questionCount: number,
    segments: LectureSegmentInput[],
  ) {
    const prompt = topic || transcript || "Generate a quiz";

    if (isConfiguredApiKey(process.env.QUIZ_API_KEY)) {
      try {
        const remote = await this.requestRemoteQuiz(topic, transcript);
        if (remote) {
          return this.normalizeQuizPayload(remote, topic, transcript, questionCount);
        }
      } catch (error) {
        console.warn("Remote quiz provider failed, trying fallback chain.", error);
      }
    }

    if (resolveQuizAiProvider() !== null) {
      try {
        const aiQuiz = await this.requestAiQuiz(
          topic,
          transcript,
          segments,
          questionCount,
        );
        if (aiQuiz?.questions?.length) {
          return this.normalizeQuizPayload(aiQuiz, topic, transcript, questionCount);
        }
      } catch (error) {
        console.warn("AI quiz generation failed, trying fallback chain.", error);
      }
    }

    const ollamaUrl = resolveOllamaUrl();
    if (ollamaUrl) {
      try {
        const ollamaQuiz = await this.requestOllamaQuiz(prompt);
        return this.normalizeQuizPayload(ollamaQuiz, topic, transcript, questionCount);
      } catch (error) {
        console.warn("Ollama quiz generation failed, using local fallback.", error);
      }
    }

    return generateFallbackQuiz(topic, transcript, questionCount);
  }

  private attachSegmentMetadata(
    questions: any[],
    segments: LectureSegmentInput[],
  ) {
    const byDifficulty: Record<string, LectureSegmentInput | undefined> = {
      easy: segments[0],
      medium: segments[Math.min(1, segments.length - 1)],
      hard: segments[segments.length - 1],
    };
    const lastSegment = segments[segments.length - 1];
    return questions.map((question) => {
      const segment = byDifficulty[question.difficulty] ?? lastSegment;
      return {
        ...question,
        timestamp: question.timestamp ?? segment?.timestamp,
        segment: question.segment ?? segment?.label,
        difficulty: question.difficulty ?? segment?.difficulty,
        topic: question.topic ?? (segment ? `${segment.label}|${segment.text.slice(0, 80)}` : undefined),
      };
    });
  }

  async generateQuizQuestions(
    lectureId?: string,
    topic?: string,
    transcript?: string,
    questionCount = 3,
    segments?: LectureSegmentInput[],
    durationSeconds?: number,
  ) {
    const prompt = topic || transcript || "Generate a quiz";
    const topicName = topic || "Lecture Review";
    const resolvedSegments =
      segments?.length && segments.length > 0
        ? segments
        : splitTranscriptIntoSegments(
            transcript || topicName,
            durationSeconds ?? questionCount * 120,
            Math.max(1, Math.min(questionCount, 8)),
          );

    let quizData = generateFallbackQuizFromSegments(
      topicName,
      resolvedSegments,
      questionCount,
    );

    if (isConfiguredApiKey(process.env.QUIZ_API_KEY) || resolveQuizAiProvider() !== null || resolveOllamaUrl()) {
      const aiData = await this.resolveQuizData(
        topicName,
        transcript,
        questionCount,
        resolvedSegments,
      );
      if (aiData?.questions?.length) {
        const difficultyOrder: Record<string, number> = {
          easy: 0,
          medium: 1,
          hard: 2,
        };
        const balanced = [...aiData.questions];
        const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
        for (const q of balanced) {
          const level =
            q.difficulty === "easy" || q.difficulty === "hard"
              ? q.difficulty
              : "medium";
          counts[level]++;
          q.difficulty = level;
        }
        const target = Math.round(balanced.length / 3);
        const deficit = ["easy", "medium", "hard"].filter(
          (level) => counts[level] < target,
        );
        for (const level of deficit) {
          for (let i = counts[level]; i < target; i++) {
            const surplusLevel = ["easy", "medium", "hard"].find(
              (candidate) => counts[candidate] > target,
            );
            if (!surplusLevel) break;
            const question = balanced.find(
              (q) =>
                q.difficulty === surplusLevel && counts[level] < target,
            );
            if (!question) break;
            question.difficulty = level;
            counts[level]++;
            counts[surplusLevel]--;
          }
        }
        const ordered = [...balanced].sort(
          (a, b) =>
            (difficultyOrder[a.difficulty ?? ""] ?? 1) -
            (difficultyOrder[b.difficulty ?? ""] ?? 1),
        );
        quizData = {
          ...aiData,
          questions: this.attachSegmentMetadata(ordered, resolvedSegments),
        };
      }
    }

    const createdQuestions: any[] = [];
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
          status: QuizStatus.PENDING,
          aiPrompt: prompt,
        },
      });
      createdQuestions.push({
        ...serializeQuiz(question),
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

  private async syncCheckpointsForLecture(
    lectureId: string,
    segments: LectureSegmentInput[],
  ) {
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
      } else {
        await this.prisma.checkpoint.create({
          data: { lectureId, ...payload },
        });
      }
    }
  }

  async createQuizQuestion(body: CreateQuizQuestionDto) {
    const normalized = normalizeQuizStatus(body);
    const question = await this.prisma.quizQuestion.create({ data: normalized as any });
    return serializeQuiz(question);
  }

  async updateQuizQuestion(id: string, body: UpdateQuizQuestionDto) {
    const normalized = normalizeQuizStatus(body);
    const question = await this.prisma.quizQuestion.update({
      where: { id },
      data: {
        ...normalized,
        reviewedAt:
          normalized.status === QuizStatus.APPROVED ||
          normalized.status === QuizStatus.REJECTED
            ? new Date()
            : undefined,
        publishedAt: normalized.status === QuizStatus.APPROVED ? new Date() : undefined,
      },
    });
    return serializeQuiz(question);
  }

  async teacherApproveQuiz(id: string, reviewedBy?: string) {
    const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
    if (!quiz) {
      throw new BadRequestException("Quiz not found");
    }
    if (quiz.status !== QuizStatus.PENDING && quiz.status !== QuizStatus.EDITED) {
      throw new BadRequestException("Only pending quizzes can be approved by teachers");
    }

    return this.updateQuizQuestion(id, {
      status: QuizStatus.APPROVED,
      reviewedBy: reviewedBy ?? "Teacher",
    });
  }

  async rejectQuiz(id: string, reviewedBy?: string) {
    return this.updateQuizQuestion(id, {
      status: QuizStatus.REJECTED,
      reviewedBy: reviewedBy ?? "Reviewer",
    });
  }

  deleteQuizQuestion(id: string) {
    return this.prisma.quizQuestion.delete({ where: { id } });
  }

  async listQuizAttempts(studentId?: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return attempts;
  }

  async getApprovedQuizForAttempt(id: string) {
    const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
    if (!quiz || quiz.status !== QuizStatus.APPROVED) {
      return null;
    }
    return serializeQuiz(quiz);
  }

  async createQuizAttempt(body: CreateQuizAttemptDto) {
    const attempt = await this.prisma.quizAttempt.create({ data: body as any });

    const [attempts, approvedCount] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { studentId: body.studentId },
        select: { quizId: true, score: true, passed: true },
      }),
      this.prisma.quizQuestion.count({ where: { status: QuizStatus.APPROVED } }),
    ]);

    const avgScore = Math.round(
      attempts.reduce((sum, item) => sum + item.score, 0) /
        Math.max(attempts.length, 1),
    );
    const failedQuizzes = attempts.filter((item) => !item.passed).length;
    const attemptedQuizzes = new Set(
      attempts.map((item) => item.quizId),
    ).size;
    const quizProgress =
      approvedCount > 0
        ? Math.round((attemptedQuizzes / approvedCount) * 100)
        : 0;

    const existing = await this.prisma.studentProgress.findUnique({
      where: { studentId: body.studentId },
    });

    const payload = {
      avgScore,
      failedQuizzes,
      lastActivityAt: new Date(),
      progressPercentage: Math.max(
        existing?.progressPercentage ?? 0,
        quizProgress,
      ),
    };

    if (existing) {
      await this.prisma.studentProgress.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await this.prisma.studentProgress.create({
        data: { studentId: body.studentId, ...payload },
      });
    }

    return attempt;
  }
}

function normalizeQuizStatus<T extends { status?: string | QuizStatus }>(
  body: T,
): T {
  if (typeof body.status !== "string") return body;
  const upper = body.status.toUpperCase();
  if (!(upper in QuizStatus)) return body;
  return { ...body, status: upper as QuizStatus };
}
