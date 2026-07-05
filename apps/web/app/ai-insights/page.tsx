"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";

export default function AiInsightsPage() {
  const { ready } = usePortalLock("/admin");

  if (!ready) {
    return null;
  }

  return (
    <DashboardShell
      role="admin"
      title="AI Analytics & Insights"
      subtitle="A futuristic, data-driven view of learning signals and engagement patterns."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <PremiumCard
          eyebrow="Trend map"
          title="Weak topic clusters"
          description="A visual surface for recurring lecture trouble spots."
        >
          <div className="grid grid-cols-4 gap-3">
            {[
              "Recursion",
              "Stack",
              "Pointers",
              "Loops",
              "Inheritance",
              "Polymorphism",
              "SQL",
              "Normalization",
            ].map((item, index) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-[#121826] p-3 text-center"
                style={{ opacity: 0.55 + (index % 4) * 0.1 }}
              >
                <p className="text-sm text-white">{item}</p>
              </div>
            ))}
          </div>
        </PremiumCard>
        <PremiumCard
          eyebrow="Signals"
          title="AI insight stream"
          description="Observability-style cards for performance trends and anomaly-ready data later."
        >
          <div className="space-y-3 text-sm text-slate-300">
            <p>Quiz accuracy improved by 12% after lecture review sessions.</p>
            <p>Checkpoint completion spikes around evening study hours.</p>
            <p>Recursion remains the highest friction topic cluster.</p>
          </div>
        </PremiumCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <PremiumCard
          eyebrow="Engagement"
          title="Learning heatmap"
          description="Mini heatmap tiles give the page a cyber-intelligence aesthetic."
        >
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square rounded-lg bg-gradient-to-br from-violet-500/30 to-cyan-400/10"
                style={{ opacity: 0.25 + (index % 7) * 0.1 }}
              />
            ))}
          </div>
        </PremiumCard>
        <PremiumCard
          eyebrow="Performance"
          title="Lecture effectiveness"
          description="How well the current lecture is being understood across the cohort."
        >
          <div className="space-y-3">
            {["Excellent", "Good", "Needs reinforcement"].map(
              (label, index) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-sm text-slate-300"
                >
                  {label} - {100 - index * 18}% of cohort
                </div>
              ),
            )}
          </div>
        </PremiumCard>
        <PremiumCard
          eyebrow="Pulse"
          title="AI readiness"
          description="This phase stays simple now and leaves room for advanced analytics later."
        >
          <div className="rounded-[24px] border border-white/10 bg-[#121826] p-5 text-sm text-slate-300">
            <p>Current phase: rule-based intelligence.</p>
            <p className="mt-2">
              Future phase: clustering, recommendations, and anomaly detection.
            </p>
          </div>
        </PremiumCard>
      </div>
    </DashboardShell>
  );
}
