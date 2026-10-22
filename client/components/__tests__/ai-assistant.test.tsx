import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import type { AssistantProfile } from "@/lib/assistant";

const sessionState = vi.hoisted(() => ({
  session: null as null | { role: "STUDENT" | "TEACHER" | "GUARDIAN" | "ADMIN"; name: string; email: string },
  token: "token" as string | null,
}));
const push = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ profile: vi.fn(), chat: vi.fn() }));

vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  loadPortalSession: () => sessionState.session,
  loadAccessToken: () => sessionState.token,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/assistant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant")>()),
  assistantApi: api,
}));

import { AIAssistant } from "../ai-assistant/ai-assistant";
import { MASCOT_SRC } from "../ai-assistant/assistant-mascot";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AssistantError } from "@/lib/assistant";

const profiles: Record<string, AssistantProfile> = {
  STUDENT: {
    assistantName: "Ace",
    name: "Sara",
    role: "STUDENT",
    portal: "Student Portal",
    aiAvailable: true,
    suggestions: ["Which topics should I revise first?", "Explain my recent quiz mistakes"],
    quickActions: [{ label: "Study planner", tab: "study-planner" }],
  },
  TEACHER: {
    assistantName: "Ace",
    name: "Omar",
    role: "TEACHER",
    portal: "Teacher Portal",
    aiAvailable: true,
    suggestions: ["Summarise my class performance", "Which students may need support?"],
    quickActions: [{ label: "Quiz review", tab: "quizzes" }],
  },
};

function signIn(role: "STUDENT" | "TEACHER" | "GUARDIAN" | "ADMIN", name = "Sara Khan") {
  sessionState.session = { role, name, email: `${role.toLowerCase()}@test.dev` };
  api.profile.mockResolvedValue(profiles[role] ?? { ...profiles.STUDENT, role, portal: `${role} Portal` });
}

async function openAssistant() {
  fireEvent.click(await screen.findByRole("button", { name: "Open Ace, your AI assistant" }));
  return screen.findByRole("dialog", { name: "Ace, AI assistant" });
}

describe("AIAssistant", () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    sessionState.token = "token";
    signIn("STUDENT");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the real mascot asset everywhere and no emoji", async () => {
    api.chat.mockResolvedValue({ reply: "Happy to help!", usedPortalData: true });
    render(<AIAssistant />);
    const launcher = await screen.findByRole("button", { name: "Open Ace, your AI assistant" });
    expect(launcher.querySelector("img")).toHaveAttribute("src", MASCOT_SRC);

    const dialog = await openAssistant();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Which topics should I revise first?" }));
    await within(dialog).findByText("Happy to help!");
    const images = [...document.querySelectorAll("img")];
    // header, welcome message and reply avatar all use the one mascot file
    expect(images.length).toBeGreaterThanOrEqual(3);
    expect(new Set(images.map((img) => img.getAttribute("src")))).toEqual(new Set([MASCOT_SRC]));
    // decorative, so screen readers aren't told about it repeatedly
    expect(images.every((img) => img.getAttribute("alt") === "")).toBe(true);
    expect(document.body.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("ships the mascot as a real transparent SVG file", () => {
    const file = readFileSync(join(__dirname, "../../public", MASCOT_SRC), "utf8");
    expect(file.startsWith("<svg")).toBe(true);
    expect(file).toContain('viewBox="0 0 200 220"');
    expect(file).toContain("prefers-reduced-motion");
    // no full-size background, text or external references
    expect(file).not.toMatch(/<rect[^>]*width="200"[^>]*height="220"/);
    expect(file).not.toMatch(/href=|url\(http/);
    expect(file).not.toMatch(/<text/);
  });

  it("renders nothing for signed-out visitors", () => {
    sessionState.session = null;
    render(<AIAssistant />);
    expect(screen.queryByRole("button", { name: /Open Ace/ })).not.toBeInTheDocument();
  });

  it("mounts only one assistant even if two layouts render it", async () => {
    render(
      <>
        <AIAssistant />
        <AIAssistant />
      </>,
    );
    await screen.findByRole("button", { name: "Open Ace, your AI assistant" });
    expect(screen.getAllByTestId("ai-assistant")).toHaveLength(1);
  });

  it("greets on the first visit only", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<AIAssistant />);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText("Hi Sara! I'm Ace.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss greeting" }));
    unmount();

    render(<AIAssistant />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Hi Sara! I'm Ace.")).not.toBeInTheDocument();
  });

  it("shows suggestions and quick actions for the signed-in role", async () => {
    const onNavigate = vi.fn();
    render(<AIAssistant onNavigate={onNavigate} />);
    const dialog = await openAssistant();
    expect(await within(dialog).findByRole("button", { name: "Which topics should I revise first?" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Summarise my class performance")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Study planner/ }));
    expect(onNavigate).toHaveBeenCalledWith("study-planner");
  });

  it("gives teachers teacher suggestions", async () => {
    signIn("TEACHER", "Omar Ali");
    render(<AIAssistant />);
    const dialog = await openAssistant();
    expect(await within(dialog).findByRole("button", { name: "Which students may need support?" })).toBeInTheDocument();
    expect(within(dialog).getByText(/help with quizzes, mock exams and lectures/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Explain my recent quiz mistakes")).not.toBeInTheDocument();
  });

  it("sends the message, history and page to the backend and shows the reply", async () => {
    let resolve!: (value: { reply: string; usedPortalData: boolean }) => void;
    api.chat.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<AIAssistant currentTab="progress" />);
    const dialog = await openAssistant();

    fireEvent.change(within(dialog).getByLabelText("Message Ace"), { target: { value: "How am I doing?" } });
    fireEvent.keyDown(within(dialog).getByLabelText("Message Ace"), { key: "Enter" });

    expect(await within(dialog).findByText("Ace is thinking…")).toBeInTheDocument();
    expect(api.chat).toHaveBeenCalledWith("How am I doing?", [], "progress");
    await act(async () => resolve({ reply: "You're doing **great**!\n- Revise joins\n<script>x</script>", usedPortalData: true }));

    expect(within(dialog).getByText("great").tagName).toBe("STRONG");
    expect(within(dialog).getByText("Revise joins").tagName).toBe("LI");
    expect(within(dialog).getByText("<script>x</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows errors with a retry that doesn't duplicate the message", async () => {
    api.chat
      .mockRejectedValueOnce(new AssistantError("I couldn't reach my AI brain just now.", "AI_FAILED"))
      .mockResolvedValueOnce({ reply: "Back online!", usedPortalData: true });
    render(<AIAssistant />);
    const dialog = await openAssistant();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Explain my recent quiz mistakes" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("I couldn't reach my AI brain just now.");
    fireEvent.click(within(dialog).getByRole("button", { name: /Try again/ }));
    expect(await within(dialog).findByText("Back online!")).toBeInTheDocument();
    expect(api.chat).toHaveBeenLastCalledWith("Explain my recent quiz mistakes", [], undefined);
    expect(within(dialog).getAllByText("Explain my recent quiz mistakes", { selector: "p" })).toHaveLength(1);
  });

  it("explains when AI isn't configured, without a retry or fake answer", async () => {
    api.profile.mockResolvedValue({ ...profiles.STUDENT, aiAvailable: false });
    render(<AIAssistant />);
    const dialog = await openAssistant();
    expect(await within(dialog).findByText(/AI replies aren't set up on this portal yet/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Message Ace")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Which topics should I revise first?" })).toBeDisabled();
  });

  it("keeps the chat when minimised, clears it when closed, and closes on Escape", async () => {
    api.chat.mockResolvedValue({ reply: "Sure thing!", usedPortalData: true });
    render(<AIAssistant />);
    let dialog = await openAssistant();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Which topics should I revise first?" }));
    await within(dialog).findByText("Sure thing!");

    fireEvent.click(within(dialog).getByRole("button", { name: /Minimize assistant/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openAssistant();
    expect(within(dialog).getByText("Sure thing!")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openAssistant();
    fireEvent.click(within(dialog).getByRole("button", { name: /Close assistant and clear/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openAssistant();
    expect(within(dialog).queryByText("Sure thing!")).not.toBeInTheDocument();
  });

  it("keeps the conversation across page navigations in the same session", async () => {
    api.chat.mockResolvedValue({ reply: "Noted!", usedPortalData: true });
    const { unmount } = render(<AIAssistant />);
    const dialog = await openAssistant();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Which topics should I revise first?" }));
    await within(dialog).findByText("Noted!");
    unmount();

    render(<AIAssistant />);
    const reopened = await openAssistant();
    expect(within(reopened).getByText("Noted!")).toBeInTheDocument();
  });
});
