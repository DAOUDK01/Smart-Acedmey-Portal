import { describe, expect, it } from "@jest/globals";
import {
  BREAK_MINUTES,
  FOCUS_BLOCK_MINUTES,
  MAX_TASK_MINUTES,
  addDays,
  applyAdvice,
  buildRecommendations,
  buildStudyUnits,
  daysBetween,
  generateDraftTasks,
  planDays,
  resolveEndDate,
  scheduleTasks,
  sessionEndMinute,
  splitDuration,
  taskIdentity,
  validateSchedule,
  weekday,
} from "./study-planner.engine";
import { PlannerContext, PlannerInput, ScheduledTask } from "./study-planner.types";

const TODAY = "2026-10-12";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function makeContext(): PlannerContext {
  return {
    courses: [
      { id: "c1", title: "Databases", code: "DB101" },
      { id: "c2", title: "Networks", code: "NET101" },
      { id: "c3", title: "Empty Course", code: null },
    ],
    lectures: [
      {
        id: "l1",
        courseId: "c1",
        title: "ER Modelling",
        order: 1,
        durationMinutes: 30,
        watchPercent: 100,
        quizCount: 2,
        quizTopics: ["Entities"],
        performance: { attempts: 4, averageScore: 40, latestScore: 30, failedQuizCount: 2 },
      },
      {
        id: "l2",
        courseId: "c1",
        title: "Normalization",
        order: 2,
        durationMinutes: 45,
        watchPercent: null,
        quizCount: 1,
        quizTopics: [],
        performance: null,
      },
      {
        id: "l3",
        courseId: "c1",
        title: "SQL Joins",
        order: 3,
        durationMinutes: 90,
        watchPercent: 50,
        quizCount: 0,
        quizTopics: [],
        performance: null,
      },
      {
        id: "l4",
        courseId: "c2",
        title: "OSI Model",
        order: 1,
        durationMinutes: 20,
        watchPercent: 100,
        quizCount: 1,
        quizTopics: [],
        performance: { attempts: 3, averageScore: 90, latestScore: 100, failedQuizCount: 0 },
      },
    ],
    topicStats: [],
    mockExams: [{ id: "m1", courseId: "c1", title: "DB Midterm Mock", endsAt: addDays(TODAY, 4), attempted: false }],
  };
}

function makeInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    courseIds: ["c1", "c2"],
    topics: [],
    examDate: null,
    startDate: TODAY,
    dailyMinutes: 60,
    studyDays: ALL_DAYS,
    startMinute: 18 * 60,
    targetScore: null,
    ...overrides,
  };
}

function plan(context = makeContext(), input = makeInput()) {
  const { units, emptyCourseIds } = buildStudyUnits(context, input);
  const endDate = resolveEndDate(input.startDate, input.examDate);
  const days = planDays(input.startDate, endDate, input.studyDays);
  const drafts = generateDraftTasks(units, input);
  const result = scheduleTasks(drafts, { days, dailyMinutes: input.dailyMinutes, startMinute: input.startMinute });
  return { units, emptyCourseIds, endDate, days, drafts, ...result };
}

function rulesFor(context: PlannerContext, input: PlannerInput, days: string[]) {
  return {
    days,
    dailyMinutes: input.dailyMinutes,
    courseIds: new Set(input.courseIds),
    lectureIds: new Set(context.lectures.map((lecture) => lecture.id)),
    mockExamIds: new Set(context.mockExams.map((exam) => exam.id)),
  };
}

function minutesByDay(tasks: ScheduledTask[]) {
  const totals = new Map<string, number>();
  for (const task of tasks) totals.set(task.scheduledDate, (totals.get(task.scheduledDate) ?? 0) + task.durationMinutes);
  return totals;
}

describe("study planner dates", () => {
  it("plans two weeks by default and stops the day before the exam", () => {
    expect(resolveEndDate(TODAY, null)).toBe(addDays(TODAY, 13));
    expect(resolveEndDate(TODAY, "2026-10-20")).toBe("2026-10-19");
    expect(daysBetween(TODAY, resolveEndDate(TODAY, "2027-06-01"))).toBe(41);
  });

  it("only keeps the student's preferred weekdays", () => {
    const days = planDays(TODAY, addDays(TODAY, 13), [1, 3]);
    expect(days).toHaveLength(4);
    expect(days.every((day) => [1, 3].includes(weekday(day)))).toBe(true);
  });

  it("accounts for breaks when checking that a session ends before midnight", () => {
    expect(sessionEndMinute(18 * 60, 120)).toBe(18 * 60 + 120 + 2 * BREAK_MINUTES);
  });
});

describe("study units", () => {
  it("uses only real enrolled lectures and open mock exams", () => {
    const { units } = plan();
    const lectureIds = units.map((unit) => unit.lectureId).filter(Boolean);
    expect(lectureIds.sort()).toEqual(["l1", "l2", "l3", "l4"]);
    expect(units.find((unit) => unit.kind === "mock-exam")?.mockExamId).toBe("m1");
  });

  it("marks reliably weak topics HIGH with a reason quoting the real score", () => {
    const { units } = plan();
    const weak = units.find((unit) => unit.lectureId === "l1")!;
    expect(weak.priority).toBe("HIGH");
    expect(weak.reasons.join(" ")).toContain("40% across 4 attempts");
    const strong = units.find((unit) => unit.lectureId === "l4")!;
    expect(strong.priority).toBe("LOW");
  });

  it("does not treat a single quiz attempt as reliable", () => {
    const context = makeContext();
    context.lectures[1].performance = { attempts: 1, averageScore: 0, latestScore: 0, failedQuizCount: 1 };
    const unit = buildStudyUnits(context, makeInput()).units.find((u) => u.lectureId === "l2")!;
    expect(unit.reliable).toBe(false);
    expect(unit.reasons.join(" ")).toContain("only quiz attempt");
  });

  it("falls back to stated confidence when there is no quiz data", () => {
    const context = makeContext();
    const input = makeInput({
      courseIds: ["c1"],
      topics: [
        { courseId: "c1", name: "Transactions", confidence: 1 },
        { courseId: "c1", name: "Indexing", confidence: 5 },
      ],
    });
    const { units } = buildStudyUnits(context, input);
    const low = units.find((unit) => unit.topic === "Transactions")!;
    const high = units.find((unit) => unit.topic === "Indexing")!;
    expect(low.kind).toBe("topic");
    expect(low.lectureId).toBeNull();
    expect(low.score).toBeGreaterThan(high.score);
    expect(low.reasons).toContain("You rated your confidence 1/5.");
  });

  it("narrows a course to the lectures that match the listed topics", () => {
    const input = makeInput({ courseIds: ["c1"], topics: [{ courseId: "c1", name: "normalization", confidence: 2 }] });
    const { units } = buildStudyUnits(makeContext(), input);
    expect(units.filter((unit) => unit.kind === "lecture").map((unit) => unit.lectureId)).toEqual(["l2"]);
    expect(units.find((unit) => unit.lectureId === "l2")!.confidence).toBe(2);
  });

  it("reports courses with no lectures and no topics instead of inventing work", () => {
    const { units, emptyCourseIds } = buildStudyUnits(makeContext(), makeInput({ courseIds: ["c3"] }));
    expect(units).toHaveLength(0);
    expect(emptyCourseIds).toEqual(["c3"]);
  });
});

describe("task generation and scheduling", () => {
  it("never exceeds the daily study time and passes validation", () => {
    for (const dailyMinutes of [15, 30, 60, 120]) {
      const context = makeContext();
      const input = makeInput({ dailyMinutes });
      const { scheduled, days } = plan(context, input);
      expect(scheduled.length).toBeGreaterThan(0);
      for (const total of minutesByDay(scheduled).values()) expect(total).toBeLessThanOrEqual(dailyMinutes);
      expect(validateSchedule(scheduled, rulesFor(context, input, days))).toEqual([]);
    }
  });

  it("splits large lectures into manageable parts", () => {
    expect(splitDuration(90, 50)).toEqual([45, 45]);
    const { drafts } = plan();
    const parts = drafts.filter((task) => task.type === "WATCH_LECTURE" && task.lectureId === "l3");
    expect(parts.length).toBe(2);
    expect(parts.every((task) => task.durationMinutes <= MAX_TASK_MINUTES)).toBe(true);
    expect(parts[1].dependsOn).toBe(parts[0].id);
  });

  it("schedules weak topics before strong ones", () => {
    const { scheduled } = plan();
    const firstWeak = scheduled.findIndex((task) => task.lectureId === "l1");
    const firstStrong = scheduled.findIndex((task) => task.lectureId === "l4");
    expect(firstWeak).toBeGreaterThanOrEqual(0);
    expect(firstStrong === -1 || firstWeak < firstStrong).toBe(true);
    expect(scheduled.some((task) => task.lectureId === "l1" && task.type === "REVIEW_MISTAKES")).toBe(true);
  });

  it("gives mastered, completed topics no busywork when there is no exam", () => {
    const { drafts } = plan();
    expect(drafts.filter((task) => task.lectureId === "l4")).toHaveLength(0);
  });

  it("puts the practice quiz after the lecture and spaces repeat revisions", () => {
    const input = makeInput({ examDate: addDays(TODAY, 20), dailyMinutes: 120 });
    const { scheduled } = plan(makeContext(), input);
    const byId = new Map(scheduled.map((task) => [task.id, task]));
    for (const task of scheduled) {
      if (!task.dependsOn) continue;
      const dependency = byId.get(task.dependsOn)!;
      expect(dependency).toBeDefined();
      const gap = daysBetween(dependency.scheduledDate, task.scheduledDate);
      expect(gap).toBeGreaterThanOrEqual(task.minGapDays);
      if (gap === 0) expect(task.startMinute).toBeGreaterThanOrEqual(dependency.startMinute + dependency.durationMinutes);
    }
    const revisions = scheduled.filter((task) => task.lectureId === "l1" && task.type === "REVISE");
    expect(revisions).toHaveLength(2);
    expect(revisions[1].reason).toContain("Spaced second revision");
  });

  it("does not schedule the same task twice without a reason", () => {
    const { scheduled } = plan(makeContext(), makeInput({ examDate: addDays(TODAY, 20) }));
    const keys = scheduled.map((task) => `${task.identity}|${task.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("schedules a mock exam before it closes", () => {
    const { scheduled } = plan();
    const exam = scheduled.find((task) => task.mockExamId === "m1")!;
    expect(exam.type).toBe("PRACTICE_QUIZ");
    expect(exam.scheduledDate <= addDays(TODAY, 4)).toBe(true);
  });

  it("inserts breaks between focus blocks and never runs past midnight", () => {
    const input = makeInput({ dailyMinutes: 180, startMinute: 20 * 60 });
    const { scheduled } = plan(makeContext(), input);
    const byDay = new Map<string, ScheduledTask[]>();
    for (const task of scheduled) byDay.set(task.scheduledDate, [...(byDay.get(task.scheduledDate) ?? []), task]);
    for (const tasks of byDay.values()) {
      let continuous = 0;
      tasks.sort((a, b) => a.startMinute - b.startMinute);
      tasks.forEach((task, index) => {
        expect(task.startMinute + task.durationMinutes).toBeLessThanOrEqual(24 * 60);
        if (index > 0) {
          const previous = tasks[index - 1];
          const gap = task.startMinute - (previous.startMinute + previous.durationMinutes);
          continuous = gap >= BREAK_MINUTES ? 0 : continuous;
        }
        continuous += task.durationMinutes;
        expect(continuous).toBeLessThanOrEqual(FOCUS_BLOCK_MINUTES);
      });
    }
  });

  it("reports work that doesn't fit instead of overbooking", () => {
    const context = makeContext();
    const input = makeInput({ dailyMinutes: 15, studyDays: [weekday(TODAY)], examDate: addDays(TODAY, 3) });
    const { units, scheduled, unscheduled, endDate, emptyCourseIds, days } = plan(context, input);
    expect(days).toHaveLength(1);
    expect(scheduled.reduce((sum, task) => sum + task.durationMinutes, 0)).toBeLessThanOrEqual(15);
    expect(unscheduled.length).toBeGreaterThan(0);
    const recommendations = buildRecommendations({ units, input, context, endDate, unscheduled, emptyCourseIds });
    expect(recommendations.some((rec) => rec.kind === "capacity" && rec.text.includes("didn't fit"))).toBe(true);
  });

  it("skips work that was already completed when regenerating", () => {
    const context = makeContext();
    const input = makeInput();
    const { units } = buildStudyUnits(context, input);
    const completed = new Map([
      [taskIdentity("WATCH_LECTURE", "c1", "l2"), { minutes: 45, count: 1 }],
      [taskIdentity("REVIEW_MISTAKES", "c1", "l1"), { minutes: 15, count: 1 }],
    ]);
    const drafts = generateDraftTasks(units, input, completed);
    expect(drafts.some((task) => task.type === "WATCH_LECTURE" && task.lectureId === "l2")).toBe(false);
    expect(drafts.some((task) => task.type === "REVIEW_MISTAKES" && task.lectureId === "l1")).toBe(false);
  });

  it("respects time already used by kept tasks", () => {
    const context = makeContext();
    const input = makeInput({ dailyMinutes: 60 });
    const { units } = buildStudyUnits(context, input);
    const days = planDays(TODAY, resolveEndDate(TODAY, null), ALL_DAYS);
    const usage = new Map([[TODAY, { minutes: 50, endMinute: 19 * 60 }]]);
    const { scheduled } = scheduleTasks(generateDraftTasks(units, input), {
      days,
      dailyMinutes: 60,
      startMinute: input.startMinute,
      usage,
    });
    const todays = scheduled.filter((task) => task.scheduledDate === TODAY);
    expect(todays.reduce((sum, task) => sum + task.durationMinutes, 0)).toBeLessThanOrEqual(10);
    expect(todays.every((task) => task.startMinute >= 19 * 60)).toBe(true);
    expect(validateSchedule(scheduled, { ...rulesFor(context, input, days), usage })).toEqual([]);
  });
});

describe("validation and advice", () => {
  it("rejects schedules that break the rules", () => {
    const context = makeContext();
    const input = makeInput();
    const { scheduled, days } = plan(context, input);
    const broken: ScheduledTask[] = [
      { ...scheduled[0], lectureId: "made-up-lecture" },
      { ...scheduled[0], id: "x", title: "Too long", durationMinutes: 500 },
      { ...scheduled[0], id: "y", title: "Bad day", scheduledDate: addDays(TODAY, 100) },
    ];
    const errors = validateSchedule(broken, rulesFor(context, input, days));
    expect(errors.join(" ")).toContain("unknown lecture");
    expect(errors.join(" ")).toContain("daily limit");
    expect(errors.join(" ")).toContain("not a study day");
  });

  it("lets AI reprioritise but not downgrade a reliably weak topic to LOW", () => {
    const { units } = buildStudyUnits(makeContext(), makeInput());
    applyAdvice(units, {
      summary: null,
      tips: [],
      units: [
        { key: "lecture:l1", priority: "LOW", note: null },
        { key: "lecture:l4", priority: "HIGH", note: null },
      ],
    });
    expect(units.find((unit) => unit.key === "lecture:l1")!.priority).toBe("MEDIUM");
    expect(units.find((unit) => unit.key === "lecture:l4")!.priority).toBe("HIGH");
  });

  it("builds recommendations only from real data", () => {
    const context = makeContext();
    const input = makeInput({ examDate: addDays(TODAY, 10) });
    const { units, endDate, unscheduled, emptyCourseIds } = plan(context, input);
    const recommendations = buildRecommendations({ units, input, context, endDate, unscheduled, emptyCourseIds });
    const texts = recommendations.map((rec) => rec.text).join("\n");
    expect(texts).toContain('Revise "ER Modelling" because your average quiz score there is 40% (4 attempts).');
    expect(texts).toContain('Complete "Normalization" before attempting its checkpoint quiz.');
    expect(texts).toContain("10 days away");
    expect(texts).toContain("DB Midterm Mock");
    expect(recommendations.every((rec) => rec.source === "data")).toBe(true);
  });
});
