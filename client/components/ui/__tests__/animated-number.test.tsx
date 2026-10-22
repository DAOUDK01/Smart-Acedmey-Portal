import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AnimatedNumber } from "../animated-number";
import { parseCountable } from "@/lib/countable";
import { PremiumCard } from "@/components/premium-card";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseCountable", () => {
  it("accepts whole numbers and percentages only", () => {
    expect(parseCountable("12")).toEqual({ value: 12, suffix: "" });
    expect(parseCountable("85%")).toEqual({ value: 85, suffix: "%" });
    expect(parseCountable("Weekly Progress")).toBeNull();
    expect(parseCountable("4.5")).toBeNull();
    expect(parseCountable("-3")).toBeNull();
  });
});

describe("AnimatedNumber", () => {
  it("gives screen readers the final value at once and counts the visible digits up to it", async () => {
    vi.useFakeTimers();
    const { container } = render(<AnimatedNumber value={40} suffix="%" />);
    const visible = container.querySelector('[aria-hidden="true"]')!;
    expect(screen.getByText("40%", { selector: ".sr-only" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const midway = Number(visible.textContent!.replace("%", ""));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(40);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(visible).toHaveTextContent("40%");
  });

  it("jumps straight to the value when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    const { container } = render(<AnimatedNumber value={7} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("7");
  });
});

describe("PremiumCard titles", () => {
  it("counts numeric stat titles and leaves text titles alone", async () => {
    vi.useFakeTimers();
    render(
      <>
        <PremiumCard title="12" description="Total Students" />
        <PremiumCard title="Weekly Progress" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("heading", { name: "Weekly Progress" })).toBeInTheDocument();
    expect(screen.getByText("12", { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText("Total Students")).toBeInTheDocument();
  });
});
