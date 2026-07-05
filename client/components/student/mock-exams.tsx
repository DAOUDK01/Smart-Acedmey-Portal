import { PremiumCard } from "../premium-card";

export function MockExams() {
  return (
    <PremiumCard eyebrow="Exam Center" title="Mock Exams" description="Prepare for your final certifications.">
      <div className="py-8 text-center text-slate-500">
        No mock exams scheduled at this time.
      </div>
    </PremiumCard>
  );
}
