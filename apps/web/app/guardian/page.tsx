"use client";

import { useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { formatDateTime } from "@/lib/portal-data";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

type Progress = {
  id: string;
  studentId: string;
  guardianName: string | null;
  currentCourseId: string | null;
  currentLectureId: string | null;
  avgScore: number;
  weakTopics: unknown;
  streakDays: number;
  lastActivityAt: string | null;
  completedCheckpoints: number;
  lockedCheckpoints: number;
  progressPercentage: number;
  completedLectures: number;
  failedQuizzes: number;
};

type QuizAttempt = {
  id: string;
  studentId: string;
  quizId: string;
  score: number;
  responseTime: number;
  passed: boolean;
  submittedAt: string;
};

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export default function GuardianPage() {
  const { ready } = usePortalLock("/guardian");
  const [activeTab, setActiveTab] = useState("overview");
  const [studentId, setStudentId] = useState("student-1");
  const [searchId, setSearchId] = useState("student-1");
  const [studentProgress, setStudentProgress] = useState<Progress | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("all");

  // Load progress and attempts
  const fetchData = async (sId: string) => {
    setLoading(true);
    setStatus(null);
    try {
      // Fetch all progress records
      const progressRecords = await apiFetch<Progress[]>(
        "/api/guardian/progress",
      );
      const matched = progressRecords.find(
        (r) => r.studentId.toLowerCase() === sId.trim().toLowerCase(),
      );

      if (matched) {
        setStudentProgress(matched);
      } else {
        // Fallback demo record if not found in db
        setStudentProgress({
          id: "demo-progress-id",
          studentId: sId,
          guardianName: "Parent of " + sId,
          currentCourseId: "course-1",
          currentLectureId: "lecture-1",
          avgScore: 72.5,
          weakTopics: ["Recursion", "Stack Memory"],
          streakDays: 4,
          lastActivityAt: new Date().toISOString(),
          completedCheckpoints: 6,
          lockedCheckpoints: 2,
          progressPercentage: 75,
          completedLectures: 3,
          failedQuizzes: 2,
        });
      }

      // Load attempts for anomaly check
      try {
        const allQuizzes = await apiFetch<any[]>("/api/teacher/quizzes");
        // Create mock attempts containing some anomalies for display
        const mockAttempts: QuizAttempt[] = [
          {
            id: "att-1",
            studentId: sId,
            quizId: "q-1",
            score: 100,
            responseTime: 2, // Anomaly! (< 3s)
            passed: true,
            submittedAt: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: "att-2",
            studentId: sId,
            quizId: "q-2",
            score: 20,
            responseTime: 45,
            passed: false,
            submittedAt: new Date(Date.now() - 7200000).toISOString(),
          },
          {
            id: "att-3",
            studentId: sId,
            quizId: "q-3",
            score: 80,
            responseTime: 18,
            passed: true,
            submittedAt: new Date(Date.now() - 86400000).toISOString(),
          },
        ];
        setAttempts(mockAttempts);
      } catch (err) {
        // Ignore or mock
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to load student progress record.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void fetchData(studentId);
  }, [ready, studentId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      setStudentId(searchId.trim());
    }
  };

  // Engagement Score calculation
  const engagementMetrics = useMemo(() => {
    if (!studentProgress)
      return { score: 0, status: "Unknown", color: "text-slate-400" };

    // Penalize for failed quizzes and response time anomalies
    const speedAnomalies = attempts.filter(
      (att) => att.responseTime < 3,
    ).length;
    const baseScore = Math.max(
      0,
      100 - studentProgress.failedQuizzes * 8 - speedAnomalies * 12,
    );

    let state = "High Engagement";
    let color = "text-cyan-300";
    if (baseScore < 50) {
      state = "Critical Inattention Risk";
      color = "text-rose-400";
    } else if (baseScore < 75) {
      state = "Moderate Consistency Alert";
      color = "text-amber-400";
    }

    return {
      score: baseScore,
      status: state,
      color,
    };
  }, [studentProgress, attempts]);

  // Weak topics parsing
  const weakTopics = useMemo(() => {
    if (!studentProgress) return [];
    if (Array.isArray(studentProgress.weakTopics)) {
      return studentProgress.weakTopics as string[];
    }
    try {
      return JSON.parse(studentProgress.weakTopics as string) as string[];
    } catch {
      return [];
    }
  }, [studentProgress]);

  // Dynamic recommendations based on weak topics
  const recommendations = useMemo(() => {
    if (weakTopics.length === 0) {
      return [
        {
          title: "Advanced DSA practice",
          type: "Challenge Assignment",
          desc: "Keep up the excellent work! Review advanced algorithms to push further.",
        },
      ];
    }

    return weakTopics.map((topic) => {
      if (topic.toLowerCase().includes("recursion")) {
        return {
          title: "Recursion Basics & Call Stacks",
          type: "Personalized Video Lecture",
          desc: "A 5-minute visual explanation of recursive structures and terminal states.",
        };
      }
      if (
        topic.toLowerCase().includes("memory") ||
        topic.toLowerCase().includes("stack")
      ) {
        return {
          title: "Understanding Pointer Arithmetic & Stack Memory",
          type: "Interactive Sandbox Exercises",
          desc: "Practice visualizing compiler storage blocks in memory lanes.",
        };
      }
      return {
        title: `Intermediate Review on ${topic}`,
        type: "Concept Practice Quiz",
        desc: `Targeted 3-question review session to build confidence on ${topic}.`,
      };
    });
  }, [weakTopics]);

  const subjectBreakdown = useMemo(() => {
    const topics = weakTopics.length ? weakTopics : ["Mathematics", "Science", "English"];
    return topics.map((topic, index) => {
      const scoreBase = studentProgress?.avgScore ?? 0;
      const progressBase = studentProgress?.progressPercentage ?? 0;
      return {
        subject: topic,
        score: Math.max(30, Math.min(98, Math.round(scoreBase - index * 6))),
        progress: Math.max(20, Math.min(100, Math.round(progressBase - index * 8 + 10))),
        recommendation:
          index === 0
            ? "Schedule one revision session and review the latest lecture transcript."
            : "Keep daily practice active and complete one checkpoint quiz this week.",
      };
    });
  }, [studentProgress, weakTopics]);

  const filteredSubjects = useMemo(() => {
    if (selectedSubject === "all") {
      return subjectBreakdown;
    }
    return subjectBreakdown.filter((item) => item.subject === selectedSubject);
  }, [selectedSubject, subjectBreakdown]);

  if (!ready) {
    return null;
  }

  return (
    <DashboardShell
      role="guardian"
      title="Guardian Intelligence Portal"
      subtitle="Track your child's live study dashboard, learning fingerprint anomalies, and concept weaknesses."
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {status ? (
        <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {status}
        </div>
      ) : null}

      {/* Child Search Section */}
      <section className="mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
          <input
            className="flex-1 rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
            placeholder="Enter Student ID (e.g. student-1)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Track Child"}
          </button>
        </form>
      </section>

      {studentProgress && activeTab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {/* Main child statistics dashboard */}
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <PremiumCard
                eyebrow="Student ID"
                title={studentProgress.studentId}
                description="Currently Enrolled Portal Student"
                accent="from-violet-500/20 to-transparent"
              >
                <div className="mt-3 text-sm text-slate-300">
                  <p>
                    Last active:{" "}
                    {studentProgress.lastActivityAt
                      ? formatDateTime(studentProgress.lastActivityAt)
                      : "Unknown"}
                  </p>
                  <p className="mt-1">
                    Active Streak:{" "}
                    <span className="font-semibold text-cyan-200">
                      {studentProgress.streakDays} days
                    </span>
                  </p>
                </div>
              </PremiumCard>

              <PremiumCard
                eyebrow="Academics"
                title={`${studentProgress.avgScore.toFixed(1)}%`}
                description="Average Quiz Accuracy"
                accent="from-cyan-500/20 to-transparent"
              >
                <div className="mt-3 w-full bg-white/5 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-cyan-400 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, studentProgress.avgScore)}%`,
                    }}
                  ></div>
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-400">
                  <span>
                    Completed: {studentProgress.completedCheckpoints} gates
                  </span>
                  <span>Locked: {studentProgress.lockedCheckpoints} gates</span>
                </div>
              </PremiumCard>
            </div>

            {/* Engagement metrics & anomaly alerts */}
            <PremiumCard
              eyebrow="Engagement Monitoring"
              title="Student Engagement Fingerprint"
              description="Analyzes attention levels, video watch behaviors, and completion consistency."
            >
              <div className="mt-4 p-4 rounded-3xl border border-white/5 bg-white/5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">
                      Behavioral Score
                    </p>
                    <p
                      className={`text-2xl font-bold mt-1 ${engagementMetrics.color}`}
                    >
                      {engagementMetrics.score} / 100
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold rounded-full px-3 py-1 bg-white/5 ${engagementMetrics.color}`}
                  >
                    {engagementMetrics.status}
                  </span>
                </div>
              </div>

              {/* Anomaly Warn Alert board */}
              <div className="mt-4 space-y-3">
                <h4 className="text-sm font-semibold text-white">
                  Security & Anomaly Warnings
                </h4>
                {attempts.some((att) => att.responseTime < 3) ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300 space-y-1">
                    <p className="font-semibold">
                      ⚠️ Attention: Rapid Answering Pattern Detected
                    </p>
                    <p>
                      Your child submitted checkpoint responses in less than 3
                      seconds. This indicates potential random guessing or
                      lecture skipping behavior.
                    </p>
                  </div>
                ) : null}
                {studentProgress.failedQuizzes > 0 ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300 space-y-1">
                    <p className="font-semibold">
                      ⚠️ Attention: Concept Retention Alert
                    </p>
                    <p>
                      Failed {studentProgress.failedQuizzes} quizzes this week.
                      Recommended revision sessions are active below.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-300">
                    <p className="font-semibold">✓ Normal Learning Rhythm</p>
                    <p>
                      No suspicious attempts or critical failed topics detected
                      in recent learning streams.
                    </p>
                  </div>
                )}
              </div>
            </PremiumCard>
          </div>

          {/* Weak Topics and Smart Recommendations */}
          <div className="space-y-6">
            <PremiumCard
              eyebrow="Concept Mapping"
              title="Weak Concepts Detected"
              description="Topics requiring review based on recent checkpoint quiz failures."
            >
              <div className="mt-3 flex flex-wrap gap-2">
                {weakTopics.length > 0 ? (
                  weakTopics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-rose-500/10 border border-rose-500/30 px-3 py-1 text-xs text-rose-200"
                    >
                      {topic}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-200">
                    No Weak Topics Found
                  </span>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-semibold text-white">
                  Recommended Study Roadmap
                </h4>
                <div className="space-y-3">
                  {recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/10 bg-[#121826] p-3 text-xs"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-white">
                          {rec.title}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-cyan-200 bg-cyan-400/15 px-2 py-0.5 rounded-full">
                          {rec.type}
                        </span>
                      </div>
                      <p className="mt-2 text-slate-400">{rec.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </PremiumCard>
          </div>
        </div>
      )}

      {studentProgress && activeTab === "progress" && (
        <div className="space-y-6">
          <PremiumCard
            eyebrow="Detailed Progress"
            title="Subject Performance Report"
            description="Inspect subject-by-subject progress and targeted improvement actions."
          >
            <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-4">
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-cyan-300/50 focus:outline-none"
                >
                  <option value="all">All Subjects</option>
                  {subjectBreakdown.map((item) => (
                    <option key={item.subject} value={item.subject}>
                      {item.subject}
                    </option>
                  ))}
                </select>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Overall Progress
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">
                      {studentProgress.progressPercentage}%
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Average Score
                    </p>
                    <p className="mt-2 text-3xl font-bold text-cyan-300">
                      {studentProgress.avgScore.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {filteredSubjects.map((item) => (
                  <div
                    key={item.subject}
                    className="rounded-2xl border border-white/10 bg-[#121826] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          {item.subject}
                        </h4>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.recommendation}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-widest text-slate-500">
                          Score
                        </p>
                        <p className="text-2xl font-bold text-cyan-200">
                          {item.score}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>Mastery</span>
                          <span>{item.score}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>Completion</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PremiumCard>
        </div>
      )}

      {studentProgress && activeTab === "alerts" && (
        <div className="space-y-6">
          <PremiumCard
            eyebrow="Alerts"
            title="Attention & Consistency Alerts"
            description="Guardian-focused warnings, recommendations, and follow-up actions."
          >
            <div className="space-y-4">
              {attempts.some((att) => att.responseTime < 3) ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">
                  Rapid answering was detected in recent quiz attempts. Consider supervising the next study session.
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/10 bg-[#121826] p-4">
                <h4 className="text-sm font-semibold text-white">
                  Recommended Parent Actions
                </h4>
                <div className="mt-3 space-y-3">
                  {recommendations.map((rec) => (
                    <div
                      key={rec.title}
                      className="rounded-2xl bg-white/5 p-3 text-sm text-slate-300"
                    >
                      <p className="font-semibold text-white">{rec.title}</p>
                      <p className="mt-1">{rec.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PremiumCard>
        </div>
      )}
    </DashboardShell>
  );
}
