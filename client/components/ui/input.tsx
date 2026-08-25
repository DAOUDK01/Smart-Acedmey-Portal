import { cn } from "@/lib/utils";
import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

export function inputVariants(className?: string) {
  return cn(
    "w-full rounded-xl border border-accent-purple/15 bg-accent-purple/[0.05] px-4 py-3 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400",
    "shadow-sm hover:border-accent-purple/30 focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/30",
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
