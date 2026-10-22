import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduce,
}));

import { renderHook } from "@testing-library/react";
import { ChartEmpty, ChartError, ChartFilter, ChartSkeleton, ProgressBar } from "../chart-states";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { TeacherDashboard, relativeWeekLabel } from "@/components/teacher/teacher-dashboard";
import { StudentPerformance, type PerformanceData } from "@/components/student/student-performance";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { lectureCompletion, subjectAdvice, weeklyScoreTrend } from "@/lib/student-performance";

const adminStats = { students: 1, teachers: 1, courses: 3, activeUsers: 6, pendingApprovals: 0 };
const signups = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((month, i) => ({ month, signups: i }));
const teacherStats = { totalStudents: 1, activeStudents: 1, totalCourses: 3, totalLectures: 7, avgQuizScore: 64 };

describe("weeklyScoreTrend", () => {
  const now = new Date(2026, 9, 14, 12); // Wed 14 Oct 2026
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 10).toISOString();

  it("averages real answers per week and leaves empty weeks as gaps, not zeros", () => {
    const trend = weeklyScoreTrend(
      [
        { submittedAt: at(2026, 9, 13), score: 100, passed: true, courseId: "c1" },
        { submittedAt: at(2026, 9, 12), score: 0, passed: false, courseId: "c1" },
        { submittedAt: at(2026, 8, 30), score: 100, passed: true, courseId: "c2" },
        { submittedAt: at(2025, 0, 1), score: 100, passed: true, courseId: "c1" }, // outside the window
      ],
      4,
      { now },
    );
    expect(trend.map((w) => w.start)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(trend.map((w) => w.average)).toEqual([null, 100, null, 50]);
    expect(trend[3]).toMatchObject({ answers: 2, correct: 1 });
  });

  it("narrows to one subject when a course is selected", () => {
    const history = [
      { submittedAt: at(2026, 9, 13), score: 100, passed: true, courseId: "c1" },
      { submittedAt: at(2026, 9, 13), score: 0, passed: false, courseId: "c2" },
    ];
    expect(weeklyScoreTrend(history, 1, { now, courseId: "c2" })[0]).toMatchObject({ average: 0, answers: 1 });
  });

  it("gives advice and completion only from real numbers", () => {
    expect(subjectAdvice(null)).toContain("checkpoint quizzes");
    expect(subjectAdvice(45)).toContain("Rewatch");
    expect(subjectAdvice(85)).toContain("Maintain momentum");
    expect(lectureCompletion({ lectureCount: 0, completedLectures: 0 })).toBeNull();
    expect(lectureCompletion({ lectureCount: 4, completedLectures: 1 })).toBe(25);
  });
});

describe("chart building blocks", () => {
  it("renders accessible loading, empty and error states", () => {
    const onRetry = vi.fn();
    render(
      <>
        <ChartSkeleton />
        <ChartEmpty title="No users yet" message="Nothing to show." />
        <ChartError onRetry={onRetry} />
      </>,
    );
    expect(screen.getByRole("status", { name: "Loading chart" })).toBeInTheDocument();
    expect(screen.getByText("No users yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("animates progress bars to their value and marks missing data", async () => {
    render(
      <>
        <ProgressBar value={72.4} label="Score" />
        <ProgressBar value={null} label="Empty" />
        <ProgressBar value={140} label="Capped" />
      </>,
    );
    const bar = screen.getByRole("progressbar", { name: "Score" });
    expect(bar).toHaveAttribute("aria-valuenow", "72");
    await waitFor(() => expect((bar.firstChild as HTMLElement).style.width).toBe("72.4%"));
    expect(screen.getByRole("progressbar", { name: "Empty" })).toHaveAttribute("aria-valuetext", "No data yet");
    expect(screen.getByRole("progressbar", { name: "Capped" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows the selected filter option", () => {
    const onChange = vi.fn();
    render(
      <ChartFilter
        label="Period"
        options={[
          { value: "3", label: "3 months" },
          { value: "6", label: "6 months" },
        ]}
        value="6"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "6 months" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "3 months" }));
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("turns chart animation off for reduced motion", () => {
    motion.reduce = false;
    expect(renderHook(() => useChartAnimation()).result.current.isAnimationActive).toBe(true);
    motion.reduce = true;
    expect(renderHook(() => useChartAnimation()).result.current).toMatchObject({ isAnimationActive: false });
    motion.reduce = false;
  });
});

describe("AdminDashboard", () => {
  it("shows skeletons while loading instead of placeholder zeros", () => {
    render(<AdminDashboard stats={adminStats} chartStatus="loading" />);
    expect(screen.getAllByRole("status", { name: "Loading chart" })).toHaveLength(2);
    expect(screen.queryByText("No users")).not.toBeInTheDocument();
    expect(screen.queryByText("N/A")).not.toBeInTheDocument();
  });

  it("offers a retry when the stats failed to load", () => {
    const onRetry = vi.fn();
    render(<AdminDashboard stats={adminStats} chartStatus="error" onRetry={onRetry} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Try again/ })[0]);
    expect(onRetry).toHaveBeenCalled();
  });

  it("explains empty data and filters signups to the chosen period", () => {
    render(<AdminDashboard stats={adminStats} userDistribution={[]} monthlySignups={signups} />);
    expect(screen.getByText("No users yet")).toBeInTheDocument();
    expect(screen.getByText("15 new accounts in the last 6 months.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3 months" }));
    expect(screen.getByText("12 new accounts in the last 3 months.")).toBeInTheDocument();
  });

  it("summarises the real role distribution", () => {
    render(
      <AdminDashboard
        stats={adminStats}
        userDistribution={[
          { name: "Students", value: 4, color: "#8B5CF6" },
          { name: "Teachers", value: 2, color: "#06b6d4" },
          { name: "Admins", value: 0, color: "#10b981" },
        ]}
        monthlySignups={signups}
      />,
    );
    expect(screen.getByText("6 accounts across 2 roles.")).toBeInTheDocument();
  });
});

describe("TeacherDashboard", () => {
  it("treats the API's 'No data' row as empty rather than a 0% score", () => {
    render(
      <TeacherDashboard
        stats={teacherStats}
        performanceData={[{ name: "No data", score: 0 }]}
        studentActivityData={["Sun", "Mon"].map((name) => ({ name, active: 0 }))}
      />,
    );
    expect(screen.getByText("No quiz results yet")).toBeInTheDocument();
    expect(screen.getByText("No student activity yet")).toBeInTheDocument();
  });

  it("describes the latest week and busiest day from real data", () => {
    render(
      <TeacherDashboard
        stats={teacherStats}
        performanceData={[
          { name: "Week 5", score: 55 },
          { name: "Week 6", score: 70 },
        ]}
        studentActivityData={[
          { name: "Mon", active: 1 },
          { name: "Tue", active: 3 },
        ]}
      />,
    );
    expect(screen.getByText("Average checkpoint score per week with answers — this week: 70%.")).toBeInTheDocument();
    expect(screen.getByText(/busiest on Tue/)).toBeInTheDocument();
  });
});

describe("relativeWeekLabel", () => {
  it("turns the API's relative week numbers into plain labels without touching values", () => {
    expect(relativeWeekLabel("Week 6")).toBe("This week");
    expect(relativeWeekLabel("Week 5")).toBe("1 wk ago");
    expect(relativeWeekLabel("Week -2")).toBe("8 wks ago");
    expect(relativeWeekLabel("Spring")).toBe("Spring");
  });
});

describe("StudentPerformance", () => {
  const base = {
    onRetry: vi.fn(),
    progressPercentage: 43,
    averageScore: 64,
    failedQuizzes: 2,
    streakDays: 2,
    weakTopics: [],
    recommendations: ["Keep going."],
    quizzesByCourse: { c1: 5 },
  };
  const ready: PerformanceData = {
    status: "ready",
    history: [{ submittedAt: new Date().toISOString(), score: 100, passed: true, courseId: "c1" }],
    subjects: [
      { id: "c1", title: "Web Development", lectureCount: 4, completedLectures: 1, quizAttempts: 30, averageScore: 63 },
      { id: "c2", title: "Game Development", lectureCount: 2, completedLectures: 0, quizAttempts: 0, averageScore: null },
    ],
  };

  beforeEach(() => vi.clearAllMocks());

  it("shows real subject scores and says which subjects have no results", () => {
    render(<StudentPerformance {...base} data={ready} />);
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getByText("No quiz results yet: Game Development.")).toBeInTheDocument();
    expect(screen.getByText("No score yet")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Web Development lectures finished" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("1 of 1 checkpoint answers correct.")).toBeInTheDocument();
  });

  it("focuses one subject from its card", () => {
    render(<StudentPerformance {...base} data={ready} />);
    fireEvent.click(screen.getByRole("button", { name: /Game Development/ }));
    expect(screen.getByRole("button", { name: /Game Development/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Web Development/ })).not.toBeInTheDocument();
    expect(screen.getByText("No quiz answers in this period")).toBeInTheDocument();
  });

  it("shows loading skeletons and a retryable error", () => {
    const { rerender } = render(<StudentPerformance {...base} data={{ status: "loading" }} />);
    expect(screen.getAllByRole("status", { name: "Loading chart" }).length).toBeGreaterThanOrEqual(2);
    rerender(<StudentPerformance {...base} data={{ status: "error", message: "Your results couldn't be loaded right now." }} />);
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(base.onRetry).toHaveBeenCalled();
  });
});
