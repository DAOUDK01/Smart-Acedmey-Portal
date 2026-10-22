import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { AssistantContextService } from "./assistant.context";
import { ROLE_GUIDES } from "./assistant.guide";
import { AssistantLlm, AssistantLlmError } from "./assistant.llm";
import { buildSystemPrompt } from "./assistant.prompts";
import { AssistantService } from "./assistant.service";

type AnyMock = jest.Mock<(...args: any[]) => any>;
const fn = (): AnyMock => jest.fn<(...args: any[]) => any>();

describe("AssistantService", () => {
  let context: { build: AnyMock; firstName: AnyMock };
  let llm: { isConfigured: AnyMock; complete: AnyMock };
  let service: AssistantService;

  beforeEach(() => {
    context = {
      build: fn().mockResolvedValue({ name: "Sara", data: { courses: [{ title: "Databases" }] } }),
      firstName: fn().mockResolvedValue("Sara"),
    };
    llm = { isConfigured: fn().mockReturnValue(true), complete: fn().mockResolvedValue("Hi Sara! Let's revise joins.") };
    service = new AssistantService(context as unknown as AssistantContextService, llm as unknown as AssistantLlm);
  });

  it("returns role-specific suggestions and quick actions for each portal", async () => {
    for (const role of ["STUDENT", "TEACHER", "GUARDIAN", "ADMIN"] as const) {
      const profile = await service.profile({ userId: "u1", role });
      expect(profile.role).toBe(role);
      expect(profile.suggestions).toEqual(ROLE_GUIDES[role].suggestions);
      expect(profile.quickActions).toEqual(ROLE_GUIDES[role].quickActions);
      // Quick actions only point at pages in that role's own portal.
      const tabs = ROLE_GUIDES[role].features.map((f) => f.tab);
      expect(profile.quickActions.every((action) => tabs.includes(action.tab))).toBe(true);
    }
    const student = await service.profile({ userId: "u1", role: "STUDENT" });
    const teacher = await service.profile({ userId: "u1", role: "TEACHER" });
    expect(student.suggestions).not.toEqual(teacher.suggestions);
  });

  it("rejects missing or unknown roles", async () => {
    await expect(service.profile(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.chat({ userId: "u1", role: "SUPERUSER" }, { message: "hi" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("sends the user's own context, history and message to the real model", async () => {
    const result = await service.chat(
      { userId: "student-1", role: "STUDENT" },
      {
        message: "  What should I revise?  ",
        tab: "study-planner",
        history: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "Hi!" },
        ],
      },
    );

    expect(result).toEqual({ reply: "Hi Sara! Let's revise joins.", usedPortalData: true });
    expect(context.build).toHaveBeenCalledWith({ userId: "student-1", role: "STUDENT" });
    const messages = llm.complete.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain('"title":"Databases"');
    expect(messages[0].content).toContain('currently on the "AI Study Planner" page');
    expect(messages.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.at(-1)!.content).toBe("What should I revise?");
  });

  it("ignores a page hint from another portal", async () => {
    await service.chat({ userId: "t1", role: "TEACHER" }, { message: "help", tab: "student-admissions" });
    const system = (llm.complete.mock.calls[0][0] as { content: string }[])[0].content;
    expect(system).not.toContain("currently on");
    expect(system).toContain("Teacher Portal");
    expect(system).not.toContain("Students › Admissions");
  });

  it("caps forwarded history to bound cost", async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: "user" as const, content: `m${i}${"x".repeat(3000)}` }));
    await service.chat({ userId: "u1", role: "ADMIN" }, { message: "hi", history });
    const messages = llm.complete.mock.calls[0][0] as { content: string }[];
    expect(messages).toHaveLength(1 + 10 + 1);
    expect(messages[1].content.length).toBe(2000);
  });

  it("reports an unconfigured model instead of faking a reply", async () => {
    llm.isConfigured.mockReturnValue(false);
    const error = await service.chat({ userId: "u1", role: "STUDENT" }, { message: "hi" }).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({ code: "AI_UNCONFIGURED" });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("turns model failures into a retryable error", async () => {
    llm.complete.mockRejectedValue(new AssistantLlmError("AI request timed out"));
    const error = await service.chat({ userId: "u1", role: "GUARDIAN" }, { message: "hi" }).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({ code: "AI_FAILED" });
  });

  it("tells the user to wait when the provider is rate limited", async () => {
    llm.complete.mockRejectedValue(new AssistantLlmError("AI request failed: 429", true));
    const error = await service.chat({ userId: "u1", role: "STUDENT" }, { message: "hi" }).catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code: "AI_FAILED", message: expect.stringContaining("try again in a few seconds") });
  });

  it("still answers when portal data can't be loaded, without claiming facts", async () => {
    context.build.mockResolvedValue({ name: "Sara", data: null });
    const result = await service.chat({ userId: "u1", role: "STUDENT" }, { message: "hi" });
    expect(result.usedPortalData).toBe(false);
    const system = (llm.complete.mock.calls[0][0] as { content: string }[])[0].content;
    expect(system).toContain("Portal data is unavailable");
  });
});

describe("buildSystemPrompt", () => {
  it("forbids inventing records and lists only the role's own features", () => {
    const prompt = buildSystemPrompt({ role: "GUARDIAN", name: "Ali", data: { child: { name: "Zara" } }, currentTab: null });
    expect(prompt).toContain("Never invent scores");
    expect(prompt).toContain("Parent Portal");
    expect(prompt).toContain("Quiz Attempts");
    expect(prompt).not.toContain("Upload Lecture");
    expect(prompt).toContain('"name":"Zara"');
  });
});

describe("AssistantContextService scoping", () => {
  const asyncFn = () => fn();
  let prisma: Record<string, Record<string, AnyMock>>;
  let planner: { loadContext: AnyMock };
  let guardian: { dashboard: AnyMock };
  let stats: { getAdminStats: AnyMock; getTeacherStats: AnyMock };
  let service: AssistantContextService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: asyncFn().mockResolvedValue({ name: "Sara Khan", email: "sara@test" }), findMany: asyncFn().mockResolvedValue([]) },
      quizAttempt: { findMany: asyncFn().mockResolvedValue([]) },
      studyPlan: { findFirst: asyncFn().mockResolvedValue(null) },
      sectionCourseAssignment: { findMany: asyncFn().mockResolvedValue([]) },
    };
    planner = { loadContext: asyncFn().mockResolvedValue({ context: { courses: [], lectures: [], topicStats: [], mockExams: [] } }) };
    guardian = { dashboard: asyncFn().mockResolvedValue({ student: null }) };
    stats = {
      getAdminStats: asyncFn(),
      getTeacherStats: asyncFn().mockResolvedValue({ avgQuizScore: 70, totalAttempts: 10, passRate: 60 }),
    };
    service = new AssistantContextService(prisma as any, planner as any, guardian as any, stats as any);
  });

  it("loads a student's data with their own id and email only", async () => {
    const result = await service.build({ userId: "stu-1", role: "STUDENT" });
    expect(result.name).toBe("Sara");
    expect(planner.loadContext).toHaveBeenCalledWith({ userId: "stu-1", email: "sara@test", keys: ["stu-1", "sara@test"] });
    expect(prisma.quizAttempt.findMany.mock.calls[0][0].where.studentId).toEqual({ in: ["stu-1", "sara@test"] });
    expect(prisma.studyPlan.findFirst.mock.calls[0][0].where).toEqual({ studentId: "stu-1", status: "ACTIVE" });
  });

  it("loads a parent's view through their own email and reports a missing child honestly", async () => {
    const result = await service.build({ userId: "g-1", role: "GUARDIAN" });
    expect(guardian.dashboard).toHaveBeenCalledWith("sara@test");
    expect(result.data).toEqual({ child: null, note: "No student is linked to this parent account yet." });
  });

  it("scopes teacher data to their own course assignments", async () => {
    const result = await service.build({ userId: "t-1", role: "TEACHER" });
    expect(prisma.sectionCourseAssignment.findMany.mock.calls[0][0].where).toEqual({ teacherId: "t-1", isActive: true });
    expect(result.data).toMatchObject({ assignedCourses: [], portalQuizTotals: { averageScore: 70 } });
  });

  it("returns no data (rather than failing the chat) when loading breaks", async () => {
    planner.loadContext.mockRejectedValue(new Error("db down"));
    const result = await service.build({ userId: "stu-1", role: "STUDENT" });
    expect(result.data).toBeNull();
  });
});
