import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PlannerContext, StudyPlan, StudyTask } from "@/lib/study-planner";

const api = vi.hoisted(() => ({
  context: vi.fn(),
  active: vi.fn(),
  create: vi.fn(),
  regenerate: vi.fn(),
  remove: vi.fn(),
  rescheduleMissed: vi.fn(),
  complete: vi.fn(),
  reopen: vi.fn(),
  skip: vi.fn(),
  reschedule: vi.fn(),
  addTask: vi.fn(),
  removeTask: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("@/lib/study-planner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/study-planner")>();
  return { ...actual, plannerApi: api };
});
vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

import { StudyPlanner } from "../study-planner/study-planner";
import { PlannerApiError } from "@/lib/study-planner";

const TODAY = "2026-10-12";

const context: PlannerContext = {
  today: TODAY,
  enrollmentSource: "admission",
  aiAvailable: false,
  courses: [
    {
      id: "c1",
      title: "Databases",
      code: "DB101",
      lectureCount: 2,
      completedLectures: 1,
      quizAttempts: 4,
      averageScore: 40,
      lectures: [
        { id: "l1", title: "ER Modelling", durationMinutes: 30, watchPercent: 100, completed: true, quizCount: 2, quizAttempts: 4, averageScore: 40 },
        { id: "l2", title: "Normalization", durationMinutes: 40, watchPercent: null, completed: false, quizCount: 1, quizAttempts: 0, averageScore: null },
      ],
      topics: [],
      upcomingMockExams: [],
    },
  ],
};

function task(overrides: Partial<StudyTask>): StudyTask {
  return {
    id: "t1",
    courseId: "c1",
    subject: "Databases",
    topic: "Normalization",
    title: "Watch: Normalization",
    type: "WATCH_LECTURE",
    lectureId: "l2",
    mockExamId: null,
    scheduledDate: TODAY,
    startTime: "18:00",
    durationMinutes: 40,
    priority: "HIGH",
    status: "PENDING",
    reason: "You haven't watched this lecture yet.",
    skipReason: null,
    completedAt: null,
    autoCompleted: false,
    isCustom: false,
    isMissed: false,
    ...overrides,
  };
}

function makePlan(overrides: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: "p1",
    title: "Databases study plan",
    status: "ACTIVE",
    courseIds: ["c1"],
    courses: [{ id: "c1", title: "Databases", code: "DB101" }],
    topics: [],
    examDate: null,
    startDate: TODAY,
    endDate: "2026-10-25",
    dailyMinutes: 60,
    studyDays: [1, 2, 3, 4, 5],
    startTime: "18:00",
    targetScore: null,
    goal: null,
    generatedBy: "RULES",
    aiSummary: null,
    recommendations: [
      { kind: "weak-topic", source: "data", text: 'Revise "ER Modelling" because your average quiz score there is 40% (4 attempts).' },
    ],
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-12T10:00:00Z",
    today: TODAY,
    tasks: [
      task({}),
      task({ id: "t2", title: "Revise: ER Modelling", type: "REVISE", lectureId: "l1", topic: "ER Modelling", startTime: "18:50", durationMinutes: 20 }),
    ],
    progress: {
      totalTasks: 2,
      completedTasks: 0,
      skippedTasks: 0,
      remainingTasks: 2,
      missedTasks: 0,
      totalMinutes: 60,
      completedMinutes: 0,
      percent: 0,
      todayTasks: 2,
      todayCompleted: 0,
      todayMinutes: 60,
    },
    suggestions: [],
    history: [{ id: "h1", action: "CREATED", summary: "Plan created with 2 tasks (rule-based).", createdAt: "2026-10-12T10:00:00Z" }],
    ...overrides,
  };
}

function renderPlanner() {
  const onOpenLecture = vi.fn(() => true);
  const onOpenMockExams = vi.fn();
  render(<StudyPlanner onOpenLecture={onOpenLecture} onOpenMockExams={onOpenMockExams} />);
  return { onOpenLecture, onOpenMockExams };
}

describe("StudyPlanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.context.mockResolvedValue(context);
    api.active.mockResolvedValue({ plan: makePlan() });
  });

  it("shows the creation form prefilled with the student's courses when there is no plan", async () => {
    api.active.mockResolvedValue({ plan: null });
    api.create.mockResolvedValue({ plan: makePlan(), generation: { aiStatus: "unavailable", unscheduledCount: 0 } });
    renderPlanner();

    expect(await screen.findByText("Build your personal study plan")).toBeInTheDocument();
    const course = screen.getByRole("checkbox", { name: /Databases/ });
    expect(course).toHaveAttribute("aria-checked", "true");
    expect(within(course).getByText(/1\/2 lectures finished · quiz average 40% \(4 attempts\)/)).toBeInTheDocument();
    expect(screen.getByText(/rule-based planner will build your plan/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Normalization/ }));
    fireEvent.click(screen.getByRole("button", { name: "Saturday" }));
    fireEvent.click(screen.getByRole("button", { name: /Generate my plan/ }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const [values, replace] = api.create.mock.calls[0];
    expect(replace).toBe(false);
    expect(values).toMatchObject({
      courseIds: ["c1"],
      topics: [{ courseId: "c1", name: "Normalization", confidence: null }],
      dailyMinutes: 60,
      startTime: "18:00",
    });
    expect(values.studyDays).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6]));
    expect(await screen.findByText("Databases study plan")).toBeInTheDocument();
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("rule-based planner"));
  });

  it("asks before replacing an existing active plan", async () => {
    api.active.mockResolvedValue({ plan: null });
    api.create
      .mockRejectedValueOnce(new PlannerApiError("You already have an active plan.", 409, "ACTIVE_PLAN_EXISTS"))
      .mockResolvedValueOnce({ plan: makePlan(), generation: { aiStatus: "used", unscheduledCount: 0 } });
    renderPlanner();

    fireEvent.click(await screen.findByRole("button", { name: /Generate my plan/ }));
    const dialog = await screen.findByRole("dialog", { name: "Replace your current plan?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace plan" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(api.create.mock.calls[1][1]).toBe(true);
  });

  it("shows an empty state when the student has no courses", async () => {
    api.context.mockResolvedValue({ ...context, courses: [] });
    api.active.mockResolvedValue({ plan: null });
    renderPlanner();
    expect(await screen.findByText("No courses to plan yet")).toBeInTheDocument();
  });

  it("shows an error with a retry when loading fails", async () => {
    api.context.mockRejectedValueOnce(new Error("Server unavailable"));
    renderPlanner();
    expect(await screen.findByText(/Couldn't load your study planner\. Server unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Databases study plan")).toBeInTheDocument();
  });

  it("shows the overview and today's tasks, and refreshes progress after completing one", async () => {
    const completed = makePlan({
      tasks: [task({ status: "COMPLETED" }), makePlan().tasks[1]],
      progress: { ...makePlan().progress, completedTasks: 1, remainingTasks: 1, completedMinutes: 40, percent: 67, todayCompleted: 1 },
    });
    api.complete.mockResolvedValue(completed);
    renderPlanner();

    expect(await screen.findByText("Databases study plan")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(screen.getByText("10 min break")).toBeInTheDocument();
    expect(screen.getByText(/average quiz score there is 40%/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: 'Mark "Watch: Normalization" as complete' }));
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith("p1", "t1"));
    expect(await screen.findByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Plan progress" })).toHaveAttribute("aria-valuenow", "67");
  });

  it("skips a task with an optional reason", async () => {
    api.skip.mockResolvedValue(makePlan());
    renderPlanner();
    fireEvent.click(await screen.findByRole("button", { name: 'Skip "Watch: Normalization"' }));
    const dialog = await screen.findByRole("dialog", { name: "Skip task" });
    fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), { target: { value: "Covered in class" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Skip task" }));
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith("p1", "t1", "Covered in class"));
  });

  it("reschedules a task to a new date", async () => {
    api.reschedule.mockResolvedValue(makePlan());
    renderPlanner();
    fireEvent.click(await screen.findByRole("button", { name: 'Reschedule "Watch: Normalization"' }));
    const dialog = await screen.findByRole("dialog", { name: "Reschedule task" });
    fireEvent.change(within(dialog).getByLabelText("New date"), { target: { value: "2026-10-14" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save new time" }));
    await waitFor(() => expect(api.reschedule).toHaveBeenCalledWith("p1", "t1", "2026-10-14", undefined));
  });

  it("confirms before removing a task", async () => {
    api.removeTask.mockResolvedValue(makePlan({ tasks: [makePlan().tasks[1]] }));
    renderPlanner();
    fireEvent.click(await screen.findByRole("button", { name: 'Remove "Watch: Normalization"' }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this task?" });
    expect(api.removeTask).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove task" }));
    await waitFor(() => expect(api.removeTask).toHaveBeenCalledWith("p1", "t1"));
  });

  it("requires confirmation before regenerating the plan", async () => {
    api.regenerate.mockResolvedValue({ plan: makePlan(), generation: { aiStatus: "failed", unscheduledCount: 0 } });
    renderPlanner();
    fireEvent.click(await screen.findByRole("button", { name: /Adjust & regenerate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate plan" }));

    const dialog = await screen.findByRole("dialog", { name: "Regenerate your plan?" });
    expect(within(dialog).getByText(/Completed and skipped tasks stay in your history/)).toBeInTheDocument();
    expect(api.regenerate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(api.regenerate).toHaveBeenCalledTimes(1));
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("didn't respond"));
  });

  it("offers to move missed tasks without changing anything automatically", async () => {
    api.active.mockResolvedValue({
      plan: makePlan({ suggestions: [{ type: "MISSED_TASKS", count: 2, message: "You have 2 unfinished tasks from previous days." }] }),
    });
    api.rescheduleMissed.mockResolvedValue({ plan: makePlan(), moved: 2, unplaced: 0 });
    renderPlanner();
    expect(await screen.findByText("You have 2 unfinished tasks from previous days.")).toBeInTheDocument();
    expect(api.rescheduleMissed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Move missed tasks" }));
    await waitFor(() => expect(api.rescheduleMissed).toHaveBeenCalledWith("p1"));
  });

  it("opens the related lecture and switches to the weekly view", async () => {
    const { onOpenLecture } = renderPlanner();
    fireEvent.click((await screen.findAllByRole("button", { name: "Open lecture" }))[0]);
    expect(onOpenLecture).toHaveBeenCalledWith("l2");

    fireEvent.click(screen.getByRole("tab", { name: "Weekly" }));
    expect(screen.getByText("12 Oct – 18 Oct")).toBeInTheDocument();
    expect(screen.getAllByText(/Rest day/)).toHaveLength(2);
  });
});
