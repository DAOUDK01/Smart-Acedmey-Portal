import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type AlertVariant = "info" | "warning" | "error" | "success" | "neutral";

const variantStyles: Record<AlertVariant, string> = {
  info: "border-accent-purple/20 bg-accent-purple/10 text-accent-purple",
  warning: "border-accent-warning/20 bg-accent-warning/10 text-amber-100",
  error: "border-accent-danger/30 bg-accent-danger/10 text-rose-100",
  success: "border-accent-success/20 bg-accent-success/10 text-emerald-100",
  neutral: "border-white/10 bg-white/5 text-slate-200",
};

export function alertVariants(variant: AlertVariant = "neutral", className?: string) {
  return cn("rounded-xl border px-4 py-3 text-sm", variantStyles[variant], className);
}

export function Alert({
  variant = "neutral",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return <div className={alertVariants(variant, className)}>{children}</div>;
}
