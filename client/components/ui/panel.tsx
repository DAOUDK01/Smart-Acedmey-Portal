import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
  glass = true,
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] p-8 text-white",
        glass
          ? "surface-panel"
          : "border border-white/10 bg-ink-900/80 shadow-soft backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
