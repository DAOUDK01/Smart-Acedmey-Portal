"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  label: string;
  /** Omit for dialogs that must not be dismissed accidentally (e.g. a timed exam). */
  onClose?: () => void;
  className?: string;
  children: ReactNode;
};

/**
 * Modal backdrop with dialog semantics: Escape and backdrop click close it,
 * page scroll is locked while open, focus moves in and returns to the trigger.
 */
export function Dialog({ label, onClose, className, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={className}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}
