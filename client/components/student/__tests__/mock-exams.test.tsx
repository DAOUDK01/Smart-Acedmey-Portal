import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MockExams, type MockExam } from "../mock-exams";

const exam = (overrides: Partial<MockExam> = {}): MockExam => ({
  id: "e1",
  title: "Algebra Basics",
  durationSeconds: null,
  questions: [
    { id: "q1", question: "2 + 2 = ?", options: ["3", "4"], correctAnswer: "4", difficulty: "easy" },
    { id: "q2", question: "Capital of France?", options: ["Paris", "Rome"], correctAnswer: "Paris", difficulty: "easy" },
  ],
  ...overrides,
});

function setup(examOverrides: Partial<MockExam> = {}) {
  const onSubmitExam = vi.fn().mockResolvedValue(true);
  const onSubmitAnswer = vi.fn().mockResolvedValue(null);
  const utils = render(
    <MockExams
      exams={[exam(examOverrides)]}
      answeredQuizIds={new Set()}
      onQuizAnswered={vi.fn()}
      onSubmitAnswer={onSubmitAnswer}
      onSubmitExam={onSubmitExam}
    />,
  );
  return { ...utils, onSubmitExam };
}

describe("MockExams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the chosen answers to the server instead of a score, and shows the result", async () => {
    const { onSubmitExam } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Start Exam/ }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Next Question" }));
    fireEvent.click(screen.getByRole("button", { name: "Rome" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Exam" }));

    await waitFor(() => expect(onSubmitExam).toHaveBeenCalledTimes(1));
    expect(onSubmitExam.mock.calls[0][1]).toEqual({ q1: "4", q2: "Rome" });

    // The result screen used to render blank because the finished exam was never stored.
    expect(await screen.findByText("Exam Completed")).toBeInTheDocument();
    expect(screen.getByText(/You answered 1 of 2 questions correctly \(50%\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Exams" })).toBeInTheDocument();
  });

  it("records a zero-score attempt when a timed exam is abandoned by leaving the tab", async () => {
    const { onSubmitExam } = setup({ durationSeconds: 300 });
    fireEvent.click(screen.getByRole("button", { name: /Start Exam/ }));
    fireEvent.click(screen.getByRole("button", { name: "4" })); // correct answer is now revealed

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    fireEvent(document, new Event("visibilitychange"));

    expect(await screen.findByText("Exam Terminated")).toBeInTheDocument();
    await waitFor(() => expect(onSubmitExam).toHaveBeenCalledTimes(1));
    expect(onSubmitExam.mock.calls[0][1]).toEqual({});

    // ...so it is no longer on offer to retake.
    fireEvent.click(screen.getByRole("button", { name: "Back to Exams" }));
    expect(await screen.findByText(/No mock exams available/)).toBeInTheDocument();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
});
