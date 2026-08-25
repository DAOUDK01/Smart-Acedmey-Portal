import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";

export function PremiumCard({
  eyebrow,
  title,
  description,
  children,
  accent = "from-accent-purple/20 via-accent-cyan/10 to-transparent",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="glass-panel card-shine motion-fade group relative overflow-hidden rounded-[28px] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent-purple/25">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-25 transition-opacity duration-500 group-hover:opacity-45`}
      />
      <div className="relative">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}