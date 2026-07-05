import { cn } from "@/lib/utils";
import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

export function inputVariants(className?: string) {
  return cn(
    "w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500",
    "focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={inputVariants(className)} {...props} />
  ),
);

Input.displayName = "Input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={inputVariants(className)} {...props} />
  ),
);

Select.displayName = "Select";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={inputVariants(className)} {...props} />
  ),
);

Textarea.displayName = "Textarea";
