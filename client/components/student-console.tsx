"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "./dashboard-shell";
import { PremiumCard } from "./premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { preloadFaceLandmarker } from "@/lib/gaze/face-landmarker-loader";
import { getInitialTab, useTabHistory } from "@/lib/use-tab-history";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import MaintenanceScreen from "@/components/maintenance-screen";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Bot,
  Clock,
  FileQuestion,
  GraduationCap,
  PlayCircle,
  Send,
  Sparkles,
  ArrowRight,
  User as UserIcon,
  X,
  Check,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LecturePlayer, type LectureQuiz } from "@/components/lecture-player";
import { DEFAULT_ADAPTIVE_LEVEL, type AdaptiveLevel } from "@/lib/adaptive-level";
import { StudentDashboard } from "./student/student-dashboard";
import { MockExams, type MockExam } from "./student/mock-exams";
import { StudentPerformance, type PerformanceData } from "./student/student-performance";
import type { AttemptHistoryItem, SubjectStat } from "@/lib/student-performance";
import { localToday } from "@/lib/study-planner";
import { StudyPlanner } from "./student/study-planner/study-planner";
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

type AdaptiveLevels = {
  defaultLevel: AdaptiveLevel;
  levels: { courseId: string; level: AdaptiveLevel }[];
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
  // Warm up the eye-detection model in the background so it is ready by the time a lecture opens.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(preloadFaceLandmarker, 1500);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [adaptiveLevels, setAdaptiveLevels] = useState<AdaptiveLevels | null>(null);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
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
  const [performanceData, setPerformanceData] = useState<PerformanceData>({ status: "loading" });
  const performanceStale = useRef(true);

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
        apiFetch<MockExam[]>("/api/student/mock-exams"),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
        apiFetch<string[]>("/api/student/quiz/attempts/me"),
      ]);

      const [courseResult, lectureResult, quizResult, mockExamResult, progressResult, answeredResult] = results;
      // The server is the source of truth for answered quizzes; browser storage is only a fallback.
      if (answeredResult.status === "fulfilled") {
        setAnsweredQuizzes((current) => new Set([...current, ...answeredResult.value]));
      }
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
    void refreshAdaptiveLevels();
  }, [ready, isApproved, session?.email]);

  // Real per-subject stats and the student's own answer history for the Performance charts.
  const loadPerformance = async () => {
    performanceStale.current = false;
    setPerformanceData((current) => (current.status === "ready" ? current : { status: "loading" }));
    try {
      const [history, context] = await Promise.all([
        apiFetch<AttemptHistoryItem[]>("/api/student/quiz/history/me"),
        apiFetch<{ courses: SubjectStat[] }>(`/api/student/study-plans/context?today=${localToday()}`),
      ]);
      setPerformanceData({ status: "ready", history, subjects: context.courses });
    } catch {
      performanceStale.current = true;
      setPerformanceData((current) =>
        current.status === "ready" ? current : { status: "error", message: "Your results couldn't be loaded right now." },
      );
    }
  };

  useEffect(() => {
    if (activeTab === "progress" && ready && isApproved && performanceStale.current) void loadPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ready, isApproved]);

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

  // The student's level in the current lecture's course: the same level the server picks quizzes by.
  const currentAdaptiveLevel = useMemo(() => {
    if (!currentLecture || !adaptiveLevels) return null;
    const courseId = lectures.find((lecture) => lecture.id === currentLecture.id)?.courseId;
    return (
      adaptiveLevels.levels.find((item) => item.courseId === courseId)?.level ??
      adaptiveLevels.defaultLevel ??
      DEFAULT_ADAPTIVE_LEVEL
    );
  }, [adaptiveLevels, currentLecture, lectures]);

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
      performanceStale.current = true;
      setMockExams((current) => current.filter((q) => q.id !== quiz.id));
      void refreshProgress();
      void refreshQuizzes();
      // Wait for the updated level so the result screen shows the level this answer produced.
      await refreshAdaptiveLevels();
    }
    return result;
  };

  const refreshAdaptiveLevels = async () => {
    try {
      setAdaptiveLevels(await apiFetch<AdaptiveLevels>("/api/student/quiz/level/me"));
    } catch {
      // the level is only informational; keep the last known value
    }
  };

  // The server picks each checkpoint's quizzes from the student's latest scores, so re-fetch after
  // an answer to let upcoming checkpoints use the updated difficulty.
  const refreshQuizzes = async () => {
    try {
      setQuizzes(await apiFetch<Quiz[]>("/api/student/quiz/questions"));
    } catch {
      // keep the previously loaded quizzes if the refresh fails
    }
  };

  const handleSubmitMockExam = async (
    exam: MockExam,
    answers: Record<string, string>,
  ) => {
    try {
      const response = await authenticatedFetch(
        `/api/student/mock-exams/${exam.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
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
        const stored = JSON.parse(raw) as string[];
        setAnsweredQuizzes((current) => new Set([...current, ...stored]));
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

  // Practice questions available per course (approved checkpoint quizzes on its lectures).
  const quizzesByCourse = useMemo(() => {
    const courseOf = new Map(lectures.map((lecture) => [lecture.id, lecture.courseId]));
    const counts: Record<string, number> = {};
    for (const quiz of quizzes) {
      const courseId = quiz.lectureId ? courseOf.get(quiz.lectureId) : undefined;
      if (courseId) counts[courseId] = (counts[courseId] ?? 0) + 1;
    }
    return counts;
  }, [lectures, quizzes]);

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
                adaptiveLevel={currentAdaptiveLevel}
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
          <StudentPerformance
            data={performanceData}
            onRetry={() => void loadPerformance()}
            progressPercentage={progress?.progressPercentage ?? 0}
            averageScore={progress?.avgScore ?? 0}
            failedQuizzes={progress?.failedQuizzes ?? 0}
            streakDays={progress?.streakDays ?? 0}
            weakTopics={weakTopics}
            recommendations={recommendations}
            quizzesByCourse={quizzesByCourse}
          />
        )}

        {activeTab === "study-planner" && (
          <StudyPlanner
            onOpenLecture={(lectureId) => {
              const lecture = lectures.find((item) => item.id === lectureId);
              if (!lecture) return false;
              void openLecture(lecture);
              window.scrollTo({ top: 0, behavior: "smooth" });
              return true;
            }}
            onOpenMockExams={() => setActiveTab("exams")}
          />
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
