"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "./dashboard-shell";
import { PremiumCard } from "./premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Bot,
  Clock,
  FileQuestion,
  GraduationCap,
  PlayCircle,
  Send,
  User as UserIcon,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { MockExams } from "./student/mock-exams";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

type Course = {
  id: string;
  teacherId: string;
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

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

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

export function StudentConsole() {
  const { ready, session, isApproved } = usePortalLock("/student");
  const [activeTab, setActiveTab] = useState("overview");
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [currentLecture, setCurrentLecture] = useState<Lecture | null>(null);
  const [answeredQuizzes, setAnsweredQuizzes] = useState<Set<string>>(new Set());

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "bot",
      content: "Hi! I'm your AI Tutor. Ask me anything about your courses or a specific lecture.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!ready || !isApproved) return;
    const loadData = async () => {
      try {
        const [courseData, lectureData, quizData, progressData] = await Promise.all([
          apiFetch<Course[]>("/api/admin/courses"),
          apiFetch<Lecture[]>("/api/admin/lectures"),
          apiFetch<Quiz[]>("/api/student/quiz/questions"),
          apiFetch<StudentProgress[]>("/api/guardian/progress"),
        ]);
        const publishedCourses = courseData.filter(c => c.isPublished);
        const publishedLectures = lectureData.filter((lecture) => lecture.publishedAt);
        setCourses(publishedCourses);
        setLectures(publishedLectures);
        setQuizzes(quizData);

        const myProgress = progressData.find(
          (item) => item.studentId === session?.email || item.studentId.toLowerCase() === session?.email?.toLowerCase(),
        );
        setProgress(myProgress || null);

        if (publishedCourses.length > 0) {
          setSelectedCourseId(publishedCourses[0].id);
        }
      } catch (err) {
        console.error("Failed to load student data", err);
      }
    };
    loadData();
  }, [ready, isApproved, session?.email]);

  const currentLectureQuizzes = useMemo(() => {
    if (!currentLecture) return [];
    return quizzes
      .filter((q) => q.lectureId === currentLecture.id && typeof q.timestamp === "number")
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [quizzes, currentLecture]);

  const handleSubmitQuizAnswer = async (quiz: LectureQuiz, answer: string) => {
    const response = await fetch(`${API_BASE_URL}/api/teacher/quizzes/${quiz.id}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: session?.email || "student",
        answer,
        responseTime: 5,
      }),
    });

    if (!response.ok) return null;
    return (await response.json()) as {
      passed: boolean;
      correctAnswer: string;
      explanation: string;
    };
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);

    const weakTopics = parseWeakTopics(progress?.weakTopics);
    const focusArea = weakTopics[0] || courses.find((course) => course.id === selectedCourseId)?.title || "your current coursework";

    window.setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: `For "${userMsg}", start with ${focusArea}. Review the latest lecture, then open the Performance tab to check which subject needs the most attention.`,
        },
      ]);
      setIsTyping(false);
    }, 900);
  };

  const selectedCourse = useMemo(() => courses.find((course) => course.id === selectedCourseId), [courses, selectedCourseId]);
  const visibleLectures = useMemo(() => lectures.filter((lecture) => lecture.courseId === selectedCourseId), [lectures, selectedCourseId]);

  const weakTopics = useMemo(() => parseWeakTopics(progress?.weakTopics), [progress]);

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm sm:p-8">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-ink-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/5 p-4 sm:px-6">
                <h3 className="text-lg font-bold text-white truncate pr-8">{currentLecture.title}</h3>
                <button
                  onClick={() => {
                    setCurrentLecture(null);
                    setAnsweredQuizzes(new Set());
                  }}
                  className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                  aria-label="Close lecture player"
                >
                  <X size={20} />
                </button>
              </div>

              <LecturePlayer
                title={currentLecture.title}
                videoUrl={currentLecture.videoUrl}
                apiBaseUrl={API_BASE_URL}
                quizzes={currentLectureQuizzes}
                answeredQuizIds={answeredQuizzes}
                onQuizAnswered={(quizId) =>
                  setAnsweredQuizzes((prev) => new Set([...prev, quizId]))
                }
                onSubmitAnswer={handleSubmitQuizAnswer}
              />
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <StudentDashboard
            stats={{
              progress: progress?.progressPercentage || 0,
              completedLectures: progress?.completedLectures || 0,
              totalLectures: lectures.length,
              quizAvg: progress?.avgScore || 0,
              streakDays: progress?.streakDays || 0,
            }}
          />
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
                        : "border-white/5 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
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
                          className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative h-16 w-28 overflow-hidden rounded-xl bg-ink-900">
                              {getYouTubeThumbnail(lecture.videoUrl) ? (
                                <img src={getYouTubeThumbnail(lecture.videoUrl)!} className="h-full w-full object-cover opacity-80" alt="Video" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-white/5">
                                  <PlayCircle className="text-slate-700" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-ink-950/40">
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
                            onClick={() => {
                              setCurrentLecture(lecture);
                              setAnsweredQuizzes(new Set());
                            }}
                          >
                            {currentLecture?.id === lecture.id ? "Playing" : "Watch Lecture"}
                          </Button>
                        </div>
                      );
                    })}
                    {visibleLectures.length === 0 && (
                      <div className="flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-white/5 text-slate-500">
                        No lectures published yet for this course.
                      </div>
                    )}
                  </div>
                </PremiumCard>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-3xl border-2 border-dashed border-white/5 text-slate-600">
                  Select a course to view lectures.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "exams" && <MockExams />}

        {activeTab === "progress" && (
          <div className="space-y-6">
            <PremiumCard
              eyebrow="Performance Center"
              title="Detailed Subject Report"
              description="Filter by subject to inspect progress, score trends, and recommendations."
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
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Overall Progress
                      </p>
                      <p className="mt-2 text-3xl font-bold text-white">
                        {progress?.progressPercentage ?? 0}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Average Score
                      </p>
                      <p className="mt-2 text-3xl font-bold text-accent-cyan">
                        {progress?.avgScore ?? 0}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Weak Topics
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {weakTopics.length ? (
                          weakTopics.map((topic) => (
                            <span
                              key={topic}
                              className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-300"
                            >
                              {topic}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
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
                          <BarChart data={visibleSubjectReports}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="subject" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "1px solid #ffffff10",
                                borderRadius: "12px",
                              }}
                              itemStyle={{ color: "#fff", fontSize: "12px" }}
                            />
                            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
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

                  <div className="space-y-4">
                    {visibleSubjectReports.map((report) => (
                      <div
                        key={report.subject}
                        className="rounded-2xl border border-white/5 bg-white/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-bold text-white">{report.subject}</h4>
                            <p className="mt-1 text-xs text-slate-400">
                              {report.recommendation}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-widest text-slate-500">
                              Score
                            </p>
                            <p className="text-2xl font-bold text-accent-cyan">
                              {report.score}%
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                              <span>Subject Progress</span>
                              <span>{report.progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/5">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
                                style={{ width: `${report.progress}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                              <span>Quiz Readiness</span>
                              <span>{report.quizzesReady}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/5">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                                style={{ width: `${Math.min(100, report.quizzesReady * 20)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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
                          className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300"
                        >
                          {recommendation}
                        </div>
                      ))}
                    </div>
                  </PremiumCard>
                </div>
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === "ai-tutor" && (
          <PremiumCard eyebrow="AI Assistant" title="Personal AI Tutor" description="Ask questions about your courses.">
            <div className="flex flex-col h-[600px] mt-4 rounded-3xl border border-white/5 bg-ink-900 overflow-hidden">
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
                      msg.role === "bot" ? "bg-white/5 text-slate-300" : "bg-accent-cyan/10 text-white border border-accent-cyan/20"
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
                    <div className="bg-white/5 rounded-2xl p-4 flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-white/5 border-t border-white/5">
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
                    onClick={handleSendMessage}
                    variant="solid"
                    size="sm"
                    className="absolute right-2 p-2"
                  >
                    <Send size={18} />
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
