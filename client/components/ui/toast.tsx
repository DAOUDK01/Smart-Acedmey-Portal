"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { playToastSound } from "@/lib/sounds";

export type ToastKind = "success" | "error" | "info" | "warning";

type ToastItem = { id: number; kind: ToastKind; message: string };

const TOAST_DURATION = 3500;

let listeners: Array<() => void> = [];
let toasts: ToastItem[] = [];
let nextId = 1;

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }];
  playToastSound(kind === "warning" ? "info" : kind);
  emit();
  window.setTimeout(() => dismiss(id), TOAST_DURATION);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  warning: (message: string) => push("warning", message),
};

function useToastStore() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    const listener = () => setItems(toasts);
    listeners.push(listener);
    setItems(toasts);
    return () => {
      listeners = listeners.filter((item) => item !== listener);
    };
  }, []);
  return items;
}

const kindIcon: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const kindTone: Record<ToastKind, string> = {
  success: "text-emerald-600",
  error: "text-rose-600",
  info: "text-sky-600",
  warning: "text-amber-600",
};

export function Toaster() {
  const items = useToastStore();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const Icon = kindIcon[item.kind];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="glass-panel-opaque pointer-events-auto flex items-start gap-3 rounded-2xl p-4"
              role="status"
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", kindTone[item.kind])} />
              <p className="flex-1 text-sm font-medium leading-snug text-slate-800">
                {item.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-m-1 rounded-lg p-1 text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}