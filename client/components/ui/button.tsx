import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "solid" | "secondary" | "ghost" | "outline" | "success" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "pill";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-gradient text-[#fff] font-bold shadow-glow hover:shadow-soft hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200",
  solid:
    "glass-chip text-white font-bold hover:bg-accent-purple/[0.14] hover:border-accent-purple/25",
  secondary:
    "glass-chip text-white hover:bg-accent-purple/[0.14] hover:border-accent-purple/25",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-accent-purple/[0.08] hover:text-accent-purple",
  outline:
    "border border-accent-purple/25 bg-transparent text-slate-800 hover:border-accent-purple/50 hover:bg-accent-purple/[0.05]",
  success:
    "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
  danger: "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider",
  md: "rounded-xl px-4 py-3 text-sm font-semibold",
  lg: "rounded-xl px-6 py-4 text-sm font-bold uppercase tracking-wider",
  pill: "rounded-full px-6 py-3 text-sm font-semibold",
};

type ButtonVariantProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonVariantProps & { className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 active:scale-[0.98]",
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && "w-full",
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, fullWidth, className })}
      {...props}
    />
  ),
);

Button.displayName = "Button";