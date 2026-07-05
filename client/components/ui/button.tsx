import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "solid" | "secondary" | "ghost" | "outline" | "success" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "pill";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-accent-purple to-accent-cyan text-white shadow-glow hover:opacity-90",
  solid: "bg-accent-purple text-white hover:bg-accent-purple/90",
  secondary: "border border-white/10 bg-ink-800 text-white hover:bg-white/10",
  ghost: "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white",
  outline:
    "border border-white/10 bg-transparent text-white hover:border-accent-purple/40 hover:bg-white/5",
  success:
    "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
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
    "inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/50 disabled:cursor-not-allowed disabled:opacity-50",
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
