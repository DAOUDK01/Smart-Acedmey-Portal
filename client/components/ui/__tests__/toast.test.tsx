import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/sounds", () => ({ playToastSound: vi.fn() }));

import { Toaster, toast } from "../toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toaster", () => {
  // Real timers throughout: Framer Motion's frame loop stalls if fake timers are swapped mid-animation.
  it("shows a toast with its kind styling and a countdown matching the auto-dismiss time", async () => {
    render(<Toaster />);
    act(() => toast.error("Could not save the quiz"));

    const item = screen.getByRole("status");
    expect(item).toHaveAttribute("data-kind", "error");
    expect(item).toHaveTextContent("Could not save the quiz");
    expect(screen.getByTestId("toast-countdown").style.animationDuration).toBe("3500ms");

    await waitFor(() => expect(screen.queryByText("Could not save the quiz")).not.toBeInTheDocument(), {
      timeout: 6000,
    });
  }, 10_000);
});
