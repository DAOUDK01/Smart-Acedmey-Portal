import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma.service";
import { classifyTutorIntent } from "./tutor.types";
import { TutorService } from "./tutor.service";
import { TutorVectorStore } from "./tutor-vector-store.service";

describe("TutorService", () => {
  let service: TutorService;
  let prisma: {
    lecture: {
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    studentInteraction: {
      findFirst: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    studentProgress: {
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
    };
  };
  let vectorStore: {
    similaritySearch: jest.Mock<(...args: any[]) => Promise<any>>;
  };

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const asyncMock = () => jest.fn<(...args: any[]) => Promise<any>>();

    prisma = {
      lecture: {
        findUnique: asyncMock().mockResolvedValue({
          id: "lec-1",
          title: "Introduction to Photosynthesis",
          transcript:
            "Photosynthesis is the process by which plants convert sunlight into chemical energy. Chlorophyll absorbs light in the chloroplasts. The light-dependent reactions produce ATP and NADPH. The Calvin cycle fixes carbon dioxide into glucose.",
          courseId: "course-1",
        }),
      },
      studentInteraction: {
        findFirst: asyncMock().mockResolvedValue({ lectureId: "lec-1" }),
      },
      studentProgress: {
        findUnique: asyncMock().mockResolvedValue({ currentLectureId: "lec-1" }),
      },
    };

    vectorStore = {
      similaritySearch: asyncMock().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: TutorVectorStore, useValue: vectorStore },
      ],
    }).compile();

    service = moduleRef.get(TutorService);

    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    process.env.OPENAI_CHAT_MODEL = "gpt-4o-mini";
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  const mockChatModel = () => {
    const invoke = jest
      .fn<(...args: { role: string; content: string }[][]) => Promise<{ content: string }>>()
      .mockResolvedValue({ content: "1. **Overview** — plants convert sunlight into energy." });
    jest
      .spyOn(service as any, "createChatModel")
      .mockReturnValue({ invoke } as any);
    return invoke;
  };

  describe("classifyTutorIntent", () => {
    it("routes summary requests to lecture mode even when they contain personal words", () => {
      expect(classifyTutorIntent("Summarize this lecture for me")).toBe("lecture");
      expect(classifyTutorIntent("Give me the key notes from this lecture")).toBe("lecture");
      expect(classifyTutorIntent("Recap the main takeaways for me")).toBe("lecture");
    });

    it("keeps personal questions in personal mode", () => {
      expect(classifyTutorIntent("How am I doing in my course?")).toBe("personal");
      expect(classifyTutorIntent("What are my weak topics?")).toBe("personal");
      expect(classifyTutorIntent("Recommend a study plan for my weak topics")).toBe("personal");
    });

    it("routes generic questions to general mode", () => {
      expect(classifyTutorIntent("When was the Roman empire founded?")).toBe("general");
      expect(classifyTutorIntent("What is photosynthesis?")).toBe("general");
      expect(classifyTutorIntent("Tell me about the history of Rome")).toBe("general");
    });

    it("routes lecture questions to lecture mode only when they reference course material", () => {
      expect(classifyTutorIntent("What does the lecture say about cells?")).toBe("lecture");
      expect(classifyTutorIntent("Explain the key points from the video")).toBe("lecture");
      expect(classifyTutorIntent("What did we cover in this course?")).toBe("lecture");
    });
  });

  describe("chat with a summary request", () => {
    it("uses the DB transcript when no vector store results exist", async () => {
      const invoke = mockChatModel();
      vectorStore.similaritySearch.mockResolvedValue([]);

      const result = await service.chat("Can you summarize this lecture?", {
        lectureId: "lec-1",
      });

      expect(result.mode).toBe("lecture");
      expect(result.sources).toHaveLength(1);
      expect(result.sources![0].title).toBe("Introduction to Photosynthesis");

      const messages = invoke.mock.calls[0][0] as { role: string; content: string }[];
      const system = messages.find((m) => m.role === "system")!;
      const user = messages.find((m) => m.role === "user")!;
      expect(system.content).toContain("concise lecture summary");
      expect(user.content).toContain("Introduction to Photosynthesis");
      expect(user.content).toContain("Chlorophyll");
      expect(prisma.lecture.findUnique).toHaveBeenCalledWith({
        where: { id: "lec-1" },
        select: expect.objectContaining({ transcript: true }),
      });
    });

    it("resolves the current lecture from the latest interaction when no lectureId is given", async () => {
      const invoke = mockChatModel();

      await service.chat("Summarize the current lecture", { studentId: "user-1" });

      expect(prisma.studentInteraction.findFirst).toHaveBeenCalledWith({
        where: { studentId: "user-1" },
        orderBy: { interactionDate: "desc" },
        select: { lectureId: true },
      });
      expect(prisma.lecture.findUnique).toHaveBeenCalledWith({
        where: { id: "lec-1" },
        select: expect.anything(),
      });
      const messages = invoke.mock.calls[0][0] as { role: string; content: string }[];
      expect(messages.find((m) => m.role === "user")!.content).toContain(
        "Introduction to Photosynthesis",
      );
    });

    it("answers without lecture context when no lecture or transcript is available", async () => {
      const invoke = mockChatModel();
      prisma.lecture.findUnique.mockResolvedValue(null);
      prisma.studentInteraction.findFirst.mockResolvedValue(null);

      const result = await service.chat("Summarize this lecture", {
        studentId: "user-1",
      });

      expect(result.mode).toBe("lecture");
      expect(result.reply).toContain("I couldn't find that in the lecture material.");
      const messages = invoke.mock.calls[0][0] as { role: string; content: string }[];
      expect(messages.find((m) => m.role === "system")!.content).toContain(
        "experienced, patient AI study tutor",
      );
    });

    it("truncates very long transcripts before sending to the model", async () => {
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        title: "Long Lecture",
        transcript: "A".repeat(30_000),
        courseId: "course-1",
      });
      const invoke = mockChatModel();

      await service.chat("Summarize this", { lectureId: "lec-1" });

      const messages = invoke.mock.calls[0][0] as { role: string; content: string }[];
      const user = messages.find((m) => m.role === "user")!.content;
      expect(user.length).toBeLessThan(13_000);
      expect(user).toContain("[transcript truncated]");
    });
  });
});