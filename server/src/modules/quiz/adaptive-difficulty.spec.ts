import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QuizStatus } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { QuizService } from "./quiz.service";
import {
  balanceCheckpointLevels,
  closestAvailableDifficulty,
  difficultyForScores,
  levelTargets,
  selectAdaptiveQuizzes,
} from "./adaptive-difficulty";

describe("difficultyForScores", () => {
  it("Test 1: a new student with no results gets Medium", () => {
    expect(difficultyForScores([])).toBe("medium");
  });

  it("Test 2: a weak student (40, 45, 50 → 45%) gets Easy", () => {
    expect(difficultyForScores([40, 45, 50])).toBe("easy");
  });

  it("Test 3: an average student (60, 70, 65 → 65%) gets Medium", () => {
    expect(difficultyForScores([60, 70, 65])).toBe("medium");
  });

  it("Test 4: a strong student (80, 85, 90 → 85%) gets Hard", () => {
    expect(difficultyForScores([80, 85, 90])).toBe("hard");
  });

  it("uses the 50% / 75% boundaries from the rules", () => {
    expect(difficultyForScores([0])).toBe("easy");
    expect(difficultyForScores([50])).toBe("easy");
    expect(difficultyForScores([51])).toBe("medium");
    expect(difficultyForScores([75])).toBe("medium");
    expect(difficultyForScores([76])).toBe("hard");
    expect(difficultyForScores([100])).toBe("hard");
  });
});

describe("closestAvailableDifficulty", () => {
  it("returns the target when it exists", () => {
    expect(closestAvailableDifficulty("medium", ["easy", "medium", "hard"])).toBe("medium");
  });

  it("falls back to the nearest level, preferring the easier one on a tie", () => {
    expect(closestAvailableDifficulty("medium", ["easy", "hard"])).toBe("easy");
    expect(closestAvailableDifficulty("medium", ["hard"])).toBe("hard");
    expect(closestAvailableDifficulty("easy", ["medium", "hard"])).toBe("medium");
    expect(closestAvailableDifficulty("hard", ["easy"])).toBe("easy");
  });

  it("returns null when nothing is available", () => {
    expect(closestAvailableDifficulty("medium", [])).toBeNull();
  });
});

describe("selectAdaptiveQuizzes", () => {
  const quiz = (id: string, difficulty: string, timestamp = 30, lectureId = "lec-1") => ({
    id,
    lectureId,
    sourceTopic: "Algebra",
    timestamp,
    difficulty,
  });

  it("keeps only the student's level at each checkpoint, with fallback when it is missing", () => {
    const quizzes = [
      quiz("e1", "easy", 30),
      quiz("m1", "medium", 30),
      quiz("h1", "hard", 30),
      quiz("h2", "hard", 90),
    ];
    const selected = selectAdaptiveQuizzes(quizzes, () => "easy");
    expect(selected.map((q) => q.id)).toEqual(["e1", "h2"]);
  });

  it("keeps the answered quizzes of a checkpoint the student already completed", () => {
    const quizzes = [quiz("e1", "easy"), quiz("h1", "hard")];
    const selected = selectAdaptiveQuizzes(quizzes, () => "easy", new Set(["h1"]));
    expect(selected.map((q) => q.id)).toEqual(["h1"]);
  });
});

describe("QuizService.listAdaptiveQuizQuestionsForStudent", () => {
  const student = { userId: "user-1", role: "STUDENT" };
  // Teacher-created quizzes for one lecture checkpoint, one per difficulty.
  const storedQuizzes = [
    { id: "q-easy", lectureId: "lec-1", sourceTopic: "Quadratic Equations", timestamp: 60, difficulty: "easy", status: QuizStatus.APPROVED, options: ["a", "b"], topic: "Segment 1|Quadratics" },
    { id: "q-medium", lectureId: "lec-1", sourceTopic: "Quadratic Equations", timestamp: 60, difficulty: "medium", status: QuizStatus.APPROVED, options: ["a", "b"], topic: "Segment 1|Quadratics" },
    { id: "q-hard", lectureId: "lec-1", sourceTopic: "Quadratic Equations", timestamp: 60, difficulty: "hard", status: QuizStatus.APPROVED, options: ["a", "b"], topic: "Segment 1|Quadratics" },
  ];

  let service: QuizService;
  let attempts: Array<{ quizId: string; score: number; quiz: { lectureId: string | null; sourceTopic: string | null } }>;
  let prisma: any;

  // Previous attempts on another lecture of the same course (most recent first, as the query orders them).
  const historyOf = (...scores: number[]) =>
    scores.reverse().map((score, index) => ({
      quizId: `past-${index}`,
      score,
      quiz: { lectureId: "lec-0", sourceTopic: "Quadratic Equations" },
    }));

  beforeEach(() => {
    attempts = [];
    prisma = {
      user: { findUnique: jest.fn(async () => ({ email: "student@example.com" })) },
      quizQuestion: { findMany: jest.fn(async () => storedQuizzes.map((q) => ({ ...q }))) },
      quizAttempt: { findMany: jest.fn(async () => attempts) },
      lecture: {
        findMany: jest.fn(async () => [
          { id: "lec-0", courseId: "math" },
          { id: "lec-1", courseId: "math" },
        ]),
      },
    };
    service = new QuizService(prisma as unknown as PrismaService);
  });

  const shownDifficulties = async () =>
    (await service.listAdaptiveQuizQuestionsForStudent(student)).map((q: any) => q.difficulty);

  it("Test 1: a new student is shown Medium", async () => {
    expect(await shownDifficulties()).toEqual(["medium"]);
  });

  it("Test 2: a weak student is shown Easy", async () => {
    attempts = historyOf(40, 45, 50);
    expect(await shownDifficulties()).toEqual(["easy"]);
  });

  it("Test 3: an average student is shown Medium", async () => {
    attempts = historyOf(60, 70, 65);
    expect(await shownDifficulties()).toEqual(["medium"]);
  });

  it("Test 4: a strong student is shown Hard", async () => {
    attempts = historyOf(80, 85, 90);
    expect(await shownDifficulties()).toEqual(["hard"]);
  });

  it("Test 5: the teacher's Hard difficulty is never changed", async () => {
    attempts = historyOf(40);
    prisma.quizQuestion.findMany.mockResolvedValue([{ ...storedQuizzes[2] }]);

    const shown = await service.listAdaptiveQuizQuestionsForStudent(student);

    // Only a Hard quiz exists, so the weak student still gets it (closest fallback) and it stays Hard.
    expect(shown.map((q: any) => [q.id, q.difficulty])).toEqual([["q-hard", "hard"]]);
    // Selection is read-only: nothing writes to the quiz table.
    expect(prisma.quizQuestion.update).toBeUndefined();
    expect(prisma.quizQuestion.updateMany).toBeUndefined();
  });

  it("Test 6: the shown difficulty follows the student's performance as it changes", async () => {
    // Each new attempt is added to the history, just as submitting a quiz does.
    attempts = historyOf(45); // average 45%
    expect(await shownDifficulties()).toEqual(["easy"]);

    attempts = historyOf(45, 95); // average 70%
    expect(await shownDifficulties()).toEqual(["medium"]);

    attempts = historyOf(45, 95, 100, 100, 100, 100); // average 90%
    expect(await shownDifficulties()).toEqual(["hard"]);
  });

  it("only counts performance from the same subject", async () => {
    attempts = [{ quizId: "other", score: 10, quiz: { lectureId: "lec-x", sourceTopic: "Biology" } }];
    prisma.lecture.findMany.mockResolvedValue([
      { id: "lec-1", courseId: "math" },
      { id: "lec-x", courseId: "biology" },
    ]);
    expect(await shownDifficulties()).toEqual(["medium"]);
  });

  it("reports the same level the student is shown, per course", async () => {
    // Student A 45% → Easy, Student B 65% → Medium, Student C 90% → Hard.
    for (const [score, level] of [[45, "easy"], [65, "medium"], [90, "hard"]] as const) {
      attempts = historyOf(score);
      expect(await service.getAdaptiveLevelsForStudent(student)).toEqual({
        defaultLevel: "medium",
        levels: [{ courseId: "math", level, averageScore: score, attempts: 1 }],
      });
      expect(await shownDifficulties()).toEqual([level]);
    }
  });

  it("reports no course levels for a new student", async () => {
    expect(await service.getAdaptiveLevelsForStudent(student)).toEqual({ defaultLevel: "medium", levels: [] });
  });

  it("returns the full approved list for non-students", async () => {
    const shown = await service.listAdaptiveQuizQuestionsForStudent({ userId: "admin", role: "ADMIN" });
    expect(shown).toHaveLength(3);
  });
});

describe("balanceCheckpointLevels", () => {
  const q = (question: string, difficulty: string) => ({ question, difficulty });

  it("spreads a checkpoint's questions evenly across the levels", () => {
    expect(levelTargets(3)).toEqual({ easy: 1, medium: 1, hard: 1 });
    expect(levelTargets(1)).toEqual({ easy: 0, medium: 1, hard: 0 });
    expect(levelTargets(5)).toEqual({ easy: 2, medium: 2, hard: 1 });
  });

  it("fills a level the provider skipped from the fallback, relabelled", () => {
    const result = balanceCheckpointLevels(
      [q("a", "medium"), q("b", "medium"), q("c", "hard")],
      [q("f1", "easy"), q("f2", "medium")],
      3,
    );
    expect(result.map((item) => [item.question, item.difficulty])).toEqual([
      ["f1", "easy"],
      ["a", "medium"],
      ["c", "hard"],
    ]);
  });

  it("tops up with surplus provider questions when the fallback runs out", () => {
    const result = balanceCheckpointLevels([q("a", "medium"), q("b", "medium"), q("c", "medium")], [], 3);
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.difficulty === "medium")).toBe(true);
  });
});

describe("QuizService.getAdaptiveLevelsForAllStudents", () => {
  it("gives each student the same per-course level their own quizzes are picked by", async () => {
    const attempt = (studentId: string, score: number, lectureId: string | null) => ({
      studentId,
      quizId: `${studentId}-${score}`,
      score,
      quiz: { lectureId, sourceTopic: "Topic" },
    });
    // Newest first, as the query orders them. Strong in maths recently, weak in physics.
    const attempts = [
      attempt("a@example.com", 90, "lec-math"),
      attempt("a@example.com", 80, "lec-math"),
      attempt("a@example.com", 30, "lec-physics"),
      attempt("b@example.com", 60, "lec-math"),
      attempt("b@example.com", 20, null),
    ];
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ email: "a@example.com" })) },
      quizAttempt: {
        findMany: jest.fn(async (args: any) =>
          args?.where?.studentId ? attempts.filter((item) => args.where.studentId.in.includes(item.studentId)) : attempts,
        ),
      },
      lecture: {
        findMany: jest.fn(async () => [
          { id: "lec-math", courseId: "math" },
          { id: "lec-physics", courseId: "physics" },
        ]),
      },
    };
    const service = new QuizService(prisma as unknown as PrismaService);

    const result = await service.getAdaptiveLevelsForAllStudents();
    expect(result).toEqual({
      defaultLevel: "medium",
      students: [
        {
          studentId: "a@example.com",
          levels: [
            { courseId: "math", level: "hard", averageScore: 85, attempts: 2 },
            { courseId: "physics", level: "easy", averageScore: 30, attempts: 1 },
          ],
        },
        // The lecture-less attempt has no course, so it does not show as a course level.
        { studentId: "b@example.com", levels: [{ courseId: "math", level: "medium", averageScore: 60, attempts: 1 }] },
      ],
    });

    const own = await service.getAdaptiveLevelsForStudent({ userId: "user-a", role: "STUDENT" } as any);
    expect(own.levels).toEqual(result.students[0].levels);
  });
});
