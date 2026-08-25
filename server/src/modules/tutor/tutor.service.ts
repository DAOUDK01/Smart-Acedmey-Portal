import { Injectable, Logger } from "@nestjs/common";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { PrismaService } from "../../prisma.service";
import { TutorVectorStore, VectorMetadataFilter } from "./tutor-vector-store.service";
import {
  classifyTutorIntent,
  TutorChatMessage,
  TutorChatResponse,
  TutorMode,
  TutorReplySource,
} from "./tutor.types";
import {
  GENERAL_TUTOR_SYSTEM_PROMPT,
  LECTURE_RAG_SYSTEM_PROMPT,
  LECTURE_SUMMARY_PROMPT,
  PERSONAL_RAG_SYSTEM_PROMPT,
  buildGeneralPrompt,
  buildLecturePrompt,
  buildPersonalPrompt,
  buildSummaryPrompt,
} from "./tutor.prompts";
import { resolveChatModel, resolveChatProvider, resolveEmbeddingProvider } from "./tutor.provider";

const PERSONAL_RETRIEVAL_K = 4;
const LECTURE_RETRIEVAL_K = 4;

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorStore: TutorVectorStore,
  ) {}

  async chat(
    message: string,
    options: {
      studentId?: string;
      lectureId?: string;
      history?: TutorChatMessage[];
    },
  ): Promise<TutorChatResponse> {
    const trimmed = message?.trim();
    if (!trimmed) {
      return {
        reply: "Please type a question first — I'm happy to help with your courses.",
        mode: "general",
        fallback: true,
      };
    }

    const history = (options.history ?? []).slice(-8);
    const mode = classifyTutorIntent(trimmed);

    if (resolveChatProvider() === null) {
      return this.fallbackReply(mode, trimmed, options);
    }

    try {
      switch (mode) {
        case "personal":
          return this.answerPersonal(trimmed, options, history);
        case "lecture":
          return this.answerLecture(trimmed, options, history);
        default:
          return this.answerGeneral(trimmed, history);
      }
    } catch (error) {
      this.logger.error(`Tutor chat failed (mode=${mode}): ${error}`);
      return {
        reply:
          "Sorry, I ran into a problem generating an answer. Please try again in a moment.",
        mode,
        fallback: true,
      };
    }
  }

  private createChatModel() {
    const model = resolveChatModel();
    const provider = resolveChatProvider();

    if (provider === "groq") {
      return new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: model as string,
        temperature: 0.4,
      } as any);
    }

    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model,
      temperature: 0.4,
    });
  }

  private async retrieveLectureContext(
    message: string,
    filter?: VectorMetadataFilter,
  ) {
    if (resolveEmbeddingProvider() === null) {
      return [];
    }
    try {
      return await this.vectorStore.similaritySearch(message, LECTURE_RETRIEVAL_K, filter);
    } catch (error) {
      this.logger.warn(`Lecture retrieval skipped: ${error}`);
      return [];
    }
  }

  private async answerGeneral(
    message: string,
    history: TutorChatMessage[],
  ): Promise<TutorChatResponse> {
    const model = this.createChatModel();
    const response = await model.invoke([
      { role: "system", content: GENERAL_TUTOR_SYSTEM_PROMPT },
      { role: "user", content: buildGeneralPrompt(history, message) },
    ]);
    return {
      reply: String(response.content),
      mode: "general",
    };
  }

  private async answerLecture(
    message: string,
    options: { studentId?: string; lectureId?: string },
    history: TutorChatMessage[],
  ): Promise<TutorChatResponse> {
    const lectureId = options.lectureId ?? (await this.currentLectureFor(options.studentId));

    const [vectorResults, lecture] = await Promise.all([
      this.retrieveLectureContext(message, {
        type: "lecture",
        ...(lectureId ? { lectureId } : {}),
      }),
      lectureId
        ? this.prisma.lecture.findUnique({
            where: { id: lectureId },
            select: {
              id: true,
              title: true,
              transcript: true,
              courseId: true,
            },
          })
        : null,
    ]);

    const sources: TutorReplySource[] = [
      ...(lecture?.transcript
        ? [
            {
              title: lecture.title ?? "Lecture material",
              snippet: lecture.transcript.slice(0, 200),
            },
          ]
        : []),
      ...vectorResults.map((doc) => ({
        title: String(doc.metadata.lectureTitle ?? "Lecture material"),
        snippet: doc.pageContent.slice(0, 200),
      })),
    ];

    const contextParts: string[] = [
      ...(lecture?.transcript
        ? [`[${lecture.title ?? "Lecture transcript"}] ${this.truncateTranscript(lecture.transcript)}`]
        : []),
      ...vectorResults.map((doc) => `[${doc.metadata.lectureTitle}] ${doc.pageContent}`),
    ];

    if (contextParts.length === 0) {
      const fallback = await this.answerGeneral(message, history);
      return {
        ...fallback,
        reply: `I couldn't find that in the lecture material. ${fallback.reply}`,
        mode: "lecture",
        sources: [],
      };
    }

    const context = contextParts.join("\n\n---\n\n");

    const isSummaryRequest =
      /summar(?:y|ies|ize|ise|ization|isation)|recap|key notes|takeaways?/i.test(message);

    const model = this.createChatModel();
    const response = await model.invoke([
      {
        role: "system",
        content: isSummaryRequest && lecture?.transcript
          ? LECTURE_SUMMARY_PROMPT
          : LECTURE_RAG_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content:
          isSummaryRequest && lecture?.transcript
            ? buildSummaryPrompt(
                lecture.title ?? "Lecture",
                this.truncateTranscript(lecture.transcript),
              )
            : buildLecturePrompt(message, context),
      },
    ]);

    return {
      reply: String(response.content),
      mode: "lecture",
      sources,
    };
  }

  private async currentLectureFor(studentId?: string): Promise<string | null> {
    if (!studentId) return null;

    const latest = await this.prisma.studentInteraction.findFirst({
      where: { studentId },
      orderBy: { interactionDate: "desc" },
      select: { lectureId: true },
    });
    if (latest?.lectureId) return latest.lectureId;

    const progress = await this.prisma.studentProgress.findUnique({
      where: { studentId },
      select: { currentLectureId: true },
    });
    return progress?.currentLectureId ?? null;
  }

  private truncateTranscript(transcript: string, maxChars = 12_000): string {
    const trimmed = transcript.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars).trimEnd()}… [transcript truncated]`;
  }

  private async answerPersonal(
    message: string,
    options: { studentId?: string },
    history: TutorChatMessage[],
  ): Promise<TutorChatResponse> {
    const studentId = options.studentId;
    const [progress, attempts, studentResults] = await Promise.all([
      studentId
        ? this.prisma.studentProgress.findUnique({ where: { studentId } })
        : null,
      studentId
        ? this.prisma.quizAttempt.findMany({
            where: { studentId },
            orderBy: { submittedAt: "desc" },
            take: 10,
            include: { quiz: true },
          })
        : [],
      studentId && resolveEmbeddingProvider() !== null
        ? this.vectorStore.similaritySearch(message, PERSONAL_RETRIEVAL_K, {
            type: "student",
            studentId,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const lectureResults = await this.retrieveLectureContext(message);

    const studentContext = this.serializeStudentContext(progress, attempts);
    const lectureContext = lectureResults
      .map((doc) => `[${doc.metadata.lectureTitle}] ${doc.pageContent}`)
      .join("\n\n---\n\n");

    const sources: TutorReplySource[] = [
      ...studentResults.map((doc) => ({
        title: "Your progress snapshot",
        snippet: doc.pageContent.slice(0, 200),
      })),
      ...lectureResults.slice(0, 2).map((doc) => ({
        title: String(doc.metadata.lectureTitle ?? "Lecture material"),
        snippet: doc.pageContent.slice(0, 200),
      })),
    ];

    const model = this.createChatModel();
    const response = await model.invoke([
      { role: "system", content: PERSONAL_RAG_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPersonalPrompt(message, studentContext, lectureContext),
      },
    ]);

    return {
      reply: String(response.content),
      mode: "personal",
      sources,
    };
  }

  private serializeStudentContext(
    progress: {
      avgScore: number;
      progressPercentage: number;
      completedLectures: number;
      completedCheckpoints: number;
      lockedCheckpoints: number;
      failedQuizzes: number;
      streakDays: number;
      weakTopics: unknown;
      lastActivityAt: Date | null;
    } | null,
    attempts: { passed: boolean; score: number; quiz: { topic: string | null; sourceTopic: string | null } }[],
  ): string {
    if (!progress) {
      return "No progress record exists for this student yet.";
    }

    const weakTopics = this.stringifyJson(progress.weakTopics);
    const recent = attempts.length
      ? attempts
          .slice(0, 5)
          .map((attempt) => {
            const topic =
              attempt.quiz.topic ?? attempt.quiz.sourceTopic ?? "untitled question";
            return `${attempt.passed ? "Passed" : "Failed"} "${topic}" (${attempt.score}%)`;
          })
          .join("; ")
      : "none";

    return [
      `Average score: ${progress.avgScore}%`,
      `Overall progress: ${progress.progressPercentage}%`,
      `Completed lectures: ${progress.completedLectures}`,
      `Checkpoints completed: ${progress.completedCheckpoints} (${progress.lockedCheckpoints} locked)`,
      `Failed quizzes: ${progress.failedQuizzes}`,
      `Streak: ${progress.streakDays} day(s)`,
      `Weak topics: ${weakTopics}`,
      `Recent attempts: ${recent}`,
    ].join("\n");
  }

  private stringifyJson(value: unknown): string {
    if (value == null) return "none flagged";
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "none flagged";
    }
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) {
        return parsed.length ? parsed.join(", ") : "none flagged";
      }
    } catch {
      // fall through to raw string
    }
    return String(value);
  }

  private async fallbackReply(
    mode: TutorMode,
    message: string,
    options: { studentId?: string },
  ): Promise<TutorChatResponse> {
    const reply =
      mode === "personal"
        ? `For "${message}" — I can look at your personal progress once the AI assistant is configured. For now, open the Performance tab to review your weak topics, then revisit the latest lecture and retry its checkpoints.`
        : `Good question! For "${message}", start with your latest lecture material, then use the Performance tab to track how well you absorbed it. Once the AI provider is configured, I'll answer directly with full course context.`;
    return {
      reply,
      mode,
      fallback: true,
      sources: [],
    };
  }
}
