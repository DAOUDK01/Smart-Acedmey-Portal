import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { QuizApiClient } from "./key.client";
import { AI_QUIZ_PROMPT } from "./ai-quiz.prompt";
import { CreateQuizQuestionDto, UpdateQuizQuestionDto, CreateQuizAttemptDto } from "./quiz.dto";
import { QuizStatus } from "@prisma/client";
import { serializeQuiz, serializeQuizzes } from "./quiz.serializer";
import { generateFallbackQuiz, generateFallbackQuizFromSegments } from "./quiz.fallback";
import { isConfiguredApiKey, resolveOllamaUrl } from "./quiz.provider";
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

      const raw = await response.json();
      if (!raw?.response) {
        throw new Error("Ollama response missing expected field");
      }

      return JSON.parse(raw.response);
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

    let quizData = generateFallbackQuizFromSegments(topicName, resolvedSegments);

    if (isConfiguredApiKey(process.env.QUIZ_API_KEY) || resolveOllamaUrl()) {
      const aiData = await this.resolveQuizData(
        topicName,
        transcript,
        resolvedSegments.length,
      );
      if (aiData?.questions?.length) {
        quizData = {
          ...aiData,
          questions: this.attachSegmentMetadata(aiData.questions, resolvedSegments),
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
    const question = await this.prisma.quizQuestion.create({ data: body as any });
    return serializeQuiz(question);
  }

  async updateQuizQuestion(id: string, body: UpdateQuizQuestionDto) {
    const question = await this.prisma.quizQuestion.update({
      where: { id },
      data: {
        ...body,
        reviewedAt:
          body.status === QuizStatus.APPROVED ||
          body.status === QuizStatus.REJECTED
            ? new Date()
            : undefined,
        publishedAt: body.status === QuizStatus.APPROVED ? new Date() : undefined,
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

  createQuizAttempt(body: CreateQuizAttemptDto) {
    return this.prisma.quizAttempt.create({ data: body as any });
  }
}
