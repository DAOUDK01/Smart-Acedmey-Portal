import { describe, expect, it } from "vitest";
import {
  addDays,
  breakBetween,
  endTime,
  formatMinutes,
  groupTasksByDate,
  localToday,
  startOfWeek,
  type StudyTask,
} from "../study-planner";

const base: StudyTask = {
  id: "a",
  courseId: "c1",
  subject: "Databases",
  topic: "Joins",
  title: "Revise: Joins",
  type: "REVISE",
  lectureId: null,
  mockExamId: null,
  scheduledDate: "2026-10-13",
  startTime: "18:00",
  durationMinutes: 30,
  priority: "MEDIUM",
  status: "PENDING",
  reason: null,
  skipReason: null,
  completedAt: null,
  autoCompleted: false,
  isCustom: false,
  isMissed: false,
};

describe("study planner helpers", () => {
  it("works on local calendar dates", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12");
    expect(startOfWeek("2026-10-12")).toBe("2026-10-12");
  });

  it("formats durations and end times", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(endTime("23:30", 20)).toBe("23:50");
  });

  it("groups tasks by day in time order, including empty days in a range", () => {
    const tasks = [
      { ...base, id: "late", startTime: "19:00" },
      { ...base, id: "early", startTime: "18:00", status: "COMPLETED" as const },
      { ...base, id: "skipped", status: "SKIPPED" as const, startTime: null },
      { ...base, id: "other", scheduledDate: "2026-10-20" },
    ];
    const groups = groupTasksByDate(tasks, { from: "2026-10-12", to: "2026-10-14" });
    expect(groups.map((group) => group.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    const day = groups[1];
    expect(day.tasks.map((task) => task.id)).toEqual(["early", "late", "skipped"]);
    expect(day.minutes).toBe(60);
    expect(day.completedMinutes).toBe(30);
  });

  it("measures the break between consecutive tasks", () => {
    expect(breakBetween({ ...base, startTime: "18:00", durationMinutes: 50 }, { ...base, startTime: "19:00" })).toBe(10);
    expect(breakBetween({ ...base, startTime: null }, base)).toBe(0);
  });
});
