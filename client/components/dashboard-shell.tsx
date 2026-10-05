"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import {
  Bell,
  Search,
  BookOpen,
  Video,
  FileQuestion,
  Users,
  GraduationCap,
  Menu,
  ShieldAlert,
  X,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const roleLabels = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  guardian: "Guardian",
} as const;

type Role = keyof typeof roleLabels;

type SearchCourse = { id: string; title: string; code: string | null };
type SearchLecture = { id: string; courseId: string; title: string };
type SearchQuiz = {
  id: string;
  question: string;
  topic?: string;
  status?: string;
};

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  tab: string;
  icon: ReactNode;
  tone: "warning" | "info" | "success";
};

const rolePath: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
  guardian: "/guardian",
};

function targetTab(role: Role, kind: "course" | "lecture" | "quiz"): string {
  if (role === "teacher") return kind === "lecture" ? "manage-lectures" : "courses";
  if (role === "student") return kind === "quiz" ? "exams" : "courses";
  if (role === "guardian") return kind === "lecture" ? "lectures" : "progress";
  return "courses";
}

export function DashboardShell({
  role,
  title,
  subtitle,
  children,
  activeTab = "overview",
  onTabChange,
  session,
  hideHeader = false,
}: {
  role: Role;
  title: string;
  subtitle: string;
  children: ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  session?: { name: string; email: string };
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [courses, setCourses] = useState<SearchCourse[]>([]);
  const [lectures, setLectures] = useState<SearchLecture[]>([]);
  const [quizzes, setQuizzes] = useState<SearchQuiz[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function loadSearchIndex() {
      try {
        const [courseData, lectureData] = await Promise.all([
          apiFetch<SearchCourse[]>("/api/admin/courses"),
          apiFetch<SearchLecture[]>("/api/admin/lectures"),
        ]);
        if (!active) return;
        setCourses(courseData);
        setLectures(lectureData);

        if (role === "student") {
          const quizData = await apiFetch<SearchQuiz[]>("/api/student/quiz/mock-exams");
          if (active) setQuizzes(quizData);
        } else if (role === "teacher" || role === "admin") {
          const quizData = await apiFetch<SearchQuiz[]>("/api/teacher/quizzes");
          if (active) setQuizzes(quizData);
        }
      } catch {
        // Search index is best-effort; failures must not break the navbar.
      }
    }

    async function loadNotifications() {
      try {
        if (role === "admin") {
          const [users, teacherQuizzes] = await Promise.all([
            apiFetch<{ id: string; role: string; isActive: boolean }[]>("/api/admin/users"),
            apiFetch<SearchQuiz[]>("/api/teacher/quizzes"),
          ]);
          if (!active) return;
          const pendingApprovals = users.filter(
            (user) => user.role !== "ADMIN" && !user.isActive,
          );
          const pendingQuizzes = teacherQuizzes.filter(
            (quiz) => quiz.status === "pending",
          );
          const items: NotificationItem[] = [];
          if (pendingApprovals.length > 0) {
            items.push({
              id: "staff-approvals",
              title: `${pendingApprovals.length} staff approval${pendingApprovals.length === 1 ? "" : "s"} pending`,
              description: "Review teacher and staff registrations.",
              tab: "staff-approvals",
              icon: <Users size={16} />,
              tone: "warning",
            });
          }
          if (pendingQuizzes.length > 0) {
            items.push({
              id: "quiz-reviews",
              title: `${pendingQuizzes.length} quiz${pendingQuizzes.length === 1 ? "" : "zes"} awaiting review`,
              description: "Approve or reject teacher-submitted quizzes.",
              tab: "courses",
              icon: <FileQuestion size={16} />,
              tone: "info",
            });
          }
          if (items.length === 0) {
            items.push({
              id: "all-clear",
              title: "You are all caught up",
              description: "No pending approvals or reviews.",
              tab: "overview",
              icon: <ShieldAlert size={16} />,
              tone: "success",
            });
          }
          setNotifications(items);
        } else if (role === "teacher") {
          const quizData = await apiFetch<SearchQuiz[]>("/api/teacher/quizzes");
          if (!active) return;
          const pendingQuizzes = quizData.filter(
            (quiz) => quiz.status === "pending",
          );
          setNotifications(
            pendingQuizzes.length > 0
              ? [
                  {
                    id: "pending-quizzes",
                    title: `${pendingQuizzes.length} quiz${pendingQuizzes.length === 1 ? "" : "zes"} pending review`,
                    description: "Approve or edit your pending checkpoint quizzes.",
                    tab: "quizzes",
                    icon: <FileQuestion size={16} />,
                    tone: "warning",
                  },
                ]
              : [
                  {
                    id: "all-clear",
                    title: "All quizzes reviewed",
                    description: "No pending quiz reviews.",
                    tab: "quizzes",
                    icon: <ShieldAlert size={16} />,
                    tone: "success",
                  },
                ],
          );
        } else if (role === "student") {
          const examData = await apiFetch<{ id: string; title: string }[]>(
            "/api/student/mock-exams?studentId=" +
              encodeURIComponent(session?.email || ""),
          );
          if (!active) return;
          setNotifications(
            examData.length > 0
              ? [
                  {
                    id: "mock-exams",
                    title: `${examData.length} mock exam${examData.length === 1 ? "" : "s"} available`,
                    description: "Teacher-published practice exams are ready.",
                    tab: "exams",
                    icon: <FileQuestion size={16} />,
                    tone: "info",
                  },
                ]
              : [
                  {
                    id: "no-exams",
                    title: "No mock exams yet",
                    description: "Check back once your teacher publishes one.",
                    tab: "exams",
                    icon: <ShieldAlert size={16} />,
                    tone: "success",
                  },
                ],
          );
        } else if (role === "guardian") {
          const progress = await apiFetch<
            { failedQuizzes?: number; studentName?: string }[]
          >("/api/guardian/progress");
          if (!active) return;
          const failed = progress.reduce(
            (total, item) => total + (item.failedQuizzes ?? 0),
            0,
          );
          setNotifications(
            failed > 0
              ? [
                  {
                    id: "failed-quizzes",
                    title: `${failed} failed quiz attempt${failed === 1 ? "" : "s"}`,
                    description: "Attention may be needed on some checkpoints.",
                    tab: "alerts",
                    icon: <ShieldAlert size={16} />,
                    tone: "warning",
                  },
                ]
              : [
                  {
                    id: "all-clear",
                    title: "Healthy learning rhythm",
                    description: "No failed quizzes or risk alerts.",
                    tab: "alerts",
                    icon: <ShieldAlert size={16} />,
                    tone: "success",
                  },
                ],
          );
        }
      } catch {
        // Notifications are best-effort; failures must not break the navbar.
      }
    }

    void loadSearchIndex();
    void loadNotifications();
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
      if (
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { courses: [], lectures: [], quizzes: [] };

    return {
      courses: courses
        .filter(
          (course) =>
            course.title.toLowerCase().includes(query) ||
            (course.code ?? "").toLowerCase().includes(query),
        )
        .slice(0, 4),
      lectures: lectures
        .filter((lecture) => lecture.title.toLowerCase().includes(query))
        .slice(0, 4),
      quizzes: quizzes
        .filter(
          (quiz) =>
            quiz.question.toLowerCase().includes(query) ||
            (quiz.topic ?? "").toLowerCase().includes(query),
        )
        .slice(0, 4),
    };
  }, [searchQuery, courses, lectures, quizzes]);

  const totalResults =
    searchResults.courses.length +
    searchResults.lectures.length +
    searchResults.quizzes.length;

  const navigateToTab = useCallback(
    (tab: string) => {
      setSearchOpen(false);
      setNotifOpen(false);
      if (onTabChange) {
        onTabChange(tab);
        return;
      }
      router.push(`${rolePath[role]}?tab=${tab}` as any);
    },
    [onTabChange, role, router],
  );

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const notifCount = notifications.filter(
    (item) => item.tone !== "success",
  ).length;

  return (
    <div className="flex h-screen overflow-hidden page-canvas text-slate-800">
      {/* Sidebar */}
      <Sidebar
        role={role as any}
        activeItemId={activeTab}
        onItemClick={onTabChange || (() => {})}
        userName={session?.name}
        userEmail={session?.email}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Navigation / Header */}
        {!hideHeader && (
          <header className="relative z-40 flex h-20 shrink-0 items-center justify-between border-b border-accent-purple/10 bg-[#ffffff]/70 px-4 backdrop-blur-2xl sm:px-8">
            <div className="flex items-center gap-3 sm:gap-8">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-accent-purple/[0.08] active:scale-95 lg:hidden"
                aria-label="Open menu"
                aria-controls="primary-navigation"
                aria-expanded={mobileNavOpen}
              >
                <Menu size={20} />
              </button>
              <div className="relative hidden lg:block" ref={searchRef}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search courses, lectures, quizzes..."
                  className="h-10 w-80 pl-10 border-accent-purple/15 bg-accent-purple/[0.05] text-slate-900 placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}

                {searchOpen && (searchQuery.trim() || totalResults > 0) ? (
                  <div className="glass-panel-opaque absolute left-0 top-12 z-50 w-80 overflow-hidden rounded-2xl motion-pop">
                    {totalResults === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">
                        No matches for &quot;{searchQuery.trim()}&quot;
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto p-2">
                        {searchResults.courses.length > 0 ? (
                          <div className="mb-1 px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Courses
                          </div>
                        ) : null}
                        {searchResults.courses.map((course) => (
                          <button
                            key={course.id}
                            onClick={() =>
                              navigateToTab(targetTab(role, "course"))
                            }
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent-purple/[0.06]"
                          >
                            <BookOpen className="h-4 w-4 shrink-0 text-accent-purple" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                              {course.title}
                            </span>
                            {course.code ? (
                              <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                {course.code}
                              </span>
                            ) : null}
                          </button>
                        ))}

                        {searchResults.lectures.length > 0 ? (
                          <div className="mb-1 mt-2 px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Lectures
                          </div>
                        ) : null}
                        {searchResults.lectures.map((lecture) => (
                          <button
                            key={lecture.id}
                            onClick={() =>
                              navigateToTab(targetTab(role, "lecture"))
                            }
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent-purple/[0.06]"
                          >
                            <Video className="h-4 w-4 shrink-0 text-accent-cyan" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                              {lecture.title}
                            </span>
                          </button>
                        ))}

                        {searchResults.quizzes.length > 0 ? (
                          <div className="mb-1 mt-2 px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Quizzes
                          </div>
                        ) : null}
                        {searchResults.quizzes.map((quiz) => (
                          <button
                            key={quiz.id}
                            onClick={() =>
                              navigateToTab(targetTab(role, "quiz"))
                            }
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent-purple/[0.06]"
                          >
                            <FileQuestion className="h-4 w-4 shrink-0 text-amber-600" />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                              {quiz.question}
                            </span>
                            {quiz.topic ? (
                              <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                {quiz.topic}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-5">
              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((open) => !open)}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:text-slate-900",
                    notifOpen && "text-slate-900",
                  )}
                  aria-label="Notifications"
                >
                  <Bell size={20} />
                  {notifCount > 0 ? (
                    <span className="absolute right-2.5 top-2.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-danger opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-danger border-2 border-ink-950" />
                    </span>
                  ) : null}
                </button>

                {notifOpen ? (
                  <div className="glass-panel-opaque absolute right-0 top-12 w-80 overflow-hidden rounded-2xl">
                    <div className="flex items-center justify-between border-b border-accent-purple/15 px-4 py-3">
                      <p className="text-sm font-bold text-slate-900">
                        Notifications
                      </p>
                      <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {notifCount > 0 ? `${notifCount} new` : "All clear"}
                      </span>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => navigateToTab(item.tab)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-accent-purple/[0.06]",
                            item.tone === "warning" && "bg-rose-500/[0.06]",
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              item.tone === "warning" &&
                                "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25 backdrop-blur-sm",
                              item.tone === "info" &&
                                "bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm",
                              item.tone === "success" &&
                                "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm",
                            )}
                          >
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.description}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="h-6 w-px bg-accent-purple/15 mx-2" />

              {/* Quick Profile */}
              <Link
                href="/profile"
                className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-accent-purple/[0.08]"
                title="Edit profile"
              >
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-slate-900 transition">
                    {session?.name || "User Name"}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{roleLabels[role]}</p>
                </div>
                <Avatar name={session?.name} size="md" />
              </Link>
            </div>
          </header>
        )}

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto page-canvas p-4 sm:p-8">
          <div className="mx-auto max-w-6xl">
            <header className="mb-10">
              <Eyebrow className="text-slate-500">{roleLabels[role]} Dashboard</Eyebrow>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900">
                    {title}
                  </h1>
                  <p className="mt-2 text-slate-500">
                    {subtitle}
                  </p>
                </div>

                {/* Dynamic context buttons could go here */}
              </div>
            </header>

            <div key={activeTab} className="motion-rise">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}