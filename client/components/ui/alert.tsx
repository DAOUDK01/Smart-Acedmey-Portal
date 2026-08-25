import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type AlertVariant = "info" | "warning" | "error" | "success" | "neutral";

const variantStyles: Record<AlertVariant, string> = {
  info: "border-sky-200 bg-sky-50/90 text-sky-800",
  warning: "border-amber-300 bg-amber-50/90 text-amber-800",
  error: "border-rose-300 bg-rose-50/90 text-rose-800",
  success: "border-emerald-300 bg-emerald-50/90 text-emerald-800",
  neutral: "border-accent-purple/20 bg-accent-purple/[0.05] text-slate-700",
};

export function alertVariants(variant: AlertVariant = "neutral", className?: string) {
  return cn(
    "rounded-xl border px-4 py-3 text-sm shadow-sm motion-fade",
    variantStyles[variant],
    className,
  );
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