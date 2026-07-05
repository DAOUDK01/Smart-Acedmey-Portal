import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";

export function PremiumCard({
  eyebrow,
  title,
  description,
  children,
  accent = "from-accent-purple/30 to-accent-cyan/20",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="surface-panel motion-fade group relative overflow-hidden rounded-[28px] p-6 transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-soft">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-35 transition-opacity group-hover:opacity-55`}
      />
      <div className="relative">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h3 className="mt-2 text-xl font-semibold text-slate-50">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-slate-300/95">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}
