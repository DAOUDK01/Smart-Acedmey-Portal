import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-bold uppercase tracking-[0.3em] text-accent-purple",
        className,
      )}
    >
      {children}
    </p>
  );
}
