import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { StudyPlannerAiClient } from "./study-planner.ai";
import { addDays, parseIsoDate, taskIdentity, toIsoDate } from "./study-planner.engine";
import { StudyPlannerService, computeProgress } from "./study-planner.service";
import { PlannerContext } from "./study-planner.types";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const fn = (): AnyMock => jest.fn<(...args: any[]) => any>();

const TODAY = toIsoDate(new Date());
const OWNER = "student-a";
const INTRUDER = "student-b";

const context: PlannerContext = {
  courses: [{ id: "c1", title: "Databases", code: "DB101" }],
  lectures: [
    {
      id: "l1",
      courseId: "c1",
      title: "ER Modelling",
      order: 1,
      durationMinutes: 30,
      watchPercent: 100,
      quizCount: 2,
      quizTopics: [],
      performance: { attempts: 4, averageScore: 35, latestScore: 20, failedQuizCount: 2 },
    },
    {
      id: "l2",
      courseId: "c1",
      title: "Normalization",
      order: 2,
      durationMinutes: 40,
      watchPercent: null,
      quizCount: 1,
      quizTopics: [],
      performance: null,
    },
  ],
  topicStats: [],
  mockExams: [],
};

function makeTask(overrides: Record<string, unknown>) {
  return {
    id: "task-1",
    planId: "plan-a",
    courseId: "c1",
    subject: "Databases",
    topic: "Normalization",
    title: "Watch: Normalization",
    type: "WATCH_LECTURE",
    lectureId: "l2",
    mockExamId: null,
    scheduledDate: parseIsoDate(TODAY)!,
    startMinute: 18 * 60,
    durationMinutes: 40,
    priority: "HIGH",
    status: "PENDING",
    reason: null,
    skipReason: null,
    completedAt: null,
    autoCompleted: false,
    isCustom: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const planRow = {
  id: "plan-a",
  studentId: OWNER,
  title: "Databases study plan",
  status: "ACTIVE",
  courseIds: ["c1"],
  topics: [],
  examDate: null,
  startDate: parseIsoDate(TODAY)!,
  endDate: parseIsoDate(addDays(TODAY, 13))!,
  dailyMinutes: 60,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 18 * 60,
  targetScore: null,
  goal: null,
  generatedBy: "RULES",
  aiSummary: null,
  recommendations: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("StudyPlannerService", () => {
  let service: StudyPlannerService;
  let ai: { isConfigured: AnyMock; requestAdvice: AnyMock };
  let tx: Record<string, Record<string, AnyMock>>;
  let prisma: Record<string, any>;
  let tasks: ReturnType<typeof makeTask>[];

  beforeEach(() => {
    tasks = [makeTask({})];
    tx = {
      studyPlan: { findMany: fn().mockResolvedValue([]), updateMany: fn(), create: fn().mockResolvedValue({ id: "plan-new" }), update: fn() },
      studyPlanHistory: { createMany: fn(), create: fn() },
      studyTask: { deleteMany: fn(), createMany: fn(), update: fn() },
    };
    prisma = {
      user: { findUnique: fn().mockResolvedValue({ email: "a@student.test" }) },
      studyPlan: {
        // Behaves like the database: rows are only returned when every filter matches.
        findFirst: fn().mockImplementation(async ({ where }: any) => {
          const rows = [planRow].filter(
            (plan) =>
              (where.id === undefined || plan.id === where.id) &&
              (where.studentId === undefined || plan.studentId === where.studentId) &&
              (where.status === undefined || plan.status === where.status),
          );
          return rows[0] ?? null;
        }),
        update: fn(),
        delete: fn(),
      },
      studyTask: {
        findFirst: fn().mockImplementation(async ({ where }: any) => {
          const task = tasks.find((item) => item.id === where.id && item.planId === where.planId);
          if (!task || planRow.studentId !== where.plan?.studentId) return null;
          return { ...task, plan: planRow };
        }),
        findMany: fn().mockImplementation(async () => tasks),
        update: fn(),
        delete: fn(),
        create: fn(),
      },
      course: { findFirst: fn().mockResolvedValue({ title: "Databases" }) },
      lecture: { findFirst: fn().mockResolvedValue({ id: "l2" }) },
      mockExam: { findMany: fn().mockResolvedValue([]) },
      $transaction: fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    ai = { isConfigured: fn().mockReturnValue(false), requestAdvice: fn() };
    service = new StudyPlannerService(prisma as any, ai as unknown as StudyPlannerAiClient);
    jest.spyOn(service, "loadContext").mockResolvedValue({ context, enrollmentSource: "admission" });
    jest.spyOn(service, "getPlanDetail").mockImplementation(async (_user, planId) => ({ id: planId }) as any);
  });

  const createBody = {
    courseIds: ["c1"],
    dailyMinutes: 60,
    studyDays: [0, 1, 2, 3, 4, 5, 6],
    startTime: "18:00",
  };

  const noActivePlan = () =>
    prisma.studyPlan.findFirst.mockImplementation(async ({ where }: any) =>
      where.status === "ACTIVE" ? null : planRow,
    );

  describe("creating a plan", () => {
    it("saves a rule-based plan built from the student's real courses and lectures", async () => {
      noActivePlan();
      const result = await service.createPlan(OWNER, createBody);

      expect(result.generation.aiStatus).toBe("unavailable");
      const data = tx.studyPlan.create.mock.calls[0][0].data;
      expect(data.studentId).toBe(OWNER);
      expect(data.generatedBy).toBe("RULES");
      const created = data.tasks.create as { lectureId: string | null; durationMinutes: number; scheduledDate: Date }[];
      expect(created.length).toBeGreaterThan(0);
      expect(created.every((task) => task.lectureId === null || ["l1", "l2"].includes(task.lectureId))).toBe(true);

      const perDay = new Map<string, number>();
      for (const task of created) {
        const day = toIsoDate(task.scheduledDate);
        perDay.set(day, (perDay.get(day) ?? 0) + task.durationMinutes);
      }
      for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(60);
      expect(data.history.create.action).toBe("CREATED");
    });

    it("asks for confirmation before replacing an active plan, then archives it", async () => {
      await expect(service.createPlan(OWNER, createBody)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.studyPlan.create).not.toHaveBeenCalled();

      tx.studyPlan.findMany.mockResolvedValue([{ id: "plan-a" }]);
      await service.createPlan(OWNER, { ...createBody, replaceExisting: true });
      expect(tx.studyPlan.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["plan-a"] } },
        data: { status: "ARCHIVED" },
      });
      expect(tx.studyPlan.create).toHaveBeenCalled();
    });

    it("falls back to the rule-based planner when the AI fails or returns junk", async () => {
      noActivePlan();
      ai.isConfigured.mockReturnValue(true);
      ai.requestAdvice.mockRejectedValueOnce(new Error("timeout"));
      const failed = await service.createPlan(OWNER, createBody);
      expect(failed.generation.aiStatus).toBe("failed");
      expect(tx.studyPlan.create.mock.calls[0][0].data.generatedBy).toBe("RULES");

      ai.requestAdvice.mockResolvedValueOnce({ units: "nope", summary: 42 });
      const invalid = await service.createPlan(OWNER, createBody);
      expect(invalid.generation.aiStatus).toBe("invalid");
      expect(tx.studyPlan.create.mock.calls[1][0].data.tasks.create.length).toBeGreaterThan(0);
    });

    it("uses validated AI advice and keeps the summary only when it is supported by data", async () => {
      noActivePlan();
      ai.isConfigured.mockReturnValue(true);
      ai.requestAdvice.mockResolvedValueOnce({
        summary: "Start with ER Modelling, where your average is 35%.",
        units: [{ key: "lecture:l1", priority: "HIGH", note: "Redo the checkpoint questions." }],
        tips: [],
      });
      const result = await service.createPlan(OWNER, createBody);
      expect(result.generation.aiStatus).toBe("used");
      const data = tx.studyPlan.create.mock.calls[0][0].data;
      expect(data.generatedBy).toBe("AI");
      expect(data.aiSummary).toContain("35%");
    });

    it("rejects courses the student is not enrolled in, past exams and sessions past midnight", async () => {
      noActivePlan();
      await expect(service.createPlan(OWNER, { ...createBody, courseIds: ["other-course"] })).rejects.toThrow(
        "not part of your enrolment",
      );
      await expect(service.createPlan(OWNER, { ...createBody, examDate: TODAY })).rejects.toThrow("after today");
      await expect(
        service.createPlan(OWNER, { ...createBody, startTime: "23:30", dailyMinutes: 60 }),
      ).rejects.toThrow("past midnight");
    });

    it("explains when there is no course data to plan from", async () => {
      noActivePlan();
      (service.loadContext as jest.Mock<any>).mockResolvedValueOnce({
        context: { ...context, lectures: [] },
        enrollmentSource: "admission",
      });
      await expect(service.createPlan(OWNER, createBody)).rejects.toThrow("no published lectures");
    });
  });

  describe("ownership", () => {
    beforeEach(() => {
      (service.getPlanDetail as jest.Mock<any>).mockRestore();
    });

    it("hides another student's plan as not found", async () => {
      await expect(service.getPlanDetail(INTRUDER, "plan-a", TODAY)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deletePlan(INTRUDER, "plan-a")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.updatePlan(INTRUDER, "plan-a", { title: "mine now" })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.regeneratePlan(INTRUDER, "plan-a", { confirm: true })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.studyPlan.delete).not.toHaveBeenCalled();
      expect(prisma.studyPlan.update).not.toHaveBeenCalled();
    });

    it("refuses to change another student's tasks", async () => {
      await expect(service.completeTask(INTRUDER, "plan-a", "task-1")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.skipTask(INTRUDER, "plan-a", "task-1", "x")).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.rescheduleTask(INTRUDER, "plan-a", "task-1", { scheduledDate: addDays(TODAY, 1) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteTask(INTRUDER, "plan-a", "task-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.studyTask.update).not.toHaveBeenCalled();
      expect(prisma.studyTask.delete).not.toHaveBeenCalled();
      expect(prisma.studyTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ plan: { studentId: INTRUDER } }) }),
      );
    });
  });

  describe("task actions", () => {
    it("completes, skips and reopens the student's own task", async () => {
      await service.completeTask(OWNER, "plan-a", "task-1");
      expect(prisma.studyTask.update).toHaveBeenLastCalledWith({
        where: { id: "task-1" },
        data: expect.objectContaining({ status: "COMPLETED", autoCompleted: false }),
      });

      await service.skipTask(OWNER, "plan-a", "task-1", "  Felt unwell  ");
      expect(prisma.studyTask.update).toHaveBeenLastCalledWith({
        where: { id: "task-1" },
        data: expect.objectContaining({ status: "SKIPPED", skipReason: "Felt unwell" }),
      });

      await service.reopenTask(OWNER, "plan-a", "task-1");
      expect(prisma.studyTask.update).toHaveBeenLastCalledWith({
        where: { id: "task-1" },
        data: expect.objectContaining({ status: "PENDING", completedAt: null }),
      });
    });

    it("reschedules within the daily limit and rejects overbooked or past days", async () => {
      const tomorrow = addDays(TODAY, 1);
      prisma.studyTask.findMany.mockResolvedValueOnce([{ startMinute: 18 * 60, durationMinutes: 15 }]);
      await service.rescheduleTask(OWNER, "plan-a", "task-1", { scheduledDate: tomorrow });
      expect(prisma.studyTask.update).toHaveBeenLastCalledWith({
        where: { id: "task-1" },
        data: expect.objectContaining({ scheduledDate: parseIsoDate(tomorrow), startMinute: 18 * 60 + 15 + 10 }),
      });

      prisma.studyTask.findMany.mockResolvedValueOnce([{ startMinute: 18 * 60, durationMinutes: 30 }]);
      await expect(
        service.rescheduleTask(OWNER, "plan-a", "task-1", { scheduledDate: tomorrow }),
      ).rejects.toThrow("already has 30 of your 60 daily study minutes");

      await expect(
        service.rescheduleTask(OWNER, "plan-a", "task-1", { scheduledDate: addDays(TODAY, -2) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("keeps completed tasks as history instead of deleting them", async () => {
      tasks = [makeTask({ status: "COMPLETED" })];
      await expect(service.deleteTask(OWNER, "plan-a", "task-1")).rejects.toThrow("kept as study history");
      expect(prisma.studyTask.delete).not.toHaveBeenCalled();
    });

    it("only adds tasks for courses and lectures in the plan", async () => {
      await expect(
        service.addTask(OWNER, "plan-a", {
          courseId: "not-in-plan",
          topic: "Extra",
          type: "REVISE",
          durationMinutes: 20,
          scheduledDate: TODAY,
        }),
      ).rejects.toThrow("courses in this plan");

      prisma.lecture.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.addTask(OWNER, "plan-a", {
          courseId: "c1",
          topic: "Extra",
          type: "WATCH_LECTURE",
          durationMinutes: 20,
          scheduledDate: TODAY,
          lectureId: "fake-lecture",
        }),
      ).rejects.toThrow("isn't available");
      expect(prisma.studyTask.create).not.toHaveBeenCalled();
    });
  });

  describe("regeneration", () => {
    it("keeps completed and skipped tasks, replaces pending ones and records history", async () => {
      tasks = [
        makeTask({ id: "done", status: "COMPLETED" }),
        makeTask({ id: "skipped", status: "SKIPPED", type: "REVISE", lectureId: "l1", topic: "ER Modelling" }),
        makeTask({ id: "pending", type: "PRACTICE_QUIZ" }),
      ];
      const result = await service.regeneratePlan(OWNER, "plan-a", { confirm: true, dailyMinutes: 90 });

      expect(tx.studyTask.deleteMany).toHaveBeenCalledWith({ where: { planId: "plan-a", status: "PENDING" } });
      const created = tx.studyTask.createMany.mock.calls[0][0].data as { type: string; lectureId: string }[];
      // The completed "Watch: Normalization" is not scheduled again.
      expect(created.some((task) => task.type === "WATCH_LECTURE" && task.lectureId === "l2")).toBe(false);
      expect(tx.studyPlan.update.mock.calls[0][0].data.dailyMinutes).toBe(90);
      const history = tx.studyPlanHistory.create.mock.calls[0][0].data;
      expect(history.action).toBe("REGENERATED");
      expect(history.summary).toContain("kept 1 completed and 1 skipped");
      expect(result.generation.aiStatus).toBe("unavailable");
      expect(taskIdentity("WATCH_LECTURE", "c1", "l2")).toBe("WATCH_LECTURE|c1|l2");
    });

    it("moves missed tasks into upcoming free time only when asked", async () => {
      tasks = [makeTask({ id: "missed", scheduledDate: parseIsoDate(addDays(TODAY, -3)) })];
      const result = await service.rescheduleMissed(OWNER, "plan-a");
      expect(result.moved).toBe(1);
      const update = tx.studyTask.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: "missed" });
      expect(toIsoDate(update.data.scheduledDate) >= TODAY).toBe(true);
      expect(tx.studyPlanHistory.create.mock.calls[0][0].data.action).toBe("RESCHEDULED");
    });
  });
});

describe("computeProgress", () => {
  it("counts completed minutes against non-skipped work", () => {
    const today = "2026-10-12";
    const day = (iso: string) => parseIsoDate(iso)!;
    const progress = computeProgress(
      [
        { status: "COMPLETED", durationMinutes: 30, scheduledDate: day(today) },
        { status: "PENDING", durationMinutes: 30, scheduledDate: day(today) },
        { status: "PENDING", durationMinutes: 40, scheduledDate: day("2026-10-10") },
        { status: "SKIPPED", durationMinutes: 50, scheduledDate: day("2026-10-11") },
      ],
      today,
    );
    expect(progress).toMatchObject({
      totalTasks: 4,
      completedTasks: 1,
      skippedTasks: 1,
      remainingTasks: 2,
      missedTasks: 1,
      totalMinutes: 100,
      completedMinutes: 30,
      percent: 30,
      todayTasks: 2,
      todayCompleted: 1,
      todayMinutes: 60,
    });
  });
});
