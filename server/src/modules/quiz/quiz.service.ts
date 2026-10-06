import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { QuizApiClient } from "./key.client";
import { AI_QUIZ_PROMPT } from "./ai-quiz.prompt";
import { CreateQuizQuestionDto, UpdateQuizQuestionDto, CreateQuizAttemptDto } from "./quiz.dto";
import { QuizStatus } from "@prisma/client";
import { AuthenticatedUser, studentKeyFor } from "../auth/identity";
import { serializeQuiz, serializeQuizzes } from "./quiz.serializer";
import { generateFallbackQuestionsForSegment } from "./quiz.fallback";
import { isConfiguredApiKey, resolveOllamaUrl, resolveQuizAiApiKey, resolveQuizAiBaseUrl, resolveQuizAiModel, resolveQuizAiProvider } from "./quiz.provider";
import {
  LectureSegmentInput,
  splitTranscriptIntoSegments,
} from "./transcript-segments";

const MAX_GENERATED_QUESTIONS = 36;
const MAX_QUESTIONS_PER_SEGMENT = 6;
const MAX_TRANSCRIPT_CHARS = 60_000;
const MAX_SEGMENTS = 12;
// Segments are generated in small parallel batches so providers are not hit with a burst of requests.
const SEGMENT_GENERATION_CONCURRENCY = 3;
const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
// Questions about the recording rather than the subject ("what does Segment 2 say?") are not useful quizzes.
const META_REFERENCE_PATTERN = /\bsegment\s*\d*\b|\btranscript\b/i;
const META_QUESTION_PATTERN =
  /\bsegment\s*\d*\b|\btranscript\b|\b(?:is|was|are|were) (?:not )?(?:made|mentioned|stated|said)\b|\bthe (?:lecturer|speaker|instructor) (?:say|says|said|mention|mentions|mentioned)\b/i;
const META_PREFIX_PATTERN =
  /^(?:(?:in|from)\s+segment\s*\d+|according to (?:the )?(?:lecture|lecturer|transcript|speaker|video|segment\s*\d+))\s*,?\s*/i;

function stripMetaPrefix(question: string): string {
  const stripped = question.trim().replace(META_PREFIX_PATTERN, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

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
          prompt: `${AI_QUIZ_PROMPT}\n\n${prompt}`,
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

  private async requestAiQuiz(userPrompt: string) {
    const apiKey = resolveQuizAiApiKey();
    const baseUrl = resolveQuizAiBaseUrl();
    const model = resolveQuizAiModel();
    if (!apiKey || !baseUrl || !model) {
      return null;
    }

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
            { role: "user", content: userPrompt },
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

  /**
   * Keeps only well-formed, content-focused questions; returns null when nothing usable came back.
   * Questions that are about the transcript itself ("which statement is made in Segment 2?") are dropped.
   */
  private normalizeQuizPayload(quizData: any, questionCount: number, provider: string) {
    const questions = Array.isArray(quizData?.questions)
      ? quizData.questions
          .filter(
            (q: any) =>
              typeof q?.question === "string" &&
              Array.isArray(q.options) &&
              q.options.length >= 2 &&
              q.options.includes(q.correctAnswer),
          )
          .map((q: any) => ({ ...q, question: stripMetaPrefix(q.question) }))
          .filter(
            (q: any) =>
              !META_QUESTION_PATTERN.test(q.question) &&
              !q.options.some((option: unknown) => META_REFERENCE_PATTERN.test(String(option))),
          )
      : [];
    if (questions.length === 0) {
      return null;
    }

    return {
      questions: questions.slice(0, questionCount),
      provider: String(quizData.provider ?? provider),
    };
  }

  /** Asks the configured providers for questions about ONE segment only. Returns null if every provider fails. */
  private async resolveSegmentQuizData(
    topic: string,
    segment: LectureSegmentInput,
    questionCount: number,
  ) {
    // The segment label is deliberately left out so the model writes about the subject, not "Segment 2".
    const userPrompt = `Course/lecture topic: ${topic}\n\nLecture content the student has just watched:\n"""\n${segment.text || topic}\n"""\n\nWrite exactly ${questionCount} exam-style multiple-choice questions that test understanding of the concepts taught in the content above. Use only facts from this content, and phrase every question as a standalone question about the subject.`;

    if (isConfiguredApiKey(process.env.QUIZ_API_KEY)) {
      try {
        const remote = await this.requestRemoteQuiz(topic, segment.text);
        const normalized = this.normalizeQuizPayload(remote, questionCount, "remote");
        if (normalized) return normalized;
      } catch (error) {
        console.warn("Remote quiz provider failed, trying fallback chain.", error);
      }
    }

    if (resolveQuizAiProvider() !== null) {
      try {
        const aiQuiz = await this.requestAiQuiz(userPrompt);
        const normalized = this.normalizeQuizPayload(aiQuiz, questionCount, "ai");
        if (normalized) return normalized;
      } catch (error) {
        console.warn("AI quiz generation failed, trying fallback chain.", error);
      }
    }

    if (resolveOllamaUrl()) {
      try {
        const ollamaQuiz = await this.requestOllamaQuiz(userPrompt);
        const normalized = this.normalizeQuizPayload(ollamaQuiz, questionCount, "ollama");
        if (normalized) return normalized;
      } catch (error) {
        console.warn("Ollama quiz generation failed, using local fallback.", error);
      }
    }

    return null;
  }

  async generateQuizQuestions(
    lectureId?: string,
    topic?: string,
    transcript?: string,
    requestedQuestionCount = 3,
    requestedSegments?: LectureSegmentInput[],
    durationSeconds?: number,
  ) {
    // Inputs feed a paid LLM call, so bound them regardless of what the client sent.
    const questionCount = Math.min(Math.max(Math.trunc(Number(requestedQuestionCount)) || 3, 1), MAX_GENERATED_QUESTIONS);
    if (transcript && transcript.length > MAX_TRANSCRIPT_CHARS) {
      throw new BadRequestException(`Transcript must be ${MAX_TRANSCRIPT_CHARS} characters or fewer`);
    }
    if (requestedSegments && requestedSegments.length > MAX_SEGMENTS) {
      throw new BadRequestException(`At most ${MAX_SEGMENTS} segments are allowed`);
    }
    const prompt = topic || transcript || "Generate a quiz";
    const topicName = topic || "Lecture Review";
    const resolvedSegments = this.resolveSegments(
      topicName,
      transcript,
      requestedSegments,
      durationSeconds ?? questionCount * 120,
      questionCount,
    );

    // Each segment gets its own share of questions, generated from that segment's text only.
    const base = Math.floor(questionCount / resolvedSegments.length);
    const remainder = questionCount % resolvedSegments.length;
    const countFor = (index: number) =>
      Math.min(MAX_QUESTIONS_PER_SEGMENT, Math.max(1, base + (index < remainder ? 1 : 0)));
    const useProviders = Boolean(
      isConfiguredApiKey(process.env.QUIZ_API_KEY) || resolveQuizAiProvider() !== null || resolveOllamaUrl(),
    );

    const perSegment: Array<{ segment: LectureSegmentInput; provider: string; questions: any[] }> = [];
    for (let start = 0; start < resolvedSegments.length; start += SEGMENT_GENERATION_CONCURRENCY) {
      const batch = resolvedSegments.slice(start, start + SEGMENT_GENERATION_CONCURRENCY);
      perSegment.push(
        ...(await Promise.all(
          batch.map(async (segment, offset) => {
            const count = countFor(start + offset);
            const generated = useProviders
              ? await this.resolveSegmentQuizData(topicName, segment, count)
              : null;
            const questions: any[] = generated?.questions ?? [];
            if (questions.length < count) {
              questions.push(
                ...generateFallbackQuestionsForSegment(topicName, segment, resolvedSegments, count - questions.length),
              );
            }
            return {
              segment,
              provider: generated?.provider ?? "local-fallback",
              questions: [...questions].sort(
                (a, b) =>
                  (DIFFICULTY_ORDER[a.difficulty ?? ""] ?? 1) -
                  (DIFFICULTY_ORDER[b.difficulty ?? ""] ?? 1),
              ),
            };
          }),
        )),
      );
    }

    const createdQuestions: any[] = [];
    for (const { segment, questions } of perSegment) {
      for (const q of questions) {
        const difficulty =
          q.difficulty === "easy" || q.difficulty === "medium" || q.difficulty === "hard"
            ? q.difficulty
            : segment.difficulty ?? "medium";
        // The "<segment label>|" prefix is how the serializer recovers which segment a question belongs to.
        const questionTopic = String(q.topic || topicName).split("|").pop()?.trim() || topicName;
        const question = await this.prisma.quizQuestion.create({
          data: {
            lectureId,
            sourceTopic: topicName,
            sourceTranscript: segment.text || transcript,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            difficulty,
            topic: `${segment.label}|${questionTopic}`,
            timestamp: segment.timestamp,
            status: QuizStatus.PENDING,
            aiPrompt: prompt,
          },
        });
        createdQuestions.push(serializeQuiz(question));
      }
    }

    if (lectureId) {
      await this.syncCheckpointsForLecture(lectureId, resolvedSegments);
    }

    return {
      provider: perSegment.find((item) => item.provider !== "local-fallback")?.provider ?? "local-fallback",
      questions: createdQuestions,
      segments: resolvedSegments,
    };
  }

  /**
   * Uses the teacher's segments when given, filling in any missing text (e.g. segments rebuilt from
   * saved checkpoints) from the matching slice of the transcript; otherwise splits the transcript.
   */
  private resolveSegments(
    topicName: string,
    transcript: string | undefined,
    requestedSegments: LectureSegmentInput[] | undefined,
    durationSeconds: number,
    questionCount: number,
  ): LectureSegmentInput[] {
    if (!requestedSegments?.length) {
      return splitTranscriptIntoSegments(
        transcript || topicName,
        durationSeconds,
        Math.max(1, Math.min(questionCount, 8)),
      );
    }

    const needsText = requestedSegments.some((segment) => !segment.text?.trim());
    const slices = needsText && transcript?.trim()
      ? splitTranscriptIntoSegments(transcript, durationSeconds, requestedSegments.length)
      : [];

    return requestedSegments.map((segment, index) => ({
      ...segment,
      label: segment.label || `Segment ${index + 1}`,
      text: segment.text?.trim() || slices[index]?.text || topicName,
      timestamp: Math.max(5, Number(segment.timestamp) || 0),
    }));
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

  /** Quiz ids the authenticated student has already attempted (rows are keyed by email, or id for older data). */
  async listAnsweredQuizIds(user?: AuthenticatedUser) {
    const email = await studentKeyFor(this.prisma, user);
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { studentId: { in: [email, user?.userId ?? email] } },
      select: { quizId: true },
      distinct: ["quizId"],
    });
    return attempts.map((attempt) => attempt.quizId);
  }

  async getApprovedQuizForAttempt(id: string) {
    const quiz = await this.prisma.quizQuestion.findUnique({ where: { id } });
    if (!quiz || quiz.status !== QuizStatus.APPROVED) {
      return null;
    }
    return serializeQuiz(quiz);
  }

  resolveStudentKey(user?: AuthenticatedUser) {
    return studentKeyFor(this.prisma, user);
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
