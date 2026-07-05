"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { 
  CheckCircle2, 
  XCircle, 
  Video, 
  FileText, 
  LayoutDashboard, 
  ShieldAlert,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

type Lecture = {
  id: string;
  courseId: string;
  title: string;
  transcript?: string | null;
  videoUrl?: string;
  lectureOrder: number;
  isCheckpointLocked: boolean;
  publishedAt: string | null;
};

type Course = {
  id: string;
  teacherId: string;
  title: string;
};

type User = {
  id: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN" | "EXPERT";
  name: string;
  email: string;
};

type Quiz = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  lectureId?: string;
  courseId?: string;
  status: "pending" | "approved" | "rejected" | "edited";
  reviewedBy?: string;
  reviewComment?: string;
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
  segment?: string;
  timestamp?: number;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export function ExpertConsole() {
  const { ready, session } = usePortalLock("/expert");
  const [activeTab, setActiveTab] = useState("overview");
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    void loadAll();
  }, [ready]);

  async function loadAll() {
    try {
      const [nextLectures, nextQuizzes, nextCourses, nextUsers] = await Promise.all([
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/teacher/quizzes"),
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<User[]>("/api/admin/users"),
      ]);
      setLectures(nextLectures);
      setQuizzes(nextQuizzes);
      setCourses(nextCourses);
      setUsers(nextUsers);
    } catch (e) {
      console.error("Failed to load expert data", e);
    }
  }

  async function reviewQuiz(id: string, action: "approve" | "reject") {
    setActionId(id);
    try {
      await fetch(`${API_BASE_URL}/api/teacher/quizzes/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: "Expert" }),
      });
      await loadAll();
      setStatus(`Question ${action === "approve" ? "approved" : "rejected"}.`);
    } catch (err) {
      setStatus("Review failed.");
    } finally {
      setActionId(null);
    }
  }

  async function reviewLecture(id: string, action: "approve" | "reject") {
    setActionId(id);
    try {
      await apiFetch(`/api/admin/lectures/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          publishedAt:
            action === "approve" ? new Date().toISOString() : null,
        }),
      });
      await loadAll();
      setStatus(`Lecture ${action === "approve" ? "approved" : "sent back to draft"} successfully.`);
    } catch (err) {
      setStatus("Lecture review failed.");
    } finally {
      setActionId(null);
    }
  }

  const selectedLecture = useMemo(
    () => lectures.find((lecture) => lecture.id === selectedLectureId) ?? null,
    [lectures, selectedLectureId],
  );

  const teacherConsistency = useMemo(() => {
    return users
      .filter((user) => user.role === "TEACHER")
      .map((teacher) => {
        const teacherCourses = courses.filter((course) => course.teacherId === teacher.id);
        const teacherCourseIds = teacherCourses.map((course) => course.id);
        const teacherLectures = lectures.filter((lecture) =>
          teacherCourseIds.includes(lecture.courseId),
        );
        const publishedCount = teacherLectures.filter((lecture) => lecture.publishedAt).length;
        const pendingCount = teacherLectures.length - publishedCount;
        const consistency = teacherLectures.length
          ? Math.round((publishedCount / teacherLectures.length) * 100)
          : 0;

        return {
          teacher,
          courses: teacherCourses.length,
          lectures: teacherLectures.length,
          consistency,
          pendingCount,
        };
      })
      .sort((a, b) => b.consistency - a.consistency);
  }, [users, courses, lectures]);

  if (!ready) return null;

  return (
    <DashboardShell
      role="expert"
      title="Expert Quality Audit"
      subtitle="Ensure academic excellence by reviewing lectures and AI-generated quizzes."
      activeTab={activeTab}
      onTabChange={setActiveTab}
      session={session ?? undefined}
    >
      <div className="flex flex-col gap-6">
        {status && (
          <div className="rounded-2xl border border-accent-purple/20 bg-accent-purple/10 px-4 py-3 text-sm text-accent-purple">
            {status}
          </div>
        )}

        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <PremiumCard title="Pending Review" description="Items awaiting your quality check.">
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold text-white">
                  {quizzes.filter(q => q.status === "pending").length + lectures.filter(l => !l.publishedAt).length}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <ShieldAlert size={20} />
                </div>
              </div>
            </PremiumCard>
            
            <PremiumCard title="Audit Accuracy" description="Overall platform quality score.">
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold text-white">98.4%</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 size={20} />
                </div>
              </div>
            </PremiumCard>

            <PremiumCard title="Expert Activity" description="Your reviews this week.">
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold text-white">
                  {quizzes.filter((quiz) => quiz.reviewedBy === "Expert").length}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
                  <LayoutDashboard size={20} />
                </div>
              </div>
            </PremiumCard>

            <PremiumCard title="Teacher Consistency" description="Publishing consistency across active teachers.">
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold text-white">
                  {Math.round(
                    teacherConsistency.reduce((sum, item) => sum + item.consistency, 0) /
                      (teacherConsistency.length || 1),
                  )}
                  %
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                  <CheckCircle2 size={20} />
                </div>
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "lectures" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <PremiumCard eyebrow="Quality Control" title="Lecture Reviews" description="Verify uploaded content for academic standards.">
              <div className="mt-4 space-y-3">
                {lectures.map(lecture => {
                  const course = courses.find((item) => item.id === lecture.courseId);
                  const teacher = users.find((user) => user.id === course?.teacherId);
                  return (
                  <div key={lecture.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400">
                        <Video size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{lecture.title}</p>
                        <p className="text-xs text-slate-500">
                          {course?.title || "Unknown Course"} · {teacher?.name || "Unassigned Teacher"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedLectureId(lecture.id)}
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10"
                      >
                        <span className="flex items-center gap-2">
                          <Eye size={14} />
                          Audit
                        </span>
                      </button>
                      <button
                        onClick={() => reviewLecture(lecture.id, "approve")}
                        disabled={actionId === lecture.id}
                        className="rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reviewLecture(lecture.id, "reject")}
                        disabled={actionId === lecture.id}
                        className="rounded-xl bg-rose-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )})}
                {lectures.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-600">No lectures pending review.</p>
                )}
              </div>
            </PremiumCard>

            <PremiumCard eyebrow="Audit Panel" title="Lecture Audit Detail" description="Inspect lecture transcript quality, publishing state, and course ownership.">
              {selectedLecture ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-500">Lecture</p>
                    <p className="mt-2 text-lg font-bold text-white">{selectedLecture.title}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      Course: {courses.find((course) => course.id === selectedLecture.courseId)?.title || "Unknown"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Teacher: {users.find((user) => user.id === courses.find((course) => course.id === selectedLecture.courseId)?.teacherId)?.name || "Unassigned"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Status: {selectedLecture.publishedAt ? "Published" : "Draft / Awaiting approval"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-widest text-slate-500">Transcript Audit</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {selectedLecture.transcript || "No transcript attached yet. Request transcript generation before approval."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-60 items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-500">
                  Choose a lecture to inspect its audit details.
                </div>
              )}
            </PremiumCard>
          </div>
        )}

        {activeTab === "quizzes" && (
          <div className="space-y-6">
            <PremiumCard eyebrow="Academic Audit" title="Quiz Validation" description="Audit AI-generated quiz questions and route them forward or back.">
              <div className="mt-4 space-y-4">
                {quizzes.filter(q => q.status === "pending").map(quiz => (
                  <div key={quiz.id} className="rounded-2xl border border-white/5 bg-white/5 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Pending Audit
                      </span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => reviewQuiz(quiz.id, "approve")}
                          disabled={actionId === quiz.id}
                          className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button 
                          onClick={() => reviewQuiz(quiz.id, "reject")}
                          disabled={actionId === quiz.id}
                          className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                    <p className="text-lg font-medium text-white">{quiz.question}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {quiz.options.map((opt, i) => (
                        <div key={i} className={cn(
                          "rounded-xl border border-white/5 bg-white/5 p-3 text-sm",
                          opt === quiz.correctAnswer ? "border-emerald-500/50 bg-emerald-500/5 text-white" : "text-slate-400"
                        )}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {quizzes.filter(q => q.status === "pending").length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-600">No quizzes pending review.</p>
                )}
              </div>
            </PremiumCard>

            <PremiumCard eyebrow="Consistency" title="Teacher Consistency Board" description="See which teachers are publishing steadily and which ones need support.">
              <div className="space-y-3">
                {teacherConsistency.map((item) => (
                  <div
                    key={item.teacher.id}
                    className="rounded-2xl border border-white/5 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{item.teacher.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.teacher.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">
                          Consistency
                        </p>
                        <p className="text-2xl font-bold text-cyan-300">{item.consistency}%</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white/5 p-3 text-xs text-slate-300">
                        Courses: {item.courses}
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3 text-xs text-slate-300">
                        Lectures: {item.lectures}
                      </div>
                      <div className="rounded-2xl bg-white/5 p-3 text-xs text-slate-300">
                        Pending: {item.pendingCount}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumCard>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
