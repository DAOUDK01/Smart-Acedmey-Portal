import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  StudyPlannerAiClient,
  StudyPlannerAiError,
  allowedFactsFor,
  buildAdvicePrompt,
  hasUnsupportedClaim,
  validateAdvice,
} from "./study-planner.ai";
import { buildStudyUnits } from "./study-planner.engine";
import { PlannerContext, PlannerInput } from "./study-planner.types";

const context: PlannerContext = {
  courses: [{ id: "c1", title: "Databases", code: null }],
  lectures: [
    {
      id: "l1",
      courseId: "c1",
      title: "ER Modelling",
      order: 1,
      durationMinutes: 30,
      watchPercent: 100,
      quizCount: 1,
      quizTopics: [],
      performance: { attempts: 3, averageScore: 40, latestScore: 33, failedQuizCount: 1 },
    },
    {
      id: "l2",
      courseId: "c1",
      title: "Normalization",
      order: 2,
      durationMinutes: 20,
      watchPercent: null,
      quizCount: 0,
      quizTopics: [],
      performance: { attempts: 1, averageScore: 0, latestScore: 0, failedQuizCount: 1 },
    },
  ],
  topicStats: [],
  mockExams: [],
};
const input: PlannerInput = {
  courseIds: ["c1"],
  topics: [],
  examDate: null,
  startDate: "2026-10-12",
  dailyMinutes: 60,
  studyDays: [1, 2, 3],
  startMinute: 1080,
  targetScore: 75,
};
const { units } = buildStudyUnits(context, input);
const facts = allowedFactsFor(units, input);

describe("study planner AI output validation", () => {
  it("accepts well-formed advice for real units", () => {
    const advice = validateAdvice(
      {
        summary: "Focus on ER Modelling first: your average there is 40%.",
        units: [
          { key: "lecture:l1", priority: "high", note: "Revisit the cardinality examples." },
          { key: "lecture:l2", priority: "MEDIUM", note: "Watch it before your next quiz." },
        ],
        tips: ["Study in short focused blocks."],
      },
      units,
      facts,
    );
    expect(advice).not.toBeNull();
    expect(advice!.units.map((unit) => unit.priority)).toEqual(["HIGH", "MEDIUM"]);
    expect(advice!.summary).toContain("40%");
  });

  it("drops unknown units, invalid priorities, duplicates and fabricated metrics", () => {
    const advice = validateAdvice(
      {
        summary: "Your Normalization score is 12% so it needs work.",
        units: [
          { key: "lecture:made-up", priority: "HIGH" },
          { key: "lecture:l1", priority: "URGENT" },
          { key: "lecture:l2", priority: "HIGH", note: "You failed 9 attempts here." },
          { key: "lecture:l2", priority: "LOW" },
        ],
        tips: ["See https://example.com for notes", "Review your notes daily."],
      },
      units,
      facts,
    );
    expect(advice!.summary).toBeNull();
    expect(advice!.units).toEqual([{ key: "lecture:l2", priority: "HIGH", note: null }]);
    expect(advice!.tips).toEqual(["Review your notes daily."]);
  });

  it("returns null for malformed or empty output so the rule-based plan is used", () => {
    expect(validateAdvice(null, units, facts)).toBeNull();
    expect(validateAdvice("not json", units, facts)).toBeNull();
    expect(validateAdvice([], units, facts)).toBeNull();
    expect(validateAdvice({ units: [{ key: "nope", priority: "HIGH" }] }, units, facts)).toBeNull();
  });

  it("only exposes reliable performance to the model", () => {
    const prompt = JSON.parse(buildAdvicePrompt(units, input, "2026-10-25"));
    const l1 = prompt.units.find((unit: { key: string }) => unit.key === "lecture:l1");
    const l2 = prompt.units.find((unit: { key: string }) => unit.key === "lecture:l2");
    expect(l1.quizAverage).toBe(40);
    expect(l2.quizAverage).toBeUndefined();
    expect(hasUnsupportedClaim("Your average is 0%.", facts)).toBe(true);
    expect(hasUnsupportedClaim("Aim for your 75% target.", facts)).toBe(false);
  });
});

describe("StudyPlannerAiClient", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("reports unavailable when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const client = new StudyPlannerAiClient();
    expect(client.isConfigured()).toBe(false);
    await expect(client.requestAdvice("{}")).resolves.toBeNull();
  });

  it("turns timeouts and malformed responses into StudyPlannerAiError", async () => {
    delete process.env.GROQ_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    const client = new StudyPlannerAiClient();

    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    jest.spyOn(global, "fetch").mockRejectedValueOnce(abort);
    await expect(client.requestAdvice("{}")).rejects.toThrow(new StudyPlannerAiError("AI request timed out"));

    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "{not json" } }] }), { status: 200 }),
    );
    await expect(client.requestAdvice("{}")).rejects.toThrow("not valid JSON");

    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("busy", { status: 503 }));
    await expect(client.requestAdvice("{}")).rejects.toThrow("status 503");
  });
});
