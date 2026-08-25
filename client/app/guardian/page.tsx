"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { formatDate, formatDateTime } from "@/lib/portal-data";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import MaintenanceScreen from "@/components/maintenance-screen";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, PlayCircle, ShieldAlert } from "lucide-react";

type DashboardData = {
  guardian: { id: string; name: string; email: string };
  student: { id: string; name: string; email: string } | null;
  progress: {
    studentId: string;
    guardianName: string | null;
    currentCourseId: string | null;
    currentLectureId: string | null;
    avgScore: number;
    weakTopics: string[];
    streakDays: number;
    lastActivityAt: string | null;
    completedCheckpoints: number;
    lockedCheckpoints: number;
    progressPercentage: number;
    completedLectures: number;
    failedQuizzes: number;
  } | null;
  weakTopics: string[];
  courses: {
    id: string;
    title: string;
    code: string | null;
    description: string | null;
    avgScore: number;
    quizCount: number;
    attemptCount: number;
    passed: number;
    failed: number;
    recommendation: string;
  }[];
  lectures: {
    id: string;
    title: string;
    courseId: string;
    lectureOrder: number;
    durationMinutes: number | null;
    videoUrl: string;
    transcript: string | null;
    publishedAt: string | null;
    attempted: boolean;
    avgScore: number;
    attemptCount: number;
    failed: number;
    recommendation: string;
  }[];
  attempts: {
    id: string;
    quizId: string;
    question: string;
    topic: string | null;
    difficulty: string;
    lectureId: string | null;
    courseId: string | null;
    score: number;
    passed: boolean;
    responseTime: number;
    attemptNumber: number;
    submittedAt: string;
  }[];
};

const difficultyBadge: Record<string, string> = {
  easy: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm",
  medium: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25 backdrop-blur-sm",
  hard: "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25 backdrop-blur-sm",
};

export default function GuardianPage() {
  const { ready, session, isApproved, maintenance } = usePortalLock("/guardian");
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const loadDashboard = async () => {
    if (!session?.email) return;
    setLoading(true);
    setStatus(null);
    try {
      const result = await apiFetch<DashboardData>(
        `/api/guardian/dashboard?email=${encodeURIComponent(session.email)}`,
      );
      setData(result);
      if (!result.student) {
        setStatus(
          "No student is linked to this guardian account yet. A guardian link is created automatically when a student completes admission registration with your email.",
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to load guardian dashboard.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !isApproved) return;
    void loadDashboard();
  }, [ready, isApproved, session?.email]);

  const atRiskLectures = useMemo(
    () =>
      data?.lectures.filter(
        (lecture) => lecture.attempted && lecture.avgScore < 50,
      ) ?? [],
    [data],
  );

  const failedAttempts = useMemo(
    () => data?.attempts.filter((attempt) => !attempt.passed) ?? [],
    [data],
  );

  const rapidAttempts = useMemo(
    () => data?.attempts.filter((attempt) => attempt.responseTime < 3) ?? [],
    [data],
  );

  if (!ready) return null;

  if (maintenance?.enabled && session?.role !== "ADMIN") {
    return <MaintenanceScreen message={maintenance.message} />;
  }

  const studentName = data?.student?.name ?? "your child";
  const progress = data?.progress;

  return (
    <DashboardShell
      role="guardian"
      title="Guardian Portal"
      subtitle={`Live progress, lecture recommendations, quiz attempts and subject details for ${studentName}.`}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      session={
        session
          ? { name: session.name, email: session.email }
          : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {status ? (
          <Alert variant={data?.student ? "neutral" : "error"}>{status}</Alert>
        ) : null}

        <PendingApprovalBanner roleLabel="guardian" isApproved={isApproved} />

        {loading && !data ? (
          <div className="flex h-60 items-center justify-center rounded-2xl border-2 border-dashed border-accent-purple/10 text-slate-500">
            Loading guardian dashboard...
          </div>
        ) : null}

        {data?.student ? (
          <>
            {activeTab === "overview" ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <PremiumCard
                    eyebrow="Student"
                    title={data.student.name}
                    description={`${data.student.email} · ${
                      progress?.guardianName || "Guardian-linked"
                    }`}
                    accent="from-accent-purple/20 to-transparent"
                  >
                    <p className="mt-3 text-xs text-slate-400">
                      Last active:{" "}
                      {progress?.lastActivityAt
                        ? formatDateTime(progress.lastActivityAt)
                        : "Unknown"}
                    </p>
                  </PremiumCard>
                  <PremiumCard
                    eyebrow="Academics"
                    title={`${progress?.avgScore ?? 0}%`}
                    description="Average Quiz Accuracy"
                    accent="from-cyan-500/20 to-transparent"
                  >
                    <div className="mt-3 h-2 w-full rounded-full bg-accent-purple/[0.06]">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
                        style={{
                          width: `${Math.min(100, progress?.avgScore ?? 0)}%`,
                        }}
                      />
                    </div>
                  </PremiumCard>
                  <PremiumCard
                    eyebrow="Consistency"
                    title={`${progress?.progressPercentage ?? 0}%`}
                    description="Course Progress"
                    accent="from-emerald-500/20 to-transparent"
                  >
                    <p className="mt-3 text-xs text-slate-400">
                      {progress?.completedLectures ?? 0} lectures completed ·{" "}
                      {progress?.streakDays ?? 0}-day streak
                    </p>
                  </PremiumCard>
                  <PremiumCard
                    eyebrow="Checkpoints"
                    title={`${progress?.completedCheckpoints ?? 0} / ${
                      (progress?.completedCheckpoints ?? 0) +
                      (progress?.lockedCheckpoints ?? 0)
                    }`}
                    description="Gates Completed"
                    accent="from-rose-500/20 to-transparent"
                  >
                    <p className="mt-3 text-xs text-slate-400">
                      {progress?.lockedCheckpoints ?? 0} locked ·{" "}
                      {progress?.failedQuizzes ?? 0} failed quizzes
                    </p>
                  </PremiumCard>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <PremiumCard
                    eyebrow="Concept Mapping"
                    title="Weak Concepts Detected"
                    description="Topics flagged from recent checkpoint quiz failures."
                  >
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.weakTopics.length > 0 ? (
                        data.weakTopics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                          >
                            {topic}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                          No weak topics flagged
                        </span>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-slate-400">
                      {progress?.currentCourseId
                        ? "Recommended actions appear under Lecture Recommendations for each lecture."
                        : "Complete checkpoint quizzes to unlock detailed recommendations."}
                    </p>
                  </PremiumCard>

                  <PremiumCard
                    eyebrow="Recommendations"
                    title="Top Recommendations"
                    description="Immediate next steps based on recent performance."
                  >
                    <div className="space-y-3">
                      {atRiskLectures.slice(0, 3).map((lecture) => (
                        <div
                          key={lecture.id}
                          className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                        >
                          <p className="text-sm font-semibold text-white">
                            Revisit: {lecture.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {lecture.recommendation}
                          </p>
                        </div>
                      ))}
                      {atRiskLectures.length === 0 &&
                        data.courses
                          .filter((course) => course.avgScore > 0)
                          .sort((a, b) => a.avgScore - b.avgScore)
                          .slice(0, 3)
                          .map((course) => (
                            <div
                              key={course.id}
                              className="rounded-2xl border border-accent-purple/15 bg-ink-900 p-4"
                            >
                              <p className="text-sm font-semibold text-white">
                                {course.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {course.recommendation}
                              </p>
                            </div>
                          ))}
                      {atRiskLectures.length === 0 &&
                      data.courses.every((course) => course.avgScore === 0) ? (
                        <div className="rounded-2xl border border-dashed border-accent-purple/15 p-4 text-sm text-slate-500">
                          No recommendations yet — your child hasn't completed a
                          checkpoint quiz.
                        </div>
                      ) : null}
                    </div>
                  </PremiumCard>
                </div>

                {data.attempts.length > 0 ? (
                  <PremiumCard
                    eyebrow="Recent Activity"
                    title="Latest Quiz Attempts"
                    description="Most recent checkpoint results."
                  >
                    <div className="space-y-3">
                      {data.attempts.slice(0, 5).map((attempt) => (
                        <div
                          key={attempt.id}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4"
                        >
                          <div className="flex items-center gap-3">
                            {attempt.passed ? (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                            ) : (
                              <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {attempt.question}
                              </p>
                              <p className="text-xs text-slate-500">
                                {attempt.topic || "Checkpoint quiz"} ·{" "}
                                {formatDateTime(attempt.submittedAt)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "text-lg font-bold",
                              attempt.passed
                                ? "text-emerald-600"
                                : "text-rose-600",
                            )}
                          >
                            {attempt.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </PremiumCard>
                ) : null}
              </div>
            ) : null}

            {activeTab === "progress" ? (
              <div className="space-y-6">
                <PremiumCard
                  eyebrow="Detailed Progress"
                  title="Subject Performance Report"
                  description="Subject-by-subject scores, quiz counts and improvement actions."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Overall Progress
                      </p>
                      <p className="mt-2 text-3xl font-bold text-white">
                        {progress?.progressPercentage ?? 0}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Average Score
                      </p>
                      <p className="mt-2 text-3xl font-bold text-cyan-600">
                        {progress?.avgScore ?? 0}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {data.courses.map((course) => (
                      <div
                        key={course.id}
                        className="rounded-2xl border border-accent-purple/15 bg-ink-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-bold text-white">
                              {course.title}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {course.code || "No code"} · {course.quizCount}{" "}
                              checkpoint quiz
                              {course.quizCount === 1 ? "" : "zes"}
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                              {course.recommendation}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-widest text-slate-500">
                              Score
                            </p>
                            <p
                              className={cn(
                                "text-2xl font-bold",
                                course.avgScore < 50
                                  ? "text-rose-600"
                                  : course.avgScore < 80
                                    ? "text-amber-600"
                                    : "text-emerald-600",
                              )}
                            >
                              {course.avgScore}%
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-accent-purple/[0.06]">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              course.avgScore < 50
                                ? "bg-rose-500"
                                : course.avgScore < 80
                                  ? "bg-amber-400"
                                  : "bg-gradient-to-r from-emerald-400 to-cyan-400",
                            )}
                            style={{
                              width: `${Math.min(100, course.avgScore)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-3 flex gap-3 text-xs text-slate-400">
                          <span>
                            {course.attemptCount} attempt
                            {course.attemptCount === 1 ? "" : "s"}
                          </span>
                          <span className="text-emerald-600">
                            {course.passed} passed
                          </span>
                          <span className="text-rose-600">
                            {course.failed} failed
                          </span>
                        </div>
                      </div>
                    ))}
                    {data.courses.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-sm text-slate-500">
                        No subjects are assigned to this student yet.
                      </div>
                    ) : null}
                  </div>
                </PremiumCard>
              </div>
            ) : null}

            {activeTab === "lectures" ? (
              <div className="space-y-6">
                <PremiumCard
                  eyebrow="Recommendations"
                  title="Lecture Recommendations"
                  description="Every lecture in the enrolled courses with a tailored recommendation based on your child's results."
                >
                  <div className="space-y-3">
                    {data.lectures.map((lecture) => {
                      const course = data.courses.find(
                        (item) => item.id === lecture.courseId,
                      );
                      return (
                        <div
                          key={lecture.id}
                          className={cn(
                            "rounded-2xl border p-4",
                            lecture.attempted && lecture.avgScore < 50
                              ? "border-rose-500/20 bg-rose-500/5"
                              : lecture.attempted && lecture.failed > 0
                                ? "border-amber-500/20 bg-amber-500/5"
                                : "border-accent-purple/10 bg-accent-purple/[0.06]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <PlayCircle
                                className={cn(
                                  "mt-0.5 h-5 w-5 shrink-0",
                                  lecture.attempted && lecture.avgScore < 50
                                    ? "text-rose-600"
                                    : "text-accent-cyan",
                                )}
                              />
                              <div>
                                <h4 className="text-sm font-bold text-white">
                                  {lecture.lectureOrder}. {lecture.title}
                                </h4>
                                <p className="mt-1 text-xs text-slate-500">
                                  {course?.title || "Unknown course"} ·{" "}
                                  {lecture.durationMinutes ?? "—"} min
                                  {lecture.attempted
                                    ? ` · ${lecture.attemptCount} attempt${lecture.attemptCount === 1 ? "" : "s"} · avg ${lecture.avgScore}%`
                                    : " · not attempted yet"}
                                </p>
                              </div>
                            </div>
                            {lecture.attempted ? (
                              <span
                                className={cn(
                                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                  lecture.avgScore < 50
                                    ? "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25 backdrop-blur-sm"
                                    : lecture.avgScore < 80
                                      ? "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25 backdrop-blur-sm"
                                      : "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm",
                                )}
                              >
                                {lecture.avgScore}%
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-slate-600">
                            {lecture.recommendation}
                          </p>
                          {lecture.transcript ? (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                              {lecture.transcript}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    {data.lectures.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-sm text-slate-500">
                        No lectures have been published yet.
                      </div>
                    ) : null}
                  </div>
                </PremiumCard>
              </div>
            ) : null}

            {activeTab === "quizzes" ? (
              <div className="space-y-6">
                <PremiumCard
                  eyebrow="Attempt Log"
                  title="Every Attempted Quiz"
                  description="Complete history of checkpoint quiz attempts with results."
                >
                  <div className="space-y-3">
                    {data.attempts.map((attempt) => {
                      const course = data.courses.find(
                        (item) => item.id === attempt.courseId,
                      );
                      return (
                        <div
                          key={attempt.id}
                          className={cn(
                            "rounded-2xl border p-4",
                            attempt.passed
                              ? "border-accent-purple/10 bg-accent-purple/[0.06]"
                              : "border-rose-500/20 bg-rose-500/5",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                {attempt.question}
                              </h4>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={cn(
                                    "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                    difficultyBadge[attempt.difficulty] ??
                                      "bg-accent-purple/[0.06] text-slate-600",
                                  )}
                                >
                                  {attempt.difficulty}
                                </span>
                                <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                  {attempt.topic || "Checkpoint quiz"}
                                </span>
                                {course ? (
                                  <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-600">
                                    {course.title}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                  Attempt #{attempt.attemptNumber}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                {formatDateTime(attempt.submittedAt)}
                                {attempt.responseTime < 3
                                  ? " · answered in under 3 seconds"
                                  : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={cn(
                                  "text-2xl font-bold",
                                  attempt.passed
                                    ? "text-emerald-600"
                                    : "text-rose-600",
                                )}
                              >
                                {attempt.score}%
                              </p>
                              <p className="text-xs text-slate-500">
                                {attempt.passed ? "Passed" : "Failed"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {data.attempts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-sm text-slate-500">
                        No quiz attempts recorded yet.
                      </div>
                    ) : null}
                  </div>
                </PremiumCard>
              </div>
            ) : null}

            {activeTab === "alerts" ? (
              <div className="space-y-6">
                {atRiskLectures.length === 0 &&
                failedAttempts.length === 0 &&
                rapidAttempts.length === 0 ? (
                  <Alert variant="success" className="flex items-center gap-2">
                    <CheckCircle2 size={18} />
                    No attention or consistency alerts — your child is on a
                    healthy learning rhythm.
                  </Alert>
                ) : null}

                {atRiskLectures.length > 0 ? (
                  <PremiumCard
                    eyebrow="Risk Alert"
                    title="Lectures Below 50%"
                    description="Lectures where the average checkpoint score is under 50%."
                    accent="from-rose-500/20 to-transparent"
                  >
                    <div className="space-y-3">
                      {atRiskLectures.map((lecture) => (
                        <div
                          key={lecture.id}
                          className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                        >
                          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {lecture.title} — {lecture.avgScore}%
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {lecture.recommendation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PremiumCard>
                ) : null}

                {failedAttempts.length > 0 ? (
                  <PremiumCard
                    eyebrow="Concept Retention"
                    title="Failed Quiz Attempts"
                    description="Checkpoint quizzes that were not passed."
                    accent="from-amber-500/20 to-transparent"
                  >
                    <div className="space-y-3">
                      {failedAttempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          className="flex items-start justify-between gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {attempt.question}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {attempt.topic || "Checkpoint quiz"} ·{" "}
                              {formatDate(attempt.submittedAt)}
                            </p>
                          </div>
                          <span className="font-bold text-amber-600">
                            {attempt.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </PremiumCard>
                ) : null}

                {rapidAttempts.length > 0 ? (
                  <PremiumCard
                    eyebrow="Security & Anomaly"
                    title="Rapid Answering Detected"
                    description="Attempts submitted in under 3 seconds may indicate guessing or lecture skipping."
                    accent="from-rose-500/20 to-transparent"
                  >
                    <div className="space-y-3">
                      {rapidAttempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                        >
                          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {attempt.question}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Answered in {attempt.responseTime} seconds ·{" "}
                              {formatDateTime(attempt.submittedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PremiumCard>
                ) : null}

                {atRiskLectures.length === 0 &&
                failedAttempts.length === 0 &&
                rapidAttempts.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("progress")}
                  >
                    View Subject Progress
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
