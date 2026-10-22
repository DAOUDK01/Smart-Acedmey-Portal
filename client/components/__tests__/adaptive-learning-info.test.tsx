import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdaptiveLearningInfo, AdaptiveLearningStatus } from "../adaptive-learning-info";
import { adaptiveLevelForScore } from "@/lib/adaptive-level";

describe("AdaptiveLearningInfo", () => {
  it("tells the teacher they choose the difficulty and the system chooses per student", () => {
    render(<AdaptiveLearningInfo />);
    expect(screen.getByText("Adaptive Learning")).toBeInTheDocument();
    expect(screen.getByText(/You choose the quiz difficulty\./)).toBeInTheDocument();
    expect(screen.getByText(/remains the base difficulty/)).toBeInTheDocument();
    expect(screen.getByText("0–50% → Easy")).toBeInTheDocument();
    expect(screen.getByText("51–75% → Medium")).toBeInTheDocument();
    expect(screen.getByText("76–100% → Hard")).toBeInTheDocument();
  });

  it("shows the ON status with an explanatory tooltip", () => {
    render(<AdaptiveLearningStatus />);
    expect(screen.getByText("Adaptive Learning: ON").closest("span")).toHaveAttribute(
      "title",
      "Students may receive a different quiz difficulty based on their performance.",
    );
  });
});

describe("adaptiveLevelForScore", () => {
  it("uses the same thresholds as the server", () => {
    expect(adaptiveLevelForScore(45)).toBe("easy");
    expect(adaptiveLevelForScore(50)).toBe("easy");
    expect(adaptiveLevelForScore(51)).toBe("medium");
    expect(adaptiveLevelForScore(68)).toBe("medium");
    expect(adaptiveLevelForScore(75)).toBe("medium");
    expect(adaptiveLevelForScore(76)).toBe("hard");
    expect(adaptiveLevelForScore(87)).toBe("hard");
  });
});
