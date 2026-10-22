import { describe, expect, it, jest } from "@jest/globals";
import { UnauthorizedException } from "@nestjs/common";
import { QuizService } from "./quiz.service";

const fn = () => jest.fn<(...args: any[]) => any>();

describe("QuizService.listMyAttemptHistory", () => {
  function setup() {
    const prisma = {
      user: { findUnique: fn().mockResolvedValue({ email: "sara@test" }) },
      quizAttempt: {
        findMany: fn().mockResolvedValue([
          { score: 100, passed: true, submittedAt: new Date("2026-10-01"), quiz: { lectureId: "l1" } },
          { score: 0, passed: false, submittedAt: new Date("2026-10-02"), quiz: { lectureId: null } },
        ]),
      },
      lecture: { findMany: fn().mockResolvedValue([{ id: "l1", courseId: "c1" }]) },
    };
    return { prisma, service: new QuizService(prisma as any) };
  }

  it("returns only the signed-in student's own attempts, with their course", async () => {
    const { prisma, service } = setup();
    const history = await service.listMyAttemptHistory({ userId: "stu-1", role: "STUDENT" });
    expect(prisma.quizAttempt.findMany.mock.calls[0][0]).toMatchObject({
      where: { studentId: { in: ["sara@test", "stu-1"] } },
      orderBy: { submittedAt: "asc" },
    });
    expect(history).toEqual([
      { submittedAt: new Date("2026-10-01"), score: 100, passed: true, courseId: "c1" },
      { submittedAt: new Date("2026-10-02"), score: 0, passed: false, courseId: null },
    ]);
  });

  it("requires an authenticated user", async () => {
    const { service } = setup();
    await expect(service.listMyAttemptHistory(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
