import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma.service";
import { RecommendationsService } from "./recommendations.service";

describe("RecommendationsService", () => {
  let service: RecommendationsService;
  let prisma: {
    lecture: {
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
      findMany: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    course: { findUnique: jest.Mock<(...args: any[]) => Promise<any>> };
    user: { findUnique: jest.Mock<(...args: any[]) => Promise<any>> };
    studentInteraction: {
      create: jest.Mock<(...args: any[]) => Promise<any>>;
      aggregate: jest.Mock<(...args: any[]) => Promise<any>>;
      findMany: jest.Mock<(...args: any[]) => Promise<any>>;
      findFirst: jest.Mock<(...args: any[]) => Promise<any>>;
      groupBy: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    quizAttempt: { findMany: jest.Mock<(...args: any[]) => Promise<any>> };
    studentProgress: { findUnique: jest.Mock<(...args: any[]) => Promise<any>> };
    resourceTransition: {
      findMany: jest.Mock<(...args: any[]) => Promise<any>>;
      aggregate: jest.Mock<(...args: any[]) => Promise<any>>;
      deleteMany: jest.Mock<(...args: any[]) => Promise<any>>;
      createMany: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    $transaction: jest.Mock<(...args: any[]) => Promise<any>>;
  };

  beforeEach(async () => {
    const asyncMock = () => jest.fn<(...args: any[]) => Promise<any>>();

    prisma = {
      lecture: {
        findUnique: asyncMock().mockResolvedValue({
          id: "lec-1",
          courseId: "course-1",
          createdAt: new Date("2026-01-05T00:00:00Z"),
          title: "Lecture 1",
          videoUrl: "/uploads/1.mp4",
          durationMinutes: 15,
        }),
        findMany: asyncMock().mockResolvedValue([]),
      },
      course: { findUnique: asyncMock().mockResolvedValue({ createdAt: new Date("2026-01-05T00:00:00Z") }) },
      user: { findUnique: asyncMock().mockResolvedValue({ id: "user-1", email: "student@example.com" }) },
      studentInteraction: {
        create: asyncMock().mockResolvedValue({ id: "interaction-1" }),
        aggregate: asyncMock().mockResolvedValue({ _sum: { clickCount: 4 } }),
        findMany: asyncMock().mockResolvedValue([
          { lectureId: "lec-2" },
          { lectureId: "lec-1" },
        ]),
        findFirst: asyncMock().mockResolvedValue({ lectureId: "lec-1" }),
        groupBy: asyncMock().mockResolvedValue([]),
      },
      quizAttempt: { findMany: asyncMock().mockResolvedValue([{ score: 100 }, { score: 60 }]) },
      studentProgress: { findUnique: asyncMock().mockResolvedValue({ currentLectureId: "lec-1" }) },
      resourceTransition: {
        findMany: asyncMock().mockResolvedValue([
          { resourceId: "lec-1", nextResourceId: "lec-3", count: 12 },
          { resourceId: "lec-1", nextResourceId: "lec-4", count: 9 },
          { resourceId: "lec-1", nextResourceId: "lec-5", count: 3 },
        ]),
        aggregate: asyncMock().mockResolvedValue({ _max: { updatedAt: new Date("2026-08-14T00:00:00Z") } }),
        deleteMany: asyncMock().mockResolvedValue({ count: 0 }),
        createMany: asyncMock().mockResolvedValue({ count: 0 }),
      },
      $transaction: asyncMock().mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(RecommendationsService);
  });

  const mockMlService = (payload: { recommendation?: string; rewatch_probability?: number }) => {
    const json = jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({
        recommendation: payload.recommendation ?? "REWATCH",
        rewatch_probability: payload.rewatch_probability ?? 0.7838,
        prediction: payload.recommendation === "NEXT_VIDEO" ? 0 : 1,
        model_features: ["click_count"],
      });
    (global as any).fetch = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true, status: 200, json });
    return json;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  describe("recordInteraction", () => {
    it("creates an interaction when the lecture exists", async () => {
      await service.recordInteraction("user-1", "lec-1");
      expect(prisma.studentInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ studentId: "user-1", lectureId: "lec-1", clickCount: 1 }),
      });
    });

    it("throws NotFoundException for an unknown lecture", async () => {
      prisma.lecture.findUnique.mockResolvedValue(null);
      await expect(service.recordInteraction("user-1", "nope")).rejects.toThrow(NotFoundException);
      expect(prisma.studentInteraction.create).not.toHaveBeenCalled();
    });

    it("stores watch progress on the interaction", async () => {
      await service.recordInteraction("user-1", "lec-1", 37);
      expect(prisma.studentInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: "user-1",
          lectureId: "lec-1",
          clickCount: 1,
          watchPercent: 37,
        }),
      });
    });

    it("clamps watch progress to 0-100", async () => {
      await service.recordInteraction("user-1", "lec-1", 250);
      expect(prisma.studentInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ watchPercent: 100 }),
      });
    });
  });

  describe("getRecommendationForUser", () => {
    it("computes features from real data and suppresses a model-only REWATCH", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-1" },
      ]);
      prisma.studentInteraction.findFirst.mockResolvedValue({ lectureId: "lec-1" });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 4 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.lecture.findMany.mockResolvedValue([
        { id: "lec-3", title: "Lecture 3", videoUrl: "/uploads/3.mp4", durationMinutes: 10 },
        { id: "lec-4", title: "Lecture 4", videoUrl: "/uploads/4.mp4", durationMinutes: 12 },
        { id: "lec-5", title: "Lecture 5", videoUrl: "/uploads/5.mp4", durationMinutes: 8 },
      ]);
      const json = mockMlService({ recommendation: "REWATCH", rewatch_probability: 0.7838 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      const [url, init] = (global as any).fetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8005/predict");

      const sent = JSON.parse(init.body);
      const daysSinceCourseStart = Math.floor(
        (Date.now() - new Date("2026-01-05T00:00:00Z").getTime()) / 86_400_000,
      );
      expect(sent).toEqual({
        click_count: 4,
        repeated_interaction: 1,
        latest_quiz_score: 100,
        previous_quiz_score: 60,
        score_change: 40,
        interaction_week: Math.max(0, Math.floor(daysSinceCourseStart / 7)),
        activity_type: "resource",
      });

      expect(json).toHaveBeenCalled();
      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.rewatchProbability).toBe(0);
      expect(result.recommendedResource).toBe("lec-3");
    });

    it("marks repeated_interaction when the previous interaction was the same resource", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-1" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 4 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      mockMlService({ recommendation: "REWATCH" });
      await service.getRecommendationForUser("user-1", "lec-1");

      const sent = JSON.parse((global as any).fetch.mock.calls[0][1].body);
      expect(sent.repeated_interaction).toBe(1);
    });

    it("returns NEXT_VIDEO with the top historical transition and alternatives", async () => {
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 3 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany.mockResolvedValue([
        { id: "lec-3", title: "Lecture 3", videoUrl: "/uploads/3.mp4", durationMinutes: 10 },
        { id: "lec-4", title: "Lecture 4", videoUrl: "/uploads/4.mp4", durationMinutes: 12 },
        { id: "lec-5", title: "Lecture 5", videoUrl: "/uploads/5.mp4", durationMinutes: 8 },
      ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.1561 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-3");
      expect(result.alternatives).toEqual(["lec-3", "lec-4", "lec-5"]);
      expect(result.recommendedLecture).toEqual(expect.objectContaining({ title: "Lecture 3" }));
      expect(result.alternativeLectures).toHaveLength(3);

      const where = prisma.resourceTransition.findMany.mock.calls[0][0].where;
      expect(where.resourceId).toBe("lec-1");
      expect(where.nextResourceId).toEqual({ notIn: ["lec-2", "lec-1", "lec-1"] });
    });

    it("suppresses REWATCH when the student has already watched another lecture", async () => {
      prisma.studentInteraction.findFirst.mockResolvedValue({ lectureId: "lec-2" });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 4 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findMany.mockResolvedValue([
        { id: "lec-3", title: "Lecture 3", videoUrl: "/uploads/3.mp4", durationMinutes: 10 },
      ]);

      mockMlService({ recommendation: "REWATCH", rewatch_probability: 0.7838 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-3");
    });

    it("excludes already-watched lectures from NEXT_VIDEO candidates", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-3" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 3 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([
        { resourceId: "lec-1", nextResourceId: "lec-4", count: 9 },
        { resourceId: "lec-1", nextResourceId: "lec-5", count: 3 },
      ]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany.mockResolvedValue([
        { id: "lec-4", title: "Lecture 4", videoUrl: "/uploads/4.mp4", durationMinutes: 12 },
        { id: "lec-5", title: "Lecture 5", videoUrl: "/uploads/5.mp4", durationMinutes: 8 },
      ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.1561 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      const where = prisma.resourceTransition.findMany.mock.calls[0][0].where;
      expect(where.nextResourceId).toEqual({ notIn: ["lec-1", "lec-3", "lec-1"] });
      expect(result.recommendedResource).toBe("lec-4");
      expect(result.alternatives).toEqual(["lec-4", "lec-5"]);
    });

    it("falls back to the next lectures in the course when there are no transitions", async () => {
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([
          { id: "lec-6" },
          { id: "lec-7" },
        ])
        .mockResolvedValueOnce([
          { id: "lec-6" },
          { id: "lec-7" },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-6", title: "Lecture 6", videoUrl: "/uploads/6.mp4", durationMinutes: 9 },
          { id: "lec-7", title: "Lecture 7", videoUrl: "/uploads/7.mp4", durationMinutes: 11 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.1 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      const courseWhere = prisma.lecture.findMany.mock.calls[1][0].where;
      expect(courseWhere.courseId).toBe("course-1");
      expect(courseWhere.lectureOrder).toEqual({ gt: 1 });
      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-6");
      expect(result.alternatives).toEqual(["lec-6", "lec-7"]);
    });

    it("falls back to the most popular unwatched lectures when no other candidates exist", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-3" },
        { lectureId: "lec-4" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 2 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.studentInteraction.groupBy.mockResolvedValue([
        { lectureId: "lec-9", _count: { _all: 7 } },
        { lectureId: "lec-8", _count: { _all: 4 } },
      ]);
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-8" }, { id: "lec-9" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-8", title: "Lecture 8", videoUrl: "/uploads/8.mp4", durationMinutes: 12 },
          { id: "lec-9", title: "Lecture 9", videoUrl: "/uploads/9.mp4", durationMinutes: 10 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.1 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-9");
      expect(result.alternatives).toEqual(["lec-9", "lec-8"]);
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 9" }),
      );
    });

    it("surfaces a popular next-video pick when every lecture is watched and the model does not favor a rewatch", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-3" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 2 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.studentInteraction.groupBy.mockResolvedValue([
        { lectureId: "lec-3", _count: { _all: 7 } },
      ]);
      prisma.studentInteraction.findFirst.mockResolvedValue({ lectureId: "lec-1" });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-3" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-3", title: "Lecture 3", videoUrl: "/uploads/3.mp4", durationMinutes: 10 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.2 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-3");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 3" }),
      );
      expect(result.alternatives).toEqual(["lec-3"]);
    });

    it("keeps a model-REWATCH when the student also failed the lecture quizzes", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-1" },
      ]);
      prisma.studentInteraction.findFirst.mockResolvedValue({ lectureId: "lec-1" });
      prisma.quizAttempt.findMany.mockResolvedValue([{ score: 0 }, { score: 0 }]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 2 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });

      mockMlService({ recommendation: "REWATCH", rewatch_probability: 0.8 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("REWATCH");
      expect(result.recommendedResource).toBe("lec-1");
    });
  });

  describe("lecture-specific recommendations", () => {
    it("recommends a related next lecture in the same course", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-2" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-6" }])
        .mockResolvedValueOnce([{ id: "lec-6" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-6", title: "Lecture 6", videoUrl: "/uploads/6.mp4", durationMinutes: 9 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.3 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-6");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 6" }),
      );
      expect(result.alternatives).toEqual(["lec-6"]);
    });

    it("skips struggle lectures when picking the next video", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
      ]);
      prisma.quizAttempt.findMany.mockImplementation(async (args?: any) => {
        const lectureId = args?.where?.quiz?.lectureId;
        return lectureId === "lec-6" ? [{ score: 0 }] : [{ score: 100 }];
      });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-6" }, { id: "lec-7" }])
        .mockResolvedValueOnce([{ id: "lec-6" }, { id: "lec-7" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-6", title: "Lecture 6", videoUrl: "/uploads/6.mp4", durationMinutes: 9 },
          { id: "lec-7", title: "Lecture 7", videoUrl: "/uploads/7.mp4", durationMinutes: 11 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.3 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-7");
      expect(result.alternatives).toEqual(["lec-7"]);
    });

    it("recommends rewatching the best candidate when every next-up candidate is a struggle lecture", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
      ]);
      prisma.quizAttempt.findMany.mockImplementation(async (args?: any) => {
        const lectureId = args?.where?.quiz?.lectureId;
        return lectureId === "lec-6" ? [{ score: 0 }] : [{ score: 100 }];
      });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockImplementation(async (args?: any) => {
        const id = args?.where?.id;
        return id === "lec-6"
          ? {
              id: "lec-6",
              courseId: "course-1",
              lectureOrder: 2,
              createdAt: new Date("2026-01-05T00:00:00Z"),
              title: "Lecture 6",
              videoUrl: "/uploads/6.mp4",
              durationMinutes: 9,
            }
          : {
              id: "lec-1",
              courseId: "course-1",
              lectureOrder: 1,
              createdAt: new Date("2026-01-05T00:00:00Z"),
              title: "Lecture 1",
              videoUrl: "/uploads/1.mp4",
              durationMinutes: 15,
            };
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-6" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "lec-6" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-6", title: "Lecture 6", videoUrl: "/uploads/6.mp4", durationMinutes: 9 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.3 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("REWATCH");
      expect(result.recommendedResource).toBe("lec-6");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 6" }),
      );
    });

    it("recommends rewatching the current lecture when the student failed its quizzes", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-2" },
      ]);
      prisma.quizAttempt.findMany.mockResolvedValue([{ score: 0 }, { score: 0 }]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.2 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("REWATCH");
      expect(result.recommendedResource).toBe("lec-1");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 1" }),
      );
      expect(result.rewatchReason).toContain("0% on this lecture's quiz");
      expect(result.alternatives).toEqual([]);
    });

    it("recommends rewatching the current lecture when the student quit the video early", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
      ]);
      prisma.studentInteraction.findFirst.mockResolvedValue({
        lectureId: "lec-1",
        watchPercent: 45,
      });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.2 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("REWATCH");
      expect(result.recommendedResource).toBe("lec-1");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 1" }),
      );
      expect(result.rewatchReason).toContain("before it finished");
    });

    it("does not rewatch when the video was watched to completion", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-2" },
      ]);
      prisma.studentInteraction.findFirst.mockResolvedValue({
        lectureId: "lec-1",
        watchPercent: 100,
      });
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 1 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-6" }])
        .mockResolvedValueOnce([{ id: "lec-6" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-6", title: "Lecture 6", videoUrl: "/uploads/6.mp4", durationMinutes: 9 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.2 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-6");
    });

    it("surfaces a popular next-video pick when everything is watched and the student is not struggling", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { lectureId: "lec-1" },
        { lectureId: "lec-3" },
      ]);
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 2 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.studentInteraction.groupBy.mockResolvedValue([
        { lectureId: "lec-9", _count: { _all: 7 } },
      ]);
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.resourceTransition.findMany.mockResolvedValue([]);
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        lectureOrder: 1,
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany
        .mockResolvedValueOnce([{ id: "lec-1" }, { id: "lec-3" }, { id: "lec-9" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "lec-9", title: "Lecture 9", videoUrl: "/uploads/9.mp4", durationMinutes: 11 },
        ]);

      mockMlService({ recommendation: "NEXT_VIDEO", rewatch_probability: 0.2 });
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.recommendedResource).toBe("lec-9");
      expect(result.recommendedLecture).toEqual(
        expect.objectContaining({ title: "Lecture 9" }),
      );
    });
  });

  describe("predict error handling", () => {
    it("falls back to transition-based NEXT_VIDEO when the ML service is down", async () => {
      prisma.studentInteraction.aggregate
        .mockResolvedValueOnce({ _sum: { clickCount: 3 } })
        .mockResolvedValueOnce({ _max: { createdAt: new Date("2026-08-13T00:00:00Z") } });
      prisma.resourceTransition.aggregate.mockResolvedValue({
        _max: { updatedAt: new Date("2026-08-14T00:00:00Z") },
      });
      prisma.lecture.findUnique.mockResolvedValue({
        id: "lec-1",
        courseId: "course-1",
        createdAt: new Date("2026-01-05T00:00:00Z"),
        title: "Lecture 1",
        videoUrl: "/uploads/1.mp4",
        durationMinutes: 15,
      });
      prisma.lecture.findMany.mockResolvedValue([
        { id: "lec-3", title: "Lecture 3", videoUrl: "/uploads/3.mp4", durationMinutes: 10 },
        { id: "lec-4", title: "Lecture 4", videoUrl: "/uploads/4.mp4", durationMinutes: 12 },
      ]);

      (global as any).fetch = jest.fn<() => Promise<any>>().mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await service.getRecommendationForUser("user-1", "lec-1");

      expect(result.recommendation).toBe("NEXT_VIDEO");
      expect(result.rewatchProbability).toBe(0);
      expect(result.recommendedResource).toBe("lec-3");
    });

    it("throws ServiceUnavailableException on a non-OK ML response", async () => {
      (global as any).fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn<() => Promise<string>>().mockResolvedValue("service down"),
      });
      await expect(service.getRecommendationForUser("user-1", "lec-1")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe("rebuildTransitions", () => {
    it("counts student resource-transition pairs in chronological order", async () => {
      prisma.studentInteraction.findMany.mockResolvedValue([
        { studentId: "s1", lectureId: "a" },
        { studentId: "s1", lectureId: "b" },
        { studentId: "s1", lectureId: "a" },
        { studentId: "s2", lectureId: "a" },
        { studentId: "s2", lectureId: "b" },
      ]);

      await service.rebuildTransitions();

      const createMany = prisma.resourceTransition.createMany.mock.calls[0][0];
      const rows = createMany.data;
      const toMap = (arr: typeof rows) =>
        Object.fromEntries(arr.map((row: any) => [`${row.resourceId}|${row.nextResourceId}`, row.count]));

      expect(toMap(rows)).toEqual({ "a|b": 2, "b|a": 1 });
      expect(prisma.resourceTransition.deleteMany).toHaveBeenCalledWith({});
    });
  });
});