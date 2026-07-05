import { PremiumCard } from "../premium-card";

export function StudentDashboard({ stats }: { stats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PremiumCard title={`${stats.progress}%`} description="Overall Progress" />
        <PremiumCard title={`${stats.completedLectures}/${stats.totalLectures}`} description="Lectures Completed" />
        <PremiumCard title={`${stats.quizAvg}%`} description="Quiz Average" />
        <PremiumCard title={`${stats.streakDays ?? 0}`} description="Study Streak" />
      </div>

      <PremiumCard
        eyebrow="Overview"
        title="Today’s Learning Focus"
        description="Your detailed charts, subject breakdown, and recommendations are available in the Performance tab."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Best Action
            </p>
            <p className="mt-2 text-sm text-white">
              Continue the next lecture and finish one checkpoint quiz today.
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Score Target
            </p>
            <p className="mt-2 text-sm text-white">
              Aim for at least 80% in the next assessment to lift your average.
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Review Path
            </p>
            <p className="mt-2 text-sm text-white">
              Open Performance for subject-level charts and tailored recommendations.
            </p>
          </div>
        </div>
      </PremiumCard>
    </div>
  );
}
