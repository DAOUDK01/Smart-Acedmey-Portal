import { User } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const iconSizes = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export function Avatar({
  size = "md",
  className,
  title,
}: {
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full bg-accent-purple/[0.12] text-accent-purple",
        "shadow-[0_2px_8px_rgba(124,58,237,0.2)] ring-1 ring-accent-purple/20",
        sizes[size],
        className,
      )}
      title={title}
      aria-hidden="true"
    >
      <User className={iconSizes[size]} strokeWidth={2.2} />
    </div>
  );
}