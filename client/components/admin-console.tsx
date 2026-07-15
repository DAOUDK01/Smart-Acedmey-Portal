"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { usePortalLock } from "@/lib/use-portal-lock";
import { formatDateTime } from "@/lib/portal-data";
import { 
  BookOpen, 
  UserX,
  Search,
  Clock,
  Eye,
  FileText,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminDashboard } from "./admin/admin-dashboard";
import { ClassesManagement } from "./admin/classes-management";
import { AdmissionsManagement } from "./admin/admissions-management";
import { apiFetch } from "@/lib/api";

type Role = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

type User = {
  id: string;
  role: Role;
  name: string;
  email: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type Course = {
  id: string;
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

type StaffInvitation = {
  id: string;
  email: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  name: string;
  role: "TEACHER";
  status: "INVITED" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  educationDetails: string | null;
  personalDetails: string | null;
  documentLinks: string[] | null;
  adminNotes: string | null;
  createdAt: string;
  submittedAt: string | null;
};

type StaffInvitationResponse = StaffInvitation & {
  registrationLink: string;
  emailSent: boolean;
  emailError?: string;
};

type StaffCourseAssignment = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseCode: string | null;
  className: string;
  classCode: string;
  sectionName: string;
  isActive: boolean;
};

function parseSubmittedDetails(details?: string | null) {
  if (!details) return [];

  return details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) return { label: "Detail", value: line };

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim() || "Not provided",
      };
    });
}

function formatDocumentLabel(label: string) {
  return label
    .replace(/([A-Z])/g, " $1")
    .replace(/^\w/, (char) => char.toUpperCase())
    .trim();
}

export function AdminConsole() {
  const { ready, session } = usePortalLock("/admin");
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
  const [staffInvitations, setStaffInvitations] = useState<StaffInvitation[]>([]);
  const [selectedStaffInvitation, setSelectedStaffInvitation] = useState<StaffInvitation | null>(null);
  const [selectedStaffUser, setSelectedStaffUser] = useState<User | null>(null);
  const [staffCourseAssignments, setStaffCourseAssignments] = useState<StaffCourseAssignment[]>([]);
  const [staffCoursesLoading, setStaffCoursesLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chartStats, setChartStats] = useState<{
    userDistribution: { name: string; value: number; color: string }[];
    monthlySignups: { month: string; signups: number }[];
  }>({ userDistribution: [], monthlySignups: [] });
  const isStaffViewTab = activeTab === "users" || activeTab === "staff-view";
  const isStaffApprovalsTab = activeTab === "staff-approvals";
  const isStudentTab = activeTab === "students" || activeTab === "student-view" || activeTab === "student-performance";

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  // New Course Form
  const [courseForm, setCourseForm] = useState({
    title: "",
    code: "",
    description: "",
    level: "Beginner",
    isPublished: false
  });
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
  });
  const [studentForm, setStudentForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (!ready) return;
    loadAll();
  }, [ready]);

  useEffect(() => {
    const selectedEmail = selectedStaffUser?.email ?? selectedStaffInvitation?.email;
    if (!selectedEmail) {
      setStaffCourseAssignments([]);
      return;
    }
    const staffUser = users.find((user) => user.email.toLowerCase() === selectedEmail.toLowerCase());
    if (!staffUser) {
      setStaffCourseAssignments([]);
      return;
    }
    let active = true;
    setStaffCoursesLoading(true);
    apiFetch<StaffCourseAssignment[]>(`/api/admin/users/${staffUser.id}/assigned-courses`)
      .then((assignments) => { if (active) setStaffCourseAssignments(assignments); })
      .catch(() => { if (active) setStaffCourseAssignments([]); })
      .finally(() => { if (active) setStaffCoursesLoading(false); });
    return () => { active = false; };
  }, [selectedStaffUser, selectedStaffInvitation, users]);

  async function loadAll() {
    try {
      const [nextUsers, nextCourses, nextLectures, nextQuizzes, progressData, statsData, nextInvitations] = await Promise.all([
        apiFetch<User[]>("/api/admin/users"),
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/teacher/quizzes/approved"),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
        apiFetch<{ userDistribution: { name: string; value: number; color: string }[]; monthlySignups: { month: string; signups: number }[] }>("/api/stats/admin"),
        apiFetch<StaffInvitation[]>("/api/admin/users/staff-invitations"),
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
      setStaffInvitations(nextInvitations);
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

  const activeStaff = useMemo(
    () => users.filter((user) => user.role === "TEACHER" && user.isActive),
    [users],
  );

  const inactiveStaff = useMemo(
    () => users.filter((user) => user.role === "TEACHER" && !user.isActive),
    [users],
  );

  const submittedStaffInvitations = useMemo(
    () => staffInvitations.filter((invitation) => invitation.status === "SUBMITTED"),
    [staffInvitations],
  );

  function viewStaffDetails(user: User) {
    const application = staffInvitations.find(
      (invitation) => invitation.email.toLowerCase() === user.email.toLowerCase(),
    );
    if (application) {
      setSelectedStaffInvitation(application);
      return;
    }
    setSelectedStaffUser(user);
  }

  const pendingStaffInvitations = useMemo(
    () => staffInvitations.filter((invitation) => invitation.status === "INVITED" || invitation.status === "REVISION_REQUESTED"),
    [staffInvitations],
  );

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
      setCourseForm({ title: "", code: "", description: "", level: "Beginner", isPublished: false });
      await loadAll();
      setActiveTab("courses");
    } catch (err) {
      let message = "Failed to create course.";
      if (err instanceof Error) {
        try {
          const responseBody = JSON.parse(err.message) as { message?: string | string[] };
          if (Array.isArray(responseBody.message)) message = responseBody.message.join(", ");
          else if (responseBody.message) message = responseBody.message;
        } catch {
          if (err.message) message = err.message;
        }
      }
      showStatus(message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function updateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCourse?.title.trim()) return;
    setIsProcessing(true);
    try {
      await apiFetch(`/api/admin/courses/${editingCourse.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingCourse.title.trim(),
          code: editingCourse.code?.trim() || null,
          description: editingCourse.description?.trim() || null,
          level: editingCourse.level?.trim() || null,
          isPublished: editingCourse.isPublished,
        }),
      });
      setEditingCourse(null);
      showStatus("Course updated successfully.");
      await loadAll();
    } catch (error) {
      let message = "Failed to update course.";
      if (error instanceof Error) {
        try {
          const responseBody = JSON.parse(error.message) as { message?: string | string[] };
          if (Array.isArray(responseBody.message)) message = responseBody.message.join(", ");
          else if (responseBody.message) message = responseBody.message;
        } catch {
          if (error.message) message = error.message;
        }
      }
      showStatus(message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function saveStaff(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const result = await apiFetch<StaffInvitationResponse>("/api/admin/users/staff-invitations", {
        method: "POST",
        body: JSON.stringify({ ...staffForm, role: "TEACHER" }),
      });
      showStatus(
        result.emailSent
          ? "Staff invitation email sent."
          : `Email failed${result.emailError ? `: ${result.emailError}` : ""}. Share this link manually: ${result.registrationLink}`,
      );
      setStaffForm({ name: "", email: "" });
      await loadAll();
      setActiveTab("staff-view");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Failed to send staff invitation.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function resendStaffInvitation(invitation: StaffInvitation) {
    setIsProcessing(true);
    try {
      const result = await apiFetch<StaffInvitationResponse>(
        "/api/admin/users/staff-invitations",
        {
          method: "POST",
          body: JSON.stringify({
            name: invitation.name,
            email: invitation.email,
            role: "TEACHER",
          }),
        },
      );

      showStatus(
        result.emailSent
          ? `Invitation email resent to ${invitation.email}.`
          : `Email failed${result.emailError ? `: ${result.emailError}` : ""}. New registration link: ${result.registrationLink}`,
      );
      await loadAll();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Failed to resend staff invitation.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function reviewStaffInvitation(invitationId: string, nextStatus: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") {
    const adminNotes = nextStatus === "APPROVED" ? "" : window.prompt("Add notes for the staff email:") || "";
    setIsProcessing(true);
    try {
      await apiFetch(`/api/admin/users/staff-invitations/${invitationId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, adminNotes }),
      });
      showStatus("Staff review updated and email sent.");
      setSelectedStaffInvitation(null);
      await loadAll();
    } catch (error) {
      showStatus("Failed to update staff review.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function deletePendingStaffInvitation(invitation: StaffInvitation) {
    const confirmed = window.confirm(
      `Delete the pending invitation for ${invitation.name} (${invitation.email})?`,
    );
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await apiFetch(`/api/admin/users/staff-invitations/${invitation.id}`, {
        method: "DELETE",
      });
      if (selectedStaffInvitation?.id === invitation.id) {
        setSelectedStaffInvitation(null);
      }
      showStatus("Pending staff invitation deleted.");
      await loadAll();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Failed to delete staff invitation.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function saveStudent(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ ...studentForm, role: "STUDENT" }),
      });
      showStatus("Student login created successfully.");
      setStudentForm({ name: "", email: "", password: "" });
      await loadAll();
      setActiveTab("student-view");
    } catch (error) {
      showStatus("Failed to create student login.");
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
          <Alert variant="info">{status}</Alert>
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

        {activeTab === "staff-add" && (
          <PremiumCard eyebrow="Staff" title="Add Staff" description="Send a registration link to a teacher.">
            <form onSubmit={saveStaff} className="mt-4 max-w-2xl space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</label>
                  <Input
                    type="text"
                    required
                    className="mt-2"
                    value={staffForm.name}
                    onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
                  <Input
                    type="email"
                    required
                    className="mt-2"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" variant="solid" size="md" disabled={isProcessing}>
                Send Registration Link
              </Button>
            </form>
          </PremiumCard>
        )}

        {isStaffViewTab && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Active Teachers</p>
                <p className="mt-2 text-3xl font-bold text-white">{activeStaff.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Invited</p>
                <p className="mt-2 text-3xl font-bold text-accent-cyan">{pendingStaffInvitations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Under Review</p>
                <p className="mt-2 text-3xl font-bold text-amber-300">{submittedStaffInvitations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Disabled</p>
                <p className="mt-2 text-3xl font-bold text-rose-300">{inactiveStaff.length}</p>
              </div>
            </div>

            <PremiumCard eyebrow="Directory" title="View Staff" description="Active teacher accounts and invitation progress.">
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {activeStaff.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-white/10 bg-ink-900/70 p-5 transition hover:border-accent-cyan/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple to-accent-cyan p-[1px]">
                          <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-ink-950 text-sm font-bold text-white">
                            {user.name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{user.name}</h3>
                          <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        Active
                      </span>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <p className="text-xs text-slate-500">Joined {formatDateTime(user.createdAt)}</p>
                      <div className="flex gap-2">
                        <button onClick={() => viewStaffDetails(user)} className="inline-flex items-center gap-2 rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 px-3 py-2 text-xs font-semibold text-accent-cyan transition hover:bg-accent-cyan/20"><Eye size={14} />View Details</button>
                        <button
                          onClick={() => updateApproval(user.id, false)}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                        >
                          <UserX size={14} />
                          Disable
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {staffInvitations.filter((invitation) => invitation.status !== "APPROVED").map((invitation) => (
                  <div key={invitation.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">{invitation.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{invitation.email}</p>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                        {invitation.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Mail size={14} />Awaiting teacher registration</div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={() => setSelectedStaffInvitation(invitation)} className="inline-flex items-center gap-2 rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 px-3 py-2 text-xs font-semibold text-accent-cyan transition hover:bg-accent-cyan/20"><Eye size={14} />View Details</button>
                        {invitation.status === "INVITED" && (
                          <button
                            type="button"
                            onClick={() => resendStaffInvitation(invitation)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Mail size={14} />
                            Resend
                          </button>
                        )}
                        {(invitation.status === "INVITED" || invitation.status === "REVISION_REQUESTED") && (
                          <button
                            type="button"
                            onClick={() => deletePendingStaffInvitation(invitation)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {activeStaff.length === 0 && staffInvitations.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center">
                    <p className="text-sm font-semibold text-white">No staff records yet.</p>
                    <p className="mt-2 text-sm text-slate-500">Use Add Staff to send your first teacher registration link.</p>
                  </div>
                )}
              </div>
            </PremiumCard>
          </div>
        )}

        {isStaffApprovalsTab && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-300" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Submitted</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-white">{submittedStaffInvitations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-accent-cyan" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Needs Action</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-white">
                  {staffInvitations.filter((invitation) => invitation.status === "REVISION_REQUESTED").length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Approved</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-white">
                  {staffInvitations.filter((invitation) => invitation.status === "APPROVED").length}
                </p>
              </div>
            </div>

            <PremiumCard eyebrow="Review Queue" title="Staff Approvals" description="Review submitted profiles, documents, and admin decisions.">
              <div className="mt-5 space-y-4">
                {staffInvitations.map((invitation) => (
                  <div key={invitation.id} className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-base font-bold text-white">{invitation.name}</h3>
                          <span className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                            invitation.status === "APPROVED" && "bg-emerald-500/10 text-emerald-300",
                            invitation.status === "SUBMITTED" && "bg-amber-500/10 text-amber-300",
                            invitation.status === "INVITED" && "bg-accent-cyan/10 text-accent-cyan",
                            invitation.status === "REVISION_REQUESTED" && "bg-purple-500/10 text-purple-300",
                            invitation.status === "REJECTED" && "bg-rose-500/10 text-rose-300",
                          )}>
                            {invitation.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{invitation.email}</p>
                      </div>

                      {invitation.status === "SUBMITTED" && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="success" disabled={isProcessing} onClick={() => reviewStaffInvitation(invitation.id, "APPROVED")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" disabled={isProcessing} onClick={() => reviewStaffInvitation(invitation.id, "REVISION_REQUESTED")}>
                            Request Revision
                          </Button>
                          <Button size="sm" variant="danger" disabled={isProcessing} onClick={() => reviewStaffInvitation(invitation.id, "REJECTED")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
                        <span>{invitation.educationDetails ? "Education submitted" : "Education pending"}</span>
                        <span>{invitation.personalDetails ? "Personal details submitted" : "Personal details pending"}</span>
                        <span>{invitation.documentLinks?.length || 0} document(s)</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2"
                        onClick={() => setSelectedStaffInvitation(invitation)}
                      >
                        <Eye size={14} />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}

                {staffInvitations.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                    <p className="text-sm font-semibold text-white">No staff applications yet.</p>
                    <p className="mt-2 text-sm text-slate-500">Submitted teacher registrations will appear here for review.</p>
                  </div>
                )}
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "student-add" && (
          <PremiumCard eyebrow="Students" title="Add Student" description="Create a student login for direct portal access.">
            <form onSubmit={saveStudent} className="mt-4 max-w-2xl space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</label>
                  <Input
                    type="text"
                    required
                    className="mt-2"
                    value={studentForm.name}
                    onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
                  <Input
                    type="email"
                    required
                    className="mt-2"
                    value={studentForm.email}
                    onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Password</label>
                <Input
                  type="password"
                  required
                  className="mt-2"
                  value={studentForm.password}
                  onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                />
              </div>

              <Button type="submit" variant="solid" size="md" disabled={isProcessing}>
                Create Student Login
              </Button>
            </form>
          </PremiumCard>
        )}

        {activeTab === "student-admissions" && <AdmissionsManagement />}

        {isStudentTab && (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <Input
                type="text"
                placeholder="Search students by name or email..."
                className="py-4 pl-12"
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
                      <Button variant="ghost" size="sm" className="w-full mt-4 tracking-widest text-slate-400 group-hover:text-white">
                        Detailed Audit
                      </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-white"
                      onClick={() => setEditingCourse({ ...course })}
                    >
                      Edit
                    </Button>
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
                  <Input
                    type="text"
                    required
                    className="mt-2"
                    value={courseForm.title}
                    onChange={e => setCourseForm({...courseForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Code</label>
                  <Input
                    type="text"
                    className="mt-2"
                    value={courseForm.code}
                    onChange={e => setCourseForm({...courseForm, code: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                <Textarea
                  className="mt-2 h-32"
                  value={courseForm.description}
                  onChange={e => setCourseForm({...courseForm, description: e.target.value})}
                />
              </div>

              <div className="flex items-center gap-4">
                <Button type="submit" variant="solid" size="md" disabled={isProcessing}>
                  Create Course
                </Button>
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
                <Button variant="secondary" size="sm" className="mt-4">
                  Enable Mode
                </Button>
              </div>
            </div>
          </PremiumCard>
        )}

        {activeTab === "class-create" && (
          <ClassesManagement mode="create" teachers={activeStaff} courses={courses} />
        )}

        {activeTab === "classes" && (
          <ClassesManagement mode="manage" teachers={activeStaff} courses={courses} />
        )}

        {editingCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
              <div className="flex items-start justify-between border-b border-white/10 bg-gradient-to-r from-accent-purple/10 to-accent-cyan/10 p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-purple">Course Catalog</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Edit Course</h2>
                  <p className="mt-1 text-sm text-slate-400">Update catalog details and publication status.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={updateCourse} className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Title</label>
                    <Input className="mt-2" required value={editingCourse.title} onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Code</label>
                    <Input className="mt-2" value={editingCourse.code ?? ""} onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Level</label>
                    <Select className="mt-2" value={editingCourse.level ?? ""} onChange={(e) => setEditingCourse({ ...editingCourse, level: e.target.value })}>
                      <option value="">Not specified</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Publication Status</label>
                    <Select className="mt-2" value={String(editingCourse.isPublished)} onChange={(e) => setEditingCourse({ ...editingCourse, isPublished: e.target.value === "true" })}>
                      <option value="false">Draft</option>
                      <option value="true">Published</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                  <Textarea className="mt-2 min-h-32" value={editingCourse.description ?? ""} onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })} />
                </div>
                <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
                  <Button type="button" variant="ghost" onClick={() => setEditingCourse(null)}>Cancel</Button>
                  <Button type="submit" variant="solid" disabled={isProcessing}>{isProcessing ? "Saving..." : "Save Changes"}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedStaffUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
              <div className="flex items-start justify-between border-b border-white/10 bg-gradient-to-r from-accent-purple/10 to-accent-cyan/10 p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-purple">Staff Profile</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{selectedStaffUser.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">Teacher account details</p>
                </div>
                <button onClick={() => setSelectedStaffUser(null)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Full Name", selectedStaffUser.name],
                    ["Email Address", selectedStaffUser.email],
                    ["Phone Number", selectedStaffUser.phoneNumber || "Not provided"],
                    ["Role", "Teacher"],
                    ["Account Status", selectedStaffUser.isActive ? "Active" : "Disabled"],
                    ["Joined", formatDateTime(selectedStaffUser.createdAt)],
                    ["Last Login", selectedStaffUser.lastLoginAt ? formatDateTime(selectedStaffUser.lastLoginAt) : "Never"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                      <p className="mt-2 break-words text-sm font-medium text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
                <StaffCoursesPanel assignments={staffCourseAssignments} loading={staffCoursesLoading} />
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-sm text-amber-200">
                  This staff account has no linked registration application, so personal, educational, and document details are unavailable.
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStaffInvitation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-accent-purple/10 to-accent-cyan/10 p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-purple">Staff Application</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{selectedStaffInvitation.name}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    <span>{selectedStaffInvitation.email}</span>
                    <span className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block" />
                    <span>{selectedStaffInvitation.role}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStaffInvitation(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[calc(92vh-112px)] space-y-6 overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</p>
                    <div className="mt-3">
                      <span className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                        selectedStaffInvitation.status === "APPROVED" && "bg-emerald-500/10 text-emerald-300",
                        selectedStaffInvitation.status === "SUBMITTED" && "bg-amber-500/10 text-amber-300",
                        selectedStaffInvitation.status === "INVITED" && "bg-accent-cyan/10 text-accent-cyan",
                        selectedStaffInvitation.status === "REVISION_REQUESTED" && "bg-purple-500/10 text-purple-300",
                        selectedStaffInvitation.status === "REJECTED" && "bg-rose-500/10 text-rose-300",
                      )}>
                        {selectedStaffInvitation.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Submitted</p>
                    <p className="mt-3 text-sm font-semibold text-white">
                      {selectedStaffInvitation.submittedAt ? formatDateTime(selectedStaffInvitation.submittedAt) : "Not submitted yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Documents</p>
                    <p className="mt-3 text-sm font-semibold text-white">
                      {selectedStaffInvitation.documentLinks?.length || 0} file(s)
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <FileText size={14} />
                      Education & Experience
                    </div>
                    <div className="grid gap-3">
                      {parseSubmittedDetails(selectedStaffInvitation.educationDetails).map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-xl bg-white/[0.04] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-200">{item.value}</p>
                        </div>
                      ))}
                      {!selectedStaffInvitation.educationDetails && (
                        <p className="text-sm text-slate-500">No education details submitted yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <AlertCircle size={14} />
                      Personal Details
                    </div>
                    <div className="grid gap-3">
                      {parseSubmittedDetails(selectedStaffInvitation.personalDetails).map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-xl bg-white/[0.04] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-200">{item.value}</p>
                        </div>
                      ))}
                      {!selectedStaffInvitation.personalDetails && (
                        <p className="text-sm text-slate-500">No personal details submitted yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <StaffCoursesPanel assignments={staffCourseAssignments} loading={staffCoursesLoading} />

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Documents</p>
                  {selectedStaffInvitation.documentLinks?.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {selectedStaffInvitation.documentLinks.map((rawLink, index) => {
                        const [label, ...urlParts] = rawLink.split(": ");
                        const url = urlParts.join(": ") || rawLink;

                        return (
                          <a
                            key={`${rawLink}-${index}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 p-4 transition hover:bg-accent-cyan/20 hover:text-white"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-950/70 text-accent-cyan group-hover:text-white">
                                <FileText size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-accent-cyan group-hover:text-white">
                                  {label && urlParts.length ? formatDocumentLabel(label) : `Document ${index + 1}`}
                                </p>
                                <p className="mt-1 truncate text-xs text-slate-500">Open uploaded file</p>
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No document links submitted.</p>
                  )}
                </div>

                {selectedStaffInvitation.adminNotes && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-100">
                    Admin notes: {selectedStaffInvitation.adminNotes}
                  </div>
                )}

                {selectedStaffInvitation.status === "SUBMITTED" && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-5">
                    <Button size="sm" variant="success" disabled={isProcessing} onClick={() => reviewStaffInvitation(selectedStaffInvitation.id, "APPROVED")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" disabled={isProcessing} onClick={() => reviewStaffInvitation(selectedStaffInvitation.id, "REVISION_REQUESTED")}>
                      Request Revision
                    </Button>
                    <Button size="sm" variant="danger" disabled={isProcessing} onClick={() => reviewStaffInvitation(selectedStaffInvitation.id, "REJECTED")}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function StaffCoursesPanel({ assignments, loading }: { assignments: StaffCourseAssignment[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          <BookOpen size={15} /> Assigned Courses
        </div>
        <span className="rounded-full bg-accent-cyan/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
          {assignments.filter((item) => item.isActive).length} Active
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading course assignments...</p>
      ) : assignments.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-xl border border-accent-cyan/15 bg-accent-cyan/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{assignment.courseTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{assignment.courseCode || "No course code"}</p>
                </div>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", assignment.isActive ? "bg-emerald-400" : "bg-slate-600")} />
              </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs font-medium text-accent-cyan">{assignment.className}</p>
                <p className="mt-1 text-xs text-slate-500">Section {assignment.sectionName}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 py-7 text-center text-sm text-slate-500">
          No courses are assigned to this staff member.
        </div>
      )}
    </div>
  );
}
