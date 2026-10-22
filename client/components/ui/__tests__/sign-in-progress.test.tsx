import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SignInProgress } from "../sign-in-progress";

describe("SignInProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reserves its space but shows no progress bar while idle", () => {
    const { container } = render(<SignInProgress phase="idle" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The track is still laid out (invisible) so the form does not jump when sign-in starts.
    expect(container.querySelector('[data-phase="idle"]')).toHaveClass("opacity-0");
  });

  it("shows only the bar while verifying: it fills towards, but never reaches, 100%", () => {
    render(<SignInProgress phase="verifying" />);
    const bar = screen.getByRole("progressbar", { name: "Signing in" });
    expect(bar).toHaveClass("opacity-100");

    act(() => vi.advanceTimersByTime(5000));
    const value = Number(bar.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(50);
    expect(value).toBeLessThan(100);
    // Messages are for screen readers only; nothing but the bar is visible.
    const status = screen.getByRole("status");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent("Still working on it");
  });

  it("completes to 100% once the sign-in is accepted", () => {
    const { rerender } = render(<SignInProgress phase="verifying" />);
    rerender(<SignInProgress phase="success" successMessage="Signed in as Ada." />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("status")).toHaveTextContent("Signed in as Ada.");
  });

  it("resets when a sign-in fails and goes back to idle", () => {
    const { rerender } = render(<SignInProgress phase="verifying" />);
    act(() => vi.advanceTimersByTime(1000));
    rerender(<SignInProgress phase="idle" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("uses a custom accessible name, e.g. for the admission request", () => {
    render(<SignInProgress phase="verifying" label="Submitting admission request" />);
    expect(screen.getByRole("progressbar", { name: "Submitting admission request" })).toBeInTheDocument();
  });
});
