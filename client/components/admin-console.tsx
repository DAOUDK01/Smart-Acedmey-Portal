"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { formatDateTime } from "@/lib/portal-data";
import { 
  Users, 
  BookOpen, 
  BarChart3, 
  Settings, 
  PlusCircle, 
  ShieldCheck, 
  LayoutDashboard,
  UserCheck,
  UserX,
  GraduationCap,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminDashboard } from "./admin/admin-dashboard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

type Role = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN" | "EXPERT";

type User = {
  id: string;
  role: Role;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type Course = {
  id: string;
  teacherId: string;
  code: string | null;
  title: string;
  description: string | null;
  level: string | null;
  isPublished: boolean;
};

type Lecture = {
  id: string;
  courseId: string;
  title: string;
};

type Quiz = {
  id: string;
  status: "pending" | "approved" | "rejected" | "edited";
};

type StudentProgress = {
  id: string;
  studentId: string;
  avgScore: number;
  progressPercentage: number;
  completedLectures: number;
  streakDays: number;
  lastActivityAt: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export function AdminConsole() {
  const { ready, session } = usePortalLock("/admin");
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chartStats, setChartStats] = useState<{
    userDistribution: { name: string; value: number; color: string }[];
    monthlySignups: { month: string; signups: number }[];
  }>({ userDistribution: [], monthlySignups: [] });

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  // New Course Form
  const [courseForm, setCourseForm] = useState({
    title: "",
    code: "",
    description: "",
    teacherId: "",
    level: "Beginner",
    isPublished: false
  });

  useEffect(() => {
    if (!ready) return;
    loadAll();
  }, [ready]);

  async function loadAll() {
    try {
      const [nextUsers, nextCourses, nextLectures, nextQuizzes, progressData, statsData] = await Promise.all([
        apiFetch<User[]>("/api/admin/users"),
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/teacher/quizzes/approved"),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
        apiFetch<{ userDistribution: { name: string; value: number; color: string }[]; monthlySignups: { month: string; signups: number }[] }>("/api/stats/admin"),
      ]);
      setUsers(nextUsers);
      setCourses(nextCourses);
      setLectures(nextLectures);
      setQuizzes(nextQuizzes);
      setStudentProgress(progressData);
      setChartStats({
        userDistribution: statsData.userDistribution,
        monthlySignups: statsData.monthlySignups,
      });
    } catch (error) {
      console.error("Failed to load admin data", error);
    }
  }

  const pendingApprovals = useMemo(
    () => users.filter((user) => user.role !== "ADMIN" && !user.isActive),
    [users],
  );

  const filteredStudents = useMemo(() => {
    const students = users.filter(u => u.role === "STUDENT");
    if (!searchQuery) return students;
    return students.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  async function updateApproval(userId: string, approved: boolean) {
    setIsProcessing(true);
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: approved }),
      });
      showStatus(approved ? "Account approved." : "Account access revoked.");
      await loadAll();
    } catch (error) {
      showStatus("Failed to update status.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!courseForm.title) return;
    setIsProcessing(true);
    try {
      await apiFetch("/api/admin/courses", {
        method: "POST",
        body: JSON.stringify({
          ...courseForm,
          sortOrder: courses.length
        }),
      });
      showStatus("Course created successfully!");
      setCourseForm({ title: "", code: "", description: "", teacherId: "", level: "Beginner", isPublished: false });
      await loadAll();
      setActiveTab("courses");
    } catch (err) {
      showStatus("Failed to create course.");
    } finally {
      setIsProcessing(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell
      role="admin"
      title="Enterprise Admin Console"
      subtitle="Manage users, courses, and system-wide platform settings."
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
          <AdminDashboard
            stats={{
              students: users.filter(u => u.role === "STUDENT").length,
              teachers: users.filter(u => u.role === "TEACHER").length,
              courses: courses.length,
              activeUsers: users.filter(u => u.isActive).length,
              pendingApprovals: pendingApprovals.length,
            }}
            userDistribution={chartStats.userDistribution}
            monthlySignups={chartStats.monthlySignups}
          />
        )}

        {activeTab === "users" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <PremiumCard eyebrow="Approvals" title="Pending Accounts" description="Review and approve all portal accounts awaiting activation.">
              <div className="mt-4 space-y-3">
                {pendingApprovals.map(user => (
                  <div key={user.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-400">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{user.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-accent-purple">{user.role}</p>
                        <p className="text-[10px] text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => updateApproval(user.id, true)}
                      disabled={isProcessing}
                      className="rounded-xl bg-accent-purple px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-accent-purple/90"
                    >
                      Approve
                    </button>
                  </div>
                ))}
                {pendingApprovals.length === 0 && (
                  <p className="py-4 text-center text-sm text-slate-600">No pending approvals.</p>
                )}
              </div>
            </PremiumCard>

            <PremiumCard eyebrow="Directory" title="Active Staff" description="Manage active teachers and experts.">
              <div className="mt-4 space-y-3">
                {users.filter(u => (u.role === "TEACHER" || u.role === "EXPERT") && u.isActive).map(user => (
                  <div key={user.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-400">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{user.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-accent-purple">{user.role}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => updateApproval(user.id, false)}
                      disabled={isProcessing}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <UserX size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "students" && (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search students by name or email..."
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white focus:border-accent-purple/50 focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <PremiumCard eyebrow="Performance" title="Student Directory" description="Platform-wide student progress and academic performance.">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map((student) => {
                  const progress = studentProgress.find(p => p.studentId === student.id);
                  return (
                    <div key={student.id} className="group rounded-3xl border border-white/5 bg-white/5 p-6 transition-all hover:bg-white/10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-accent-purple to-accent-cyan p-[1px]">
                          <div className="h-full w-full rounded-[15px] bg-ink-900 flex items-center justify-center font-bold text-white">
                            {student.name.charAt(0)}
                          </div>
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="truncate text-sm font-bold text-white">{student.name}</h4>
                          <p className="truncate text-xs text-slate-500">{student.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Avg Score</p>
                          <p className="mt-1 text-lg font-bold text-accent-cyan">{progress?.avgScore || 0}%</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Progress</p>
                          <p className="mt-1 text-lg font-bold text-accent-purple">{progress?.progressPercentage || 0}%</p>
                        </div>
                      </div>
                      <button className="w-full mt-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 group-hover:text-white transition-all">
                        Detailed Audit
                      </button>
                    </div>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    No students found matching your search.
                  </div>
                )}
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "courses" && (
          <PremiumCard eyebrow="Catalog" title="All Courses" description="Platform course catalog management.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
              {courses.map(course => (
                <div key={course.id} className="rounded-2xl border border-white/5 bg-white/5 p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
                    <BookOpen size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-white">{course.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{course.code || "No Code"}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                      course.isPublished ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                    )}>
                      {course.isPublished ? "Published" : "Draft"}
                    </span>
                    <button className="text-xs font-bold text-slate-500 hover:text-white">Edit</button>
                  </div>
                </div>
              ))}
            </div>
          </PremiumCard>
        )}

        {activeTab === "create-course" && (
          <PremiumCard eyebrow="Builder" title="Create New Course" description="Setup a new course in the system.">
            <form onSubmit={saveCourse} className="mt-4 space-y-5 max-w-2xl">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Title</label>
                  <input
                    type="text"
                    required
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                    value={courseForm.title}
                    onChange={e => setCourseForm({...courseForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Code</label>
                  <input
                    type="text"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                    value={courseForm.code}
                    onChange={e => setCourseForm({...courseForm, code: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign Teacher</label>
                <select
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  value={courseForm.teacherId}
                  onChange={e => setCourseForm({...courseForm, teacherId: e.target.value})}
                >
                  <option value="">Select a teacher...</option>
                  {users.filter(u => u.role === "TEACHER" && u.isActive).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                <textarea
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none h-32"
                  value={courseForm.description}
                  onChange={e => setCourseForm({...courseForm, description: e.target.value})}
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="rounded-xl bg-accent-purple px-8 py-3 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-accent-purple/90 disabled:opacity-50"
                >
                  Create Course
                </button>
              </div>
            </form>
          </PremiumCard>
        )}

        {activeTab === "analytics" && (
          <PremiumCard eyebrow="Analytics" title="System Performance" description="Real-time platform usage and data.">
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Lectures</p>
                <p className="mt-2 text-2xl font-bold text-white">{lectures.length}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Approved Quizzes</p>
                <p className="mt-2 text-2xl font-bold text-white">{quizzes.length}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pending Staff</p>
                <p className="mt-2 text-2xl font-bold text-amber-300">
                  {pendingApprovals.length}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tracked Students</p>
                <p className="mt-2 text-2xl font-bold text-cyan-300">{studentProgress.length}</p>
              </div>
            </div>
          </PremiumCard>
        )}

        {activeTab === "settings" && (
          <PremiumCard eyebrow="Configuration" title="Platform Settings" description="Global system configuration.">
            <div className="mt-4 space-y-6">
              <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
                <h4 className="text-sm font-bold text-white">Maintenance Mode</h4>
                <p className="text-xs text-slate-500 mt-1">Restrict platform access for scheduled updates.</p>
                <button className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 transition-all">Enable Mode</button>
              </div>
            </div>
          </PremiumCard>
        )}
      </div>
    </DashboardShell>
  );
}
