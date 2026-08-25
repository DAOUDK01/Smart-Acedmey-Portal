"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "./dashboard-shell";
import { PremiumCard } from "./premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { getInitialTab, useTabHistory } from "@/lib/use-tab-history";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import MaintenanceScreen from "@/components/maintenance-screen";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Bot,
  Clock,
  FileQuestion,
  Flame,
  GraduationCap,
  PlayCircle,
  Send,
  Sparkles,
  ArrowRight,
  Target,
  TrendingUp,
  User as UserIcon,
  X,
  Check,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LecturePlayer, type LectureQuiz } from "@/components/lecture-player";
import { StudentDashboard } from "./student/student-dashboard";
import { MockExams, type MockExam } from "./student/mock-exams";
import { API_BASE_URL, apiFetch, authenticatedFetch } from "@/lib/api";

type StudentProgress = {
  id: string;
  studentId: string;
  avgScore: number;
  progressPercentage: number;
  completedLectures: number;
  streakDays: number;
  lastActivityAt?: string | null;
  weakTopics?: unknown;
  failedQuizzes?: number;
};

type ChatMessage = {
  role: "user" | "bot";
  content: string;
};

type TutorReply = {
  reply: string;
  mode: "general" | "lecture" | "personal";
  sources?: { title: string; snippet: string; score?: number }[];
  fallback?: boolean;
};

type Course = {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  level: string | null;
  isPublished: boolean;
};

type Lecture = {
  id: string;
  courseId: string;
  videoUrl: string;
  title: string;
  durationMinutes: number | null;
  publishedAt: string | null;
  sourceType?: string | null;
  hlsMasterUrl?: string | null;
  thumbnailUrl?: string | null;
  processingStatus?: string | null;
  processingProgress?: number | null;
  processingError?: string | null;
};

type Quiz = {
  id: string;
  lectureId?: string;
  question: string;
  options: string[];
  correctAnswer: string;
  status: string;
  difficulty: "easy" | "medium" | "hard";
  timestamp?: number;
  topic?: string;
  segment?: string;
};

type RecommendedLecture = Pick<
  Lecture,
  "id" | "title" | "videoUrl" | "durationMinutes" | "sourceType" | "hlsMasterUrl" | "thumbnailUrl" | "processingStatus" | "processingProgress" | "processingError"
> & {
  summary?: string | null;
};

type Recommendation = {
  userId: string;
  currentResource: string;
  recommendation: "REWATCH" | "NEXT_VIDEO";
  rewatchProbability: number;
  recommendedResource: string | null;
  recommendedLecture: RecommendedLecture | null;
  alternatives: string[];
  alternativeLectures: RecommendedLecture[];
  rewatchReason?: string | null;
};

function getYouTubeId(url: string) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function getYouTubeThumbnail(url: string) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function resolveThumbnail(lecture: {
  videoUrl: string;
  thumbnailUrl?: string | null;
}) {
  return (
    getYouTubeThumbnail(lecture.videoUrl) ??
    (lecture.thumbnailUrl
      ? `${API_BASE_URL}${lecture.thumbnailUrl}`
      : null)
  );
}

function parseWeakTopics(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const count = useCountUp(value);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      setOffset(circumference * (1 - Math.min(100, value) / 100)),
    );
    return () => cancelAnimationFrame(raf);
  }, [value, circumference]);
  return (
    <div className="relative h-36 w-36">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#0891B2" />
          </linearGradient>
        </defs>
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="rgba(124,58,237,0.1)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-slate-900">
          {count}%
        </span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
    </div>
  );
}

function SmartRecommendationCard({
  recommendation,
  onOpenLecture,
}: {
  recommendation: Recommendation | null;
  onOpenLecture: (lecture: Lecture | RecommendedLecture) => void;
}) {
  const target = recommendation?.recommendedLecture ?? null;

  if (!recommendation || !target) {
    return (
      <PremiumCard
        eyebrow="Smart Recommendation"
        title="Your AI Recommendation"
        description="Based on your recent learning activity."
      >
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-purple/[0.06] p-4 text-sm text-slate-400">
          <Sparkles className="h-4 w-4 shrink-0 text-accent-purple" />
          {recommendation
            ? "You've completed all available lectures — new suggestions will appear when new lectures are added."
            : "Complete a lecture to unlock your personalized recommendation."}
        </div>
      </PremiumCard>
    );
  }

  const isRewatch = recommendation.recommendation === "REWATCH";

  return (
    <PremiumCard
      eyebrow="Smart Recommendation"
      title={isRewatch ? "Rewatch Recommended" : "Next Lecture Picked for You"}
      description={
        isRewatch
          ? (recommendation.rewatchReason ??
            "Rewatching now will strengthen your understanding of this lecture.")
          : "Personalized pick based on your recent learning signals."
      }
    >
      <div className="mt-4 rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-ink-900">
              {resolveThumbnail(target) ? (
                <img
                  src={resolveThumbnail(target)!}
                  className="h-full w-full object-cover opacity-80"
                  alt="Video"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-purple/15 to-accent-cyan/10">
                  <PlayCircle className="text-slate-700" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{target.title}</p>
              {target.durationMinutes != null && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={12} /> {target.durationMinutes} min
                </p>
              )}
              {target.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                  {target.summary}
                </p>
              )}
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => onOpenLecture(target)}>
            {isRewatch ? "Rewatch Lecture" : "Play Next"}
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </PremiumCard>
  );
}

export function StudentConsole() {
  const { ready, session, isApproved, maintenance } = usePortalLock("/student");
  const [activeTab, setActiveTab] = useState(() => getInitialTab("overview"));
  useTabHistory(activeTab, setActiveTab);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [currentLecture, setCurrentLecture] = useState<Lecture | RecommendedLecture | null>(null);
  const [lectureTab, setLectureTab] = useState<string | null>(null);
  const watchProgressRef = useRef(0);
  const [answeredQuizzes, setAnsweredQuizzes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const key = `smart-academy:answered-quizzes:${session?.email || "guest"}`;
      const raw = window.localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [dashboardRecommendation, setDashboardRecommendation] = useState<Recommendation | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "bot",
      content: "Hi! I'm your AI Tutor. Ask me anything about your courses or a specific lecture.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatLectureId, setChatLectureId] = useState<string>("");

  useEffect(() => {
    if (!ready || !isApproved) return;
    const loadData = async () => {
      const results = await Promise.allSettled([
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/student/quiz/questions"),
        apiFetch<MockExam[]>("/api/student/mock-exams?studentId=" + encodeURIComponent(session?.email || "")),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
      ]);

      const [courseResult, lectureResult, quizResult, mockExamResult, progressResult] = results;
      const courseData = courseResult.status === "fulfilled" ? courseResult.value : [];
      const lectureData = lectureResult.status === "fulfilled" ? lectureResult.value : [];
      const publishedCourses = courseData.filter((course) => course.isPublished);
      const publishedLectures = lectureData.filter((lecture) => lecture.publishedAt);

      setCourses(publishedCourses);
      setLectures(publishedLectures);
      setQuizzes(quizResult.status === "fulfilled" ? quizResult.value : []);
      setMockExams(mockExamResult.status === "fulfilled" ? mockExamResult.value : []);

      if (progressResult.status === "fulfilled") {
        const myProgress = progressResult.value.find(
          (item) => item.studentId === session?.email || item.studentId.toLowerCase() === session?.email?.toLowerCase(),
        );
        setProgress(myProgress || null);
      }

      if (publishedCourses.length > 0) {
        setSelectedCourseId((current) => current && publishedCourses.some((course) => course.id === current) ? current : publishedCourses[0].id);
      }
    };
    loadData();
    loadDashboardRecommendation();
  }, [ready, isApproved, session?.email]);

  const loadDashboardRecommendation = async () => {
    try {
      const response = await authenticatedFetch("/api/student/recommendations");
      if (response.ok) {
        setDashboardRecommendation((await response.json()) as Recommendation);
      } else {
        setDashboardRecommendation(null);
      }
    } catch {
      setDashboardRecommendation(null);
    }
  };

  const currentLectureQuizzes = useMemo(() => {
    if (!currentLecture) return [];
    return quizzes
      .filter((q) => q.lectureId === currentLecture.id && typeof q.timestamp === "number")
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [quizzes, currentLecture]);

  const handleSubmitQuizAnswer = async (quiz: LectureQuiz, answer: string) => {
    const response = await authenticatedFetch(`/api/teacher/quizzes/${quiz.id}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: session?.email || "student",
        answer,
        responseTime: 5,
      }),
    });

    if (!response.ok) return null;
    const result = (await response.json()) as {
      passed: boolean;
      correctAnswer: string;
      explanation: string;
    };

    if (result) {
      setMockExams((current) => current.filter((q) => q.id !== quiz.id));
      void refreshProgress();
    }
    return result;
  };

  const handleSubmitMockExam = async (
    exam: MockExam,
    score: number,
    totalQuestions: number,
  ) => {
    try {
      const response = await authenticatedFetch(
        `/api/student/mock-exams/${exam.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: session?.email || "student",
            score,
            totalQuestions,
          }),
        },
      );
      if (!response.ok) return false;
      setMockExams((current) => current.filter((e) => e.id !== exam.id));
      void refreshProgress();
      return true;
    } catch {
      return false;
    }
  };

  const refreshProgress = async () => {
    try {
      const progressData = await apiFetch<StudentProgress[]>(
        "/api/guardian/progress",
      );
      const myProgress = progressData.find(
        (item) =>
          item.studentId === session?.email ||
          item.studentId.toLowerCase() === session?.email?.toLowerCase(),
      );
      setProgress(myProgress || null);
    } catch {
      // keep the previously loaded progress if the refresh fails
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const key = `smart-academy:answered-quizzes:${session?.email || "guest"}`;
      window.localStorage.setItem(key, JSON.stringify([...answeredQuizzes]));
    } catch {
      // storage may be unavailable; in-memory answers still work
    }
  }, [answeredQuizzes, session?.email]);

  useEffect(() => {
    if (!session?.email || typeof window === "undefined") return;
    try {
      const key = `smart-academy:answered-quizzes:${session.email}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        setAnsweredQuizzes(new Set(JSON.parse(raw) as string[]));
      }
    } catch {
      // ignore storage errors
    }
  }, [session?.email]);

  useEffect(() => {
    if (!currentLecture) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeLecture();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLecture]);

  const closeLecture = async () => {
    if (!currentLecture) return;
    const lecture = currentLecture;
    const watchPercent = watchProgressRef.current;
    setCurrentLecture(null);
    setLectureTab(null);
    setAnsweredQuizzes(new Set());
    setRecommendation(null);

    try {
      const response = await authenticatedFetch("/api/student/recommendations/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lectureId: lecture.id,
          watchPercent: watchPercent > 0 ? Math.round(watchPercent) : undefined,
        }),
      });
      if (response.ok) {
        loadDashboardRecommendation();
      }
    } catch (error) {
      console.error("Failed to record watch progress", error);
    }
  };

  const openLecture = async (lecture: Lecture | RecommendedLecture) => {
    setCurrentLecture(lecture);
    setLectureTab(activeTab);
    watchProgressRef.current = 0;
    setAnsweredQuizzes((prev) => {
      try {
        const key = `smart-academy:answered-quizzes:${session?.email || "guest"}`;
        const raw = window.localStorage.getItem(key);
        if (raw) {
          return new Set([...prev, ...(JSON.parse(raw) as string[])]);
        }
      } catch {
        // ignore storage errors
      }
      return prev;
    });
    setRecommendation(null);

    try {
      const response = await authenticatedFetch("/api/student/recommendations/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureId: lecture.id }),
      });
      if (response.ok) {
        const data = (await response.json()) as Recommendation;
        setRecommendation(data);
        loadDashboardRecommendation();
      } else {
        setRecommendation(null);
        console.error("Smart recommendation request failed", response.status);
      }
    } catch (error) {
      console.error("Failed to load smart recommendation", error);
      setRecommendation(null);
    }
  };

  const handleSendMessage = async (presetMessage?: string) => {
    const userMsg = (presetMessage ?? chatInput).trim();
    if (!userMsg) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);

    try {
      const history: { role: "user" | "assistant"; content: string }[] = chatMessages
        .slice(-6)
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        }));

      const response = await authenticatedFetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          studentId: session?.email || "student",
          lectureId: chatLectureId || currentLecture?.id || undefined,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tutor request failed: ${response.status}`);
      }

      const data = (await response.json()) as TutorReply;
      setChatMessages(prev => [
        ...prev,
        {
          role: "bot",
          content: data.reply,
        },
      ]);
    } catch (error) {
      console.error("AI tutor request failed", error);
      setChatMessages(prev => [
        ...prev,
        {
          role: "bot",
          content:
            "Sorry, I couldn't reach the tutor right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const selectedCourse = useMemo(() => courses.find((course) => course.id === selectedCourseId), [courses, selectedCourseId]);
  const visibleLectures = useMemo(() => lectures.filter((lecture) => lecture.courseId === selectedCourseId), [lectures, selectedCourseId]);

  const weakTopics = useMemo(() => parseWeakTopics(progress?.weakTopics), [progress]);
  const avgScoreCount = useCountUp(progress?.avgScore ?? 0);

  const subjectReports = useMemo(() => {
    return courses.map((course, index) => {
      const overall = progress?.avgScore ?? 0;
      const courseLectures = lectures.filter((lecture) => lecture.courseId === course.id);
      const score = Math.max(35, Math.min(98, Math.round(overall - index * 5 + (progress?.streakDays ?? 0))));
      const progressValue = Math.max(20, Math.min(100, Math.round((progress?.progressPercentage ?? 0) - index * 6 + 10)));
      const recommendation = score < 60
        ? "Rewatch the latest lecture and attempt one extra checkpoint quiz."
        : score < 80
          ? "Do a focused revision session and ask the AI tutor one concept question."
          : "Maintain momentum with one advanced practice set this week.";

      return {
        subject: course.title,
        score,
        progress: progressValue,
        quizzesReady: quizzes.filter((quiz) => courseLectures.some((lecture) => lecture.id === quiz.lectureId)).length,
        recommendation,
      };
    });
  }, [courses, lectures, progress, quizzes]);

  const visibleSubjectReports = useMemo(() => {
    if (selectedSubject === "all") {
      return subjectReports;
    }
    return subjectReports.filter((report) => report.subject === selectedSubject);
  }, [selectedSubject, subjectReports]);

  const weeklyProgressData = useMemo(() => {
    const baseProgress = progress?.progressPercentage ?? 0;
    const baseScore = progress?.avgScore ?? 0;
    return [
      { name: "Mon", progress: Math.max(10, baseProgress - 18), score: Math.max(20, baseScore - 16) },
      { name: "Tue", progress: Math.max(12, baseProgress - 12), score: Math.max(30, baseScore - 10) },
      { name: "Wed", progress: Math.max(16, baseProgress - 8), score: Math.max(38, baseScore - 7) },
      { name: "Thu", progress: Math.max(20, baseProgress - 5), score: Math.max(44, baseScore - 4) },
      { name: "Fri", progress: Math.max(24, baseProgress - 2), score: Math.max(52, baseScore - 2) },
      { name: "Sat", progress: Math.min(100, baseProgress), score: Math.min(100, baseScore) },
    ];
  }, [progress]);

  const recommendations = useMemo(() => {
    if (weakTopics.length === 0) {
      return [
        "Keep your current streak going with one mock exam this week.",
        "Use the AI tutor to test one advanced question from your strongest subject.",
      ];
    }
    return weakTopics.map((topic) => `Review ${topic} again and complete one focused quiz on that topic.`);
  }, [weakTopics]);

  if (!ready) return null;

  if (maintenance?.enabled && session?.role !== "ADMIN") {
    return <MaintenanceScreen message={maintenance.message} />;
  }

  return (
    <DashboardShell
      role="student"
      title={`Hi, ${session?.name || "Student"}!`}
      subtitle="Ready to continue your learning journey today?"
      activeTab={activeTab}
      onTabChange={setActiveTab}
      session={session ?? undefined}
    >
      <div className="flex flex-col gap-6">
        <PendingApprovalBanner roleLabel="student" isApproved={isApproved} />

        {currentLecture && isApproved && (
          <div className={cn(activeTab !== lectureTab && "hidden")}>
            <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-accent-purple/15 bg-ink-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-accent-purple/10 bg-ink-900 p-4 sm:px-6">
                <h3 className="text-lg font-bold text-white truncate pr-8">{currentLecture.title}</h3>
                <button
                  onClick={() => {
                    void closeLecture();
                  }}
                  className="p-2 text-slate-500 transition-all hover:text-rose-600"
                  aria-label="Close lecture player"
                >
                  <X size={20} />
                </button>
              </div>

              {recommendation && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-purple/10 bg-accent-purple/[0.06] px-4 py-3 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-accent-purple" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-600">
                        {recommendation.recommendation === "REWATCH" ? (
                          recommendation.rewatchReason ? (
                            recommendation.rewatchReason
                          ) : recommendation.recommendedLecture &&
                            recommendation.recommendedLecture.id !==
                              currentLecture.id ? (
                            <>
                              Smart recommendation: rewatch{" "}
                              <span className="font-semibold text-white">
                                {recommendation.recommendedLecture.title}
                              </span>{" "}
                              to strengthen your understanding.
                            </>
                          ) : (
                            <>
                              Smart recommendation:{" "}
                              <span className="font-semibold text-white">
                                rewatch this lecture
                              </span>{" "}
                              to strengthen your understanding.
                            </>
                          )
                        ) : recommendation.recommendedLecture ? (
                          <>
                            Smart recommendation: next up is{" "}
                            <span className="font-semibold text-white">
                              {recommendation.recommendedLecture.title}
                            </span>
                            .
                          </>
                        ) : (
                          <>
                            Smart recommendation: you've completed all available
                            lectures — new suggestions will appear when new
                            lectures are added.
                          </>
                        )}
                      </p>
                      {recommendation.recommendedLecture?.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {recommendation.recommendedLecture.summary}
                        </p>
                      )}
                    </div>
                  </div>
                  {recommendation.recommendation === "NEXT_VIDEO" &&
                    recommendation.recommendedLecture && (
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() => openLecture(recommendation.recommendedLecture!)}
                      >
                        Play Next
                        <ArrowRight size={14} />
                      </Button>
                    )}
                  {recommendation.recommendation === "REWATCH" &&
                    recommendation.recommendedLecture &&
                    recommendation.recommendedLecture.id !== currentLecture.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => openLecture(recommendation.recommendedLecture!)}
                      >
                        Rewatch Lecture
                        <RotateCcw size={14} />
                      </Button>
                    )}
                </div>
              )}

              <LecturePlayer
                title={currentLecture.title}
                videoUrl={currentLecture.videoUrl}
                apiBaseUrl={API_BASE_URL}
                thumbnailUrl={currentLecture.thumbnailUrl}
                sourceType={currentLecture.sourceType}
                hlsMasterUrl={currentLecture.hlsMasterUrl}
                processingStatus={currentLecture.processingStatus}
                processingProgress={currentLecture.processingProgress}
                processingError={currentLecture.processingError}
                quizzes={currentLectureQuizzes}
                answeredQuizIds={answeredQuizzes}
                isActive={activeTab === lectureTab}
                onWatchProgress={(percent) => {
                  watchProgressRef.current = percent;
                }}
                onQuizAnswered={(quizId) =>
                  setAnsweredQuizzes((prev) => new Set([...prev, quizId]))
                }
                onSubmitAnswer={handleSubmitQuizAnswer}
              />
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="space-y-6">
            <SmartRecommendationCard
              recommendation={dashboardRecommendation}
              onOpenLecture={openLecture}
            />
            <StudentDashboard
              stats={{
                progress: progress?.progressPercentage || 0,
                completedLectures: progress?.completedLectures || 0,
                totalLectures: lectures.length,
                quizAvg: progress?.avgScore || 0,
                streakDays: progress?.streakDays || 0,
              }}
              onNavigate={setActiveTab}
            />
          </div>
        )}

        {activeTab === "courses" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">My Enrolled Courses</h3>
              <div className="space-y-3">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-2xl border p-4 transition-all text-left",
                      selectedCourseId === course.id
                        ? "border-accent-purple bg-accent-purple/5 ring-1 ring-accent-purple"
                        : "border-accent-purple/10 bg-accent-purple/[0.06] hover:bg-accent-purple/[0.12]"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm">
                      <GraduationCap size={20} />
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-sm font-bold text-white">{course.title}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{course.code}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              {selectedCourse ? (
                <PremiumCard
                  eyebrow="Course Content"
                  title={selectedCourse.title}
                  description={selectedCourse.description || "Start learning this subject."}
                >
                  <div className="mt-6 space-y-4">
                    {visibleLectures.map((lecture, idx) => {
                      const lectureQuizzes = quizzes.filter(q => q.lectureId === lecture.id && q.timestamp !== undefined);
                      return (
                        <div
                          key={lecture.id}
                          className="group flex items-center justify-between rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4 hover:bg-accent-purple/[0.12] transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative h-16 w-28 overflow-hidden rounded-xl bg-ink-900">
                              {resolveThumbnail(lecture) ? (
                                <img src={resolveThumbnail(lecture)!} className="h-full w-full object-cover opacity-80" alt="Video" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-purple/15 to-accent-cyan/10">
                                  <PlayCircle className="text-slate-700" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-accent-purple/[0.15]">
                                <PlayCircle className="text-white" size={32} />
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">Lecture {idx + 1}: {lecture.title}</p>
                              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock size={12} />
                                  {lecture.durationMinutes || 15} min
                                </span>
                                {lectureQuizzes.length > 0 && (
                                  <span className="flex items-center gap-1 text-accent-cyan">
                                    <FileQuestion size={12} />
                                    {lectureQuizzes.length} Quiz{lectureQuizzes.length > 1 ? "zes" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="tracking-wider"
                            onClick={() => openLecture(lecture)}
                          >
                            {currentLecture?.id === lecture.id ? "Playing" : "Watch Lecture"}
                          </Button>
                        </div>
                      );
                    })}
                    {visibleLectures.length === 0 && (
                      <div className="flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-accent-purple/10 text-slate-500">
                        No lectures published yet for this course.
                      </div>
                    )}
                  </div>
                </PremiumCard>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-3xl border-2 border-dashed border-accent-purple/10 text-slate-600">
                  Select a course to view lectures.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "exams" && (
          <MockExams
            exams={mockExams}
            answeredQuizIds={answeredQuizzes}
            onQuizAnswered={(quizId) =>
              setAnsweredQuizzes((current) => new Set(current).add(quizId))
            }
            onSubmitAnswer={handleSubmitQuizAnswer}
            onSubmitExam={handleSubmitMockExam}
          />
        )}

        {activeTab === "progress" && (
          <div className="space-y-6">
            <PremiumCard
              eyebrow="Performance Center"
              title="Detailed Subject Report"
              description="Click any subject below to focus its charts, or compare everything at once."
            >
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-4">
                  <Select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                  >
                    <option value="all">All Subjects</option>
                    {subjectReports.map((report) => (
                      <option key={report.subject} value={report.subject}>
                        {report.subject}
                      </option>
                    ))}
                  </Select>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-accent-purple/[0.06] p-5">
                      <ProgressRing
                        value={progress?.progressPercentage ?? 0}
                        label="Overall Progress"
                      />
                    </div>
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                      <div className="flex items-center gap-2">
                        <Target size={16} className="text-accent-cyan" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Average Score
                        </p>
                      </div>
                      <p className="mt-2 text-3xl font-bold text-accent-cyan">
                        {avgScoreCount}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {progress?.failedQuizzes
                          ? `${progress.failedQuizzes} quiz attempt${progress.failedQuizzes === 1 ? "" : "s"} need a retry`
                          : "Steady across your recent checkpoints"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Weak Topics
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {weakTopics.length ? (
                          weakTopics.map((topic) => (
                            <span
                              key={topic}
                              className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-600"
                            >
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                              </span>
                              {topic}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
                            No weak topics flagged
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <PremiumCard
                      eyebrow="Trend"
                      title="Weekly Progress"
                      description="A quick visual of your learning momentum."
                    >
                      <div className="mt-4 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={weeklyProgressData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "1px solid #ffffff10",
                                borderRadius: "12px",
                              }}
                              itemStyle={{ color: "#fff", fontSize: "12px" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="progress"
                              stroke="#8B5CF6"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </PremiumCard>

                    <PremiumCard
                      eyebrow="Scores"
                      title="Subject Comparison"
                      description="Current strength across your active subjects."
                    >
                      <div className="mt-4 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={visibleSubjectReports} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="subject" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                              cursor={{ fill: "rgba(124,58,237,0.06)" }}
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "1px solid #ffffff10",
                                borderRadius: "12px",
                              }}
                              itemStyle={{ color: "#fff", fontSize: "12px" }}
                            />
                            <Bar dataKey="score" radius={[6, 6, 0, 0]} animationDuration={700}>
                              {visibleSubjectReports.map((report) => (
                                <Cell
                                  key={report.subject}
                                  fill={report.score < 60 ? "#f43f5e" : report.score < 80 ? "#f59e0b" : "#06b6d4"}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </PremiumCard>
                  </div>

                  <div className="space-y-3">
                    {visibleSubjectReports.map((report) => {
                      const isFiltered = selectedSubject === report.subject;
                      const scoreTone =
                        report.score < 60
                          ? "text-rose-600"
                          : report.score < 80
                            ? "text-amber-600"
                            : "text-emerald-600";
                      return (
                        <button
                          key={report.subject}
                          type="button"
                          onClick={() =>
                            setSelectedSubject(isFiltered ? "all" : report.subject)
                          }
                          className={cn(
                            "group w-full rounded-2xl border p-4 text-left transition-all duration-200",
                            isFiltered
                              ? "border-accent-purple bg-accent-purple/[0.08] ring-1 ring-accent-purple/30"
                              : "border-accent-purple/10 bg-accent-purple/[0.06] hover:-translate-y-0.5 hover:border-accent-purple/25 hover:bg-accent-purple/[0.1] active:scale-[0.99]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">
                                  {report.subject}
                                </h4>
                                {isFiltered && (
                                  <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-purple">
                                    Focused
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                {report.recommendation}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3 text-right">
                              <p className="text-2xl font-bold text-accent-cyan">
                                {report.score}%
                              </p>
                              <ArrowRight
                                size={16}
                                className={cn(
                                  "text-slate-300 transition-all duration-200 group-hover:translate-x-0.5",
                                  scoreTone,
                                )}
                              />
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                                <span>Subject Progress</span>
                                <span>{report.progress}%</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-accent-purple/[0.06]">
                                <div
                                  className="h-2 rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan transition-[width] duration-700 ease-out"
                                  style={{ width: `${report.progress}%` }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                                <span>Quiz Readiness</span>
                                <span>{report.quizzesReady}</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-accent-purple/[0.06]">
                                <div
                                  className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-[width] duration-700 ease-out"
                                  style={{ width: `${Math.min(100, report.quizzesReady * 20)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <PremiumCard
                    eyebrow="Recommendations"
                    title="Smart Next Steps"
                    description="Action plan based on your recent learning signals."
                  >
                    <div className="space-y-3">
                      {recommendations.map((recommendation) => (
                        <div
                          key={recommendation}
                          className="flex items-start gap-3 rounded-2xl bg-accent-purple/[0.06] p-4 text-sm text-slate-600 transition-all duration-200 hover:bg-accent-purple/[0.1]"
                        >
                          <Flame
                            size={16}
                            className="mt-0.5 shrink-0 text-amber-500"
                          />
                          <span className="leading-relaxed">{recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </PremiumCard>

                  <div className="flex items-center gap-3 rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-4 text-sm text-slate-600">
                    <TrendingUp className="h-4 w-4 shrink-0 text-accent-purple" />
                    <span>
                      {progress?.streakDays
                        ? `You're on a ${progress.streakDays}-day streak — one lecture today keeps the momentum.`
                        : "Start a study streak today with one lecture or quiz."}
                    </span>
                  </div>
                </div>
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "ai-tutor" && (
          <PremiumCard eyebrow="AI Assistant" title="Personal AI Tutor" description="Ask questions about your courses or a specific lecture.">
            <div className="flex flex-col h-[600px] mt-4 rounded-3xl border border-accent-purple/10 bg-ink-900 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 max-w-[80%]",
                    msg.role === "user" ? "ml-auto flex-row-reverse" : ""
                  )}>
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      msg.role === "bot" ? "bg-accent-purple/20 text-accent-purple" : "bg-accent-cyan/20 text-accent-cyan"
                    )}>
                      {msg.role === "bot" ? <Bot size={16} /> : <UserIcon size={16} />}
                    </div>
                    <div className={cn(
                      "rounded-2xl p-4 text-sm leading-relaxed",
                      msg.role === "bot" ? "bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm border border-accent-purple/20" : "bg-accent-cyan/10 text-cyan-600 border border-accent-cyan/20"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent-purple/20 text-accent-purple flex items-center justify-center">
                      <Bot size={16} />
                    </div>
                    <div className="bg-accent-purple/[0.06] rounded-2xl p-4 flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/[0.05]0 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/[0.05]0 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/[0.05]0 animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-accent-purple/[0.06] border-t border-accent-purple/10 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {chatLectureId ? "Attached lecture" : "Select a lecture (optional)"}
                  </label>
                  <Select
                    value={chatLectureId}
                    onChange={(e) => setChatLectureId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">All lectures / ask anything</option>
                    {lectures.map((lecture) => (
                      <option key={lecture.id} value={lecture.id}>
                        {lecture.title}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Quick actions:
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!chatLectureId}
                    onClick={() =>
                      handleSendMessage(
                        chatLectureId
                          ? "Summarize the selected lecture for me"
                          : "Summarize my latest lecture for me",
                      )
                    }
                  >
                    <Sparkles size={14} className="mr-1.5" />
                    Summarize
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!chatLectureId}
                    onClick={() =>
                      handleSendMessage(
                        chatLectureId
                          ? "Give me the key notes and main takeaways from the selected lecture"
                          : "Give me the key notes and main takeaways from my latest lecture",
                      )
                    }
                  >
                    <FileQuestion size={14} className="mr-1.5" />
                    Key notes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!chatLectureId}
                    onClick={() =>
                      handleSendMessage(
                        chatLectureId
                          ? "Explain the key concepts of the selected lecture in simple terms"
                          : "Explain the key concepts of my latest lecture in simple terms",
                      )
                    }
                  >
                    <Bot size={14} className="mr-1.5" />
                    Explain concepts
                  </Button>
                </div>
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    placeholder="Type your question here..."
                    className="py-4 pl-4 pr-14"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  />
                  <Button
                    onClick={() => handleSendMessage()}
                    variant="solid"
                    size="sm"
                    className="absolute right-2 p-2"
                  >
                    <Send size={18} className="text-accent-cyan" />
                  </Button>
                </div>
              </div>
            </div>
          </PremiumCard>
        )}
      </div>
    </DashboardShell>
  );
}
