"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, BellOff, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotificationTone = "warning" | "info" | "success";

export type BellNotification = {
  id: string;
  title: string;
  description: string;
  tab: string;
  icon: ReactNode;
  tone: NotificationTone;
};

const toneChip: Record<NotificationTone, string> = {
  warning: "bg-rose-500/10 text-rose-600 ring-rose-500/25",
  info: "bg-accent-purple/10 text-accent-purple ring-accent-purple/20",
  success: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25",
};

const listVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
};

/** Bell button with an unread count and an animated dropdown. State and navigation stay with the caller. */
export function NotificationBell({
  notifications,
  count,
  open,
  onToggle,
  onClose,
  onSelect,
}: {
  notifications: BellNotification[];
  /** Items that need attention (shown on the badge). */
  count: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (tab: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousCount = useRef(count);
  // Bumped each time the count goes up; re-keying the bell replays its shake once per increase.
  const [rings, setRings] = useState(0);

  useEffect(() => {
    if (count > previousCount.current) setRings((value) => value + 1);
    previousCount.current = count;
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const badge = count > 9 ? "9+" : String(count);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors duration-200 hover:bg-accent-purple/[0.08] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/30 active:scale-95",
          open && "bg-accent-purple/[0.08] text-slate-900",
        )}
        aria-label={count > 0 ? `Notifications, ${count} new` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <motion.span
          key={rings}
          data-testid="notification-bell-icon"
          data-rings={rings}
          className="flex origin-top"
          initial={false}
          animate={rings > 0 && !reduceMotion ? { rotate: [0, -16, 13, -9, 6, -3, 0] } : { rotate: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <Bell size={20} />
        </motion.span>
        <AnimatePresence>
          {count > 0 ? (
            <motion.span
              key="badge"
              data-testid="notification-badge"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-danger px-1 text-[10px] font-bold leading-none text-[#fff] ring-2 ring-[#ffffff]"
            >
              <span className="absolute inset-0 rounded-full bg-accent-danger opacity-60 motion-safe:animate-ping [animation-iteration-count:3]" />
              <span className="relative tabular-nums">{badge}</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            role="dialog"
            aria-label="Notifications"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            // Phones: pinned to the screen edges below the header, since the bell is not at the far right.
            className="glass-panel-opaque fixed inset-x-4 top-[4.5rem] z-50 origin-top overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem] sm:origin-top-right"
          >
            <div className="flex items-center justify-between border-b border-accent-purple/15 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Notifications</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                  count > 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600",
                )}
              >
                {count > 0 ? `${count} new` : "All clear"}
              </span>
            </div>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-purple/[0.08] text-accent-purple">
                  <BellOff className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-slate-800">You&apos;re all caught up</p>
                <p className="text-xs text-slate-500">New activity will show up here.</p>
              </div>
            ) : (
              <motion.ul
                className="max-h-80 overflow-y-auto p-2"
                variants={listVariants}
                initial={reduceMotion ? false : "hidden"}
                animate="shown"
              >
                {notifications.map((item) => (
                  <motion.li key={item.id} variants={itemVariants}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.tab)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150 hover:bg-accent-purple/[0.06] focus-visible:bg-accent-purple/[0.06] focus-visible:outline-none",
                        item.tone === "warning" && "bg-rose-500/[0.05]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105",
                          toneChip[item.tone],
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {item.tone !== "success" ? (
                            <span
                              aria-hidden
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                item.tone === "warning" ? "bg-rose-500" : "bg-accent-purple",
                              )}
                            />
                          ) : null}
                          <span className="truncate text-sm font-semibold text-slate-800">{item.title}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {item.description}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500"
                      />
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
