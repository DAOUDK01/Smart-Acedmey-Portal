import type { ReactNode } from "react";

export function PremiumCard({
  eyebrow,
  title,
  description,
  children,
  accent = "from-violet-500/30 to-cyan-400/20",
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
        {eyebrow ? (
          <p className="text-xs uppercase tracking-[0.28em] text-sky-200/80">
            {eyebrow}
          </p>
        ) : null}
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
