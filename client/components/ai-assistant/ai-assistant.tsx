"use client";

import { Fragment, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Minus, RotateCcw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getDashboardPath, loadAccessToken, loadPortalSession, type PortalSession } from "@/lib/session";
import {
  AssistantError,
  assistantApi,
  hasBeenGreeted,
  loadConversation,
  markGreeted,
  saveConversation,
  type AssistantMessage,
  type AssistantProfile,
} from "@/lib/assistant";
import { AssistantMascot } from "./assistant-mascot";

const GREETING_DELAY_MS = 1500;
const GREETING_VISIBLE_MS = 9000;
const ROLE_INTRO: Record<PortalSession["role"], string> = {
  STUDENT: "I can explain tricky concepts, go over your quiz mistakes, and help you plan what to study next.",
  TEACHER: "I can help with quizzes, mock exams and lectures, and summarise how your classes are doing.",
  GUARDIAN: "I can explain your child's progress, weak subjects and reports, and suggest ways to help at home.",
  ADMIN: "I can help you find your way around admin features and explain the dashboard numbers.",
};

// Only one assistant may be active at a time, even if two layouts mount one during a navigation.
let activeInstance: string | null = null;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Minimal, safe formatting for replies: paragraphs, "-"/"•"/"1." lists and **bold** — no HTML injection. */
function FormattedReply({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>,
    );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-1">
          {list.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export function AIAssistant({
  currentTab,
  onNavigate,
}: {
  /** The portal tab being viewed, sent as a hint so answers fit the current page. */
  currentTab?: string;
  /** In-portal navigation for quick actions; defaults to the user's dashboard URL with ?tab=. */
  onNavigate?: (tab: string) => void;
}) {
  const instanceId = useId();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [isPrimary, setIsPrimary] = useState(false);
  const [session, setSession] = useState<PortalSession | null>(null);
  const [open, setOpen] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [profile, setProfile] = useState<AssistantProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean; text: string } | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const userKey = session ? `${session.role}:${session.email.toLowerCase()}` : null;

  useEffect(() => {
    if (activeInstance && activeInstance !== instanceId) return;
    activeInstance = instanceId;
    setIsPrimary(true);
    return () => {
      if (activeInstance === instanceId) activeInstance = null;
    };
  }, [instanceId]);

  // Only for signed-in users; the server checks the token on every request anyway.
  useEffect(() => {
    const current = loadPortalSession();
    setSession(current && loadAccessToken() ? current : null);
  }, []);

  useEffect(() => {
    if (!userKey) return;
    setMessages(loadConversation(userKey));
    if (hasBeenGreeted(userKey)) return;
    const show = window.setTimeout(() => setGreeting(true), GREETING_DELAY_MS);
    const hide = window.setTimeout(() => {
      setGreeting(false);
      markGreeted(userKey);
    }, GREETING_DELAY_MS + GREETING_VISIBLE_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [userKey]);

  useEffect(() => {
    if (userKey) saveConversation(userKey, messages);
  }, [messages, userKey]);

  const loadProfile = useCallback(async () => {
    setProfileError(null);
    try {
      setProfile(await assistantApi.profile());
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't load the assistant.");
    }
  }, []);

  const openPanel = () => {
    setOpen(true);
    setGreeting(false);
    if (userKey) markGreeted(userKey);
    if (!profile) void loadProfile();
  };

  const minimize = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  const closeAndClear = () => {
    setMessages([]);
    setError(null);
    setInput("");
    minimize();
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") minimize();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, minimize]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, pending, error, open]);

  const send = async (text: string, { retry = false } = {}) => {
    const content = text.trim().slice(0, 1000);
    if (!content || pending) return;
    const history = retry ? messages.slice(0, -1) : messages;
    if (!retry) setMessages((current) => [...current, { id: newId(), role: "user", content }]);
    setInput("");
    setError(null);
    setPending(true);
    try {
      const { reply } = await assistantApi.chat(content, history, currentTab);
      setMessages((current) => [...current, { id: newId(), role: "assistant", content: reply }]);
    } catch (err) {
      const assistantError =
        err instanceof AssistantError ? err : new AssistantError("Something went wrong. Please try again.", "UNKNOWN");
      setError({ message: assistantError.message, retryable: assistantError.retryable, text: content });
    } finally {
      setPending(false);
    }
  };

  const navigate = (tab: string) => {
    if (onNavigate) onNavigate(tab);
    else if (session) router.push(`${getDashboardPath(session.role)}?tab=${tab}` as never);
    if (window.matchMedia?.("(max-width: 639px)").matches) minimize();
  };

  if (!isPrimary || !session) return null;

  const firstName = session.name?.split(" ")[0] || "there";
  const assistantName = profile?.assistantName ?? "Ace";
  const offline = profile ? !profile.aiAvailable : false;
  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.97 },
      };

  return (
    <div className="ai-assistant" data-testid="ai-assistant">
      <AnimatePresence>
        {!open && greeting && (
          <motion.div
            key="greeting"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-24 right-4 z-40 flex w-[min(18rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl rounded-br-md border border-sky-200 bg-[#ffffff] p-3 pr-8 text-sm text-slate-700 shadow-soft sm:bottom-28 sm:right-6"
          >
            <button
              type="button"
              onClick={() => {
                setGreeting(false);
                if (userKey) markGreeted(userKey);
              }}
              className="absolute right-1.5 top-1.5 rounded-lg p-1 text-slate-400 hover:text-slate-700"
              aria-label="Dismiss greeting"
            >
              <X size={14} />
            </button>
            <AssistantMascot size={40} className="bg-sky-50 ring-1 ring-sky-100" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Hi {firstName}! I&apos;m Ace.</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Tap me whenever you need a hand.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={openPanel}
          aria-label="Open Ace, your AI assistant"
          aria-haspopup="dialog"
          aria-expanded={false}
          className="group fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-sky-200 bg-gradient-to-b from-[#ffffff] to-sky-50 shadow-[0_10px_30px_rgba(37,99,235,0.25)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(37,99,235,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 active:scale-95 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
        >
          <AssistantMascot size={52} greeting={greeting} className="sm:!h-[60px] sm:!w-[60px]" />
          {messages.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#ffffff] bg-sky-500" aria-hidden="true" />
          )}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-modal="false"
            aria-label={`${assistantName}, AI assistant`}
            {...panelMotion}
            transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-2 bottom-2 z-50 flex h-[min(78vh,640px)] flex-col overflow-hidden rounded-3xl border border-sky-100 bg-[#ffffff] shadow-[0_24px_60px_rgba(15,23,42,0.22)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(620px,calc(100vh-3rem))] sm:w-[390px]"
          >
            <header className="flex items-center gap-3 bg-gradient-to-br from-sky-50 via-[#ffffff] to-blue-50 px-4 py-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ffffff] shadow-sm ring-1 ring-sky-100">
                <AssistantMascot size={46} mood={pending ? "thinking" : "happy"} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">{assistantName}</h2>
                <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", offline ? "bg-amber-400" : "bg-emerald-500")} aria-hidden="true" />
                  {offline ? "AI not connected" : `Your ${profile?.portal ?? "portal"} assistant`}
                </p>
              </div>
              <button
                type="button"
                onClick={minimize}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-sky-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                aria-label="Minimize assistant (keeps the conversation)"
                title="Minimize"
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={closeAndClear}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                aria-label="Close assistant and clear the conversation"
                title="Close and clear chat"
              >
                <X size={18} />
              </button>
            </header>

            <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto px-4 py-4 motion-safe:scroll-smooth">
              <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 p-3 text-sm leading-6 text-slate-700">
                <AssistantMascot size={52} variant="full" className="-mb-1 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">Hi {firstName}! I&apos;m {assistantName}.</p>
                  <p>{ROLE_INTRO[session.role]}</p>
                </div>
              </div>

              {profileError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {profileError}{" "}
                  <button type="button" onClick={() => void loadProfile()} className="font-semibold underline">
                    Retry
                  </button>
                </div>
              )}

              {offline && (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  {session.role === "ADMIN"
                    ? "AI replies are switched off because no GROQ_API_KEY or OPENAI_API_KEY is set on the server. Quick links below still work."
                    : "AI replies aren't set up on this portal yet. Quick links below still work."}
                </p>
              )}

              {profile && profile.quickActions.length > 0 && (
                <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
                  {profile.quickActions.map((action) => (
                    <button
                      key={action.tab}
                      type="button"
                      onClick={() => navigate(action.tab)}
                      className="inline-flex items-center gap-1 rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      {action.label} <ArrowRight size={12} />
                    </button>
                  ))}
                </nav>
              )}

              {messages.map((message) => (
                <div key={message.id} className={cn("flex items-end gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.role === "assistant" && (
                    <AssistantMascot size={28} animated={false} className="mb-0.5 bg-sky-50 ring-1 ring-sky-100" />
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                      message.role === "user"
                        ? "rounded-br-md bg-gradient-to-br from-blue-600 to-sky-500 text-[#ffffff]"
                        : "rounded-tl-md bg-slate-50 text-slate-700 ring-1 ring-slate-100",
                    )}
                  >
                    <span className="sr-only">{message.role === "user" ? "You said:" : `${assistantName} said:`}</span>
                    {message.role === "assistant" ? <FormattedReply text={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="flex items-end gap-2 text-xs text-slate-500" role="status">
                  <AssistantMascot size={28} mood="thinking" className="mb-0.5 bg-sky-50 ring-1 ring-sky-100" />
                  <span className="flex gap-1 rounded-2xl rounded-tl-md bg-slate-50 px-3 py-3 ring-1 ring-slate-100" aria-hidden="true">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400"
                        style={{ animationDelay: `${dot * 150}ms` }}
                      />
                    ))}
                  </span>
                  {assistantName} is thinking…
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <p>{error.message}</p>
                  {error.retryable && (
                    <button
                      type="button"
                      onClick={() => void send(error.text, { retry: true })}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#ffffff] px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                    >
                      <RotateCcw size={12} /> Try again
                    </button>
                  )}
                </div>
              )}

              {messages.length === 0 && profile && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <AssistantMascot size={20} animated={false} className="bg-sky-50 ring-1 ring-sky-100" />
                    Try asking {assistantName}
                  </p>
                  <div className="flex flex-col gap-2">
                    {profile.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={pending || offline}
                        onClick={() => void send(suggestion)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2 border-t border-slate-100 p-3"
            >
              <label htmlFor="ai-assistant-input" className="sr-only">
                Message {assistantName}
              </label>
              <textarea
                id="ai-assistant-input"
                ref={inputRef}
                rows={1}
                maxLength={1000}
                value={input}
                disabled={offline}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={offline ? "AI replies are unavailable" : `Ask ${assistantName} anything…`}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-[#ffffff] focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!input.trim() || pending || offline}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-[#ffffff] shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </form>
            <p className="px-4 pb-2 text-center text-[10px] text-slate-400">
              {assistantName} uses your portal data and can make mistakes — double-check important details.
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
