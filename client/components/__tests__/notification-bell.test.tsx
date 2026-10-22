import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell, type BellNotification } from "../notification-bell";

const items: BellNotification[] = [
  { id: "a", title: "3 quizzes to review", description: "Pending approval", tab: "quizzes", icon: <span />, tone: "warning" },
  { id: "b", title: "New lecture", description: "Algebra 2", tab: "lectures", icon: <span />, tone: "info" },
  { id: "c", title: "Profile complete", description: "Nice work", tab: "profile", icon: <span />, tone: "success" },
];

function renderBell(props: Partial<Parameters<typeof NotificationBell>[0]> = {}) {
  const handlers = { onToggle: vi.fn(), onClose: vi.fn(), onSelect: vi.fn() };
  const view = render(
    <NotificationBell notifications={items} count={2} open={false} {...handlers} {...props} />,
  );
  return { ...handlers, ...view };
}

describe("NotificationBell", () => {
  it("shows the unread count on the badge and in the button label", () => {
    renderBell();
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Notifications, 2 new" })).toHaveAttribute("aria-expanded", "false");
  });

  it("caps the badge at 9+ and hides it when nothing needs attention", () => {
    const { rerender, onToggle, onClose, onSelect } = renderBell({ count: 14 });
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("9+");
    rerender(
      <NotificationBell notifications={[]} count={0} open={false} onToggle={onToggle} onClose={onClose} onSelect={onSelect} />,
    );
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("toggles through the caller and lists every notification when open", () => {
    const { onToggle, onSelect } = renderBell({ open: true });
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 new" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("2 new")).toBeInTheDocument();
    fireEvent.click(screen.getByText("New lecture"));
    expect(onSelect).toHaveBeenCalledWith("lectures");
  });

  it("closes on Escape and returns focus to the bell", () => {
    const { onClose } = renderBell({ open: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Notifications, 2 new" })).toHaveFocus();
  });

  it("shows an empty state instead of a blank panel", () => {
    renderBell({ open: true, notifications: [], count: 0 });
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
  });

  it("rings once each time the count goes up, but not when it goes down", () => {
    const { rerender, onToggle, onClose, onSelect } = renderBell({ count: 1 });
    const bell = () => screen.getByTestId("notification-bell-icon");
    expect(bell()).toHaveAttribute("data-rings", "0");
    const at = (count: number) =>
      rerender(
        <NotificationBell notifications={items} count={count} open={false} onToggle={onToggle} onClose={onClose} onSelect={onSelect} />,
      );
    at(3);
    expect(bell()).toHaveAttribute("data-rings", "1");
    at(2);
    expect(bell()).toHaveAttribute("data-rings", "1");
    at(4);
    expect(bell()).toHaveAttribute("data-rings", "2");
  });
});
