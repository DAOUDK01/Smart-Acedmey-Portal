import { authenticatedFetch } from "@/lib/api";

export type AssistantProfile = {
  assistantName: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "GUARDIAN" | "ADMIN";
  portal: string;
  aiAvailable: boolean;
  suggestions: string[];
  quickActions: { label: string; tab: string }[];
};

export type AssistantMessage = { id: string; role: "user" | "assistant"; content: string };

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly code: "AI_UNCONFIGURED" | "AI_FAILED" | "RATE_LIMITED" | "NETWORK" | "UNKNOWN",
  ) {
    super(message);
  }

  /** Configuration problems won't fix themselves by retrying. */
  get retryable() {
    return this.code !== "AI_UNCONFIGURED";
  }
}

async function errorFrom(response: Response): Promise<AssistantError> {
  if (response.status === 429) {
    return new AssistantError("You're sending messages quickly — give me a few seconds and try again.", "RATE_LIMITED");
  }
  try {
    const body = (await response.json()) as { message?: string | string[]; code?: string };
    const message = Array.isArray(body.message) ? body.message.join(". ") : body.message;
    if (body.code === "AI_UNCONFIGURED" || body.code === "AI_FAILED") {
      return new AssistantError(message ?? "The assistant is unavailable.", body.code);
    }
    return new AssistantError(message ?? "Something went wrong. Please try again.", "UNKNOWN");
  } catch {
    return new AssistantError("Something went wrong. Please try again.", "UNKNOWN");
  }
}

async function call(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/assistant${path}`, init);
  } catch {
    throw new AssistantError("I can't reach the server. Check your connection and try again.", "NETWORK");
  }
  if (!response.ok) throw await errorFrom(response);
  return response.json();
}

export const assistantApi = {
  profile: () => call("/profile") as Promise<AssistantProfile>,
  chat: (message: string, history: AssistantMessage[], tab?: string) =>
    call("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: history.slice(-10).map(({ role, content }) => ({ role, content })),
        ...(tab && /^[a-z-]{1,40}$/.test(tab) ? { tab } : {}),
      }),
    }) as Promise<{ reply: string; usedPortalData: boolean }>,
};

// Per-user browser storage. Conversations live for the browser session; the greeting flag persists.
const conversationKey = (user: string) => `smart-academy:assistant:conversation:${user}`;
const greetedKey = (user: string) => `smart-academy:assistant:greeted:${user}`;

export function loadConversation(user: string): AssistantMessage[] {
  try {
    const raw = window.sessionStorage.getItem(conversationKey(user));
    const parsed = raw ? (JSON.parse(raw) as AssistantMessage[]) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.content === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

export function saveConversation(user: string, messages: AssistantMessage[]) {
  try {
    if (messages.length === 0) window.sessionStorage.removeItem(conversationKey(user));
    else window.sessionStorage.setItem(conversationKey(user), JSON.stringify(messages.slice(-50)));
  } catch {
    // storage unavailable: the conversation still works in memory
  }
}

export function hasBeenGreeted(user: string) {
  try {
    return window.localStorage.getItem(greetedKey(user)) === "1";
  } catch {
    return true; // without storage, don't risk greeting on every page
  }
}

export function markGreeted(user: string) {
  try {
    window.localStorage.setItem(greetedKey(user), "1");
  } catch {
    // ignore
  }
}
