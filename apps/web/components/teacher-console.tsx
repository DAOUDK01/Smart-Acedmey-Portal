"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { usePortalLock } from "@/lib/use-portal-lock";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit,
  Eye,
  FileQuestion,
  PlusCircle,
  Search,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { TeacherDashboard } from "./teacher/teacher-dashboard";
import {
  extractTranscriptFromFile,
  extractTranscriptFromUrl,
} from "@/lib/auto-lecture";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

function getYouTubeId(url: string) {
  if (!url) return null;
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function getYouTubeThumbnail(url: string) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type Course = {
  id: string;
  teacherId: string;
  title: string;
  code: string | null;
  description?: string | null;
};

type Lecture = {
  id: string;
  courseId: string;
  videoUrl: string;
  transcript: string | null;
  title: string;
  lectureOrder: number;
  durationMinutes: number | null;
  videoProvider: string | null;
  isCheckpointLocked: boolean;
  publishedAt: string | null;
};

type QuizStatus = "pending" | "approved" | "rejected" | "edited";

type Quiz = {
  id: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  correctAnswer: string;
  topic?: string;
  lectureId?: string;
  segment?: string;
  status: QuizStatus;
  reviewedBy?: string;
  reviewComment?: string;
  createdAt?: string;
  timestamp?: number;
};

type User = {
  id: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN" | "EXPERT";
  name: string;
  email: string;
};

type StudentProgress = {
  id: string;
  studentId: string;
  avgScore: number;
  progressPercentage: number;
  completedLectures: number;
  streakDays: number;
  failedQuizzes?: number;
  weakTopics?: unknown;
  lastActivityAt?: string | null;
};

type ManualMockForm = {
  courseId: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  question: string;
  options: string;
  correctAnswer: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
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

export function TeacherConsole() {
  const { ready, session } = usePortalLock("/teacher");
  const [activeTab, setActiveTab] = useState("overview");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [publishedQuizzes, setPublishedQuizzes] = useState<Quiz[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);

  const [editingLectureId, setEditingLectureId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [lectureTitle, setLectureTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("link");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedLectureFile, setSelectedLectureFile] = useState<File | null>(
    null,
  );
  const [transcript, setTranscript] = useState("");
  const [questionCount, setQuestionCount] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Quiz review filters
  const [quizFilterDifficulty, setQuizFilterDifficulty] = useState<
    "all" | "easy" | "medium" | "hard"
  >("all");
  const [quizFilterCourse, setQuizFilterCourse] = useState<string>("all");

  const [manualMockForm, setManualMockForm] = useState<ManualMockForm>({
    courseId: "",
    difficulty: "medium",
    topic: "",
    question: "",
    options: "",
    correctAnswer: "",
  });
  const [aiMockCourseId, setAiMockCourseId] = useState("");
  const [aiMockTopic, setAiMockTopic] = useState("");
  const [aiMockQuestionCount, setAiMockQuestionCount] = useState(5);

  // Function to auto-hide status messages after 3 seconds
  const showStatusMessage = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => {
      setStatusMessage(null);
    }, 3000);
  };

  const showErrorMessage = (message: string) => {
    setError(message);
    setTimeout(() => {
      setError(null);
    }, 3000);
  };

  const loadAll = async () => {
    const [usersData, coursesData, lecturesData, quizzesData, progressData] =
      await Promise.all([
        apiFetch<User[]>("/api/admin/users"),
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/teacher/quizzes"),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
      ]);

    setUsers(usersData);
    setCourses(coursesData);
    setLectures(lecturesData);
    setPublishedQuizzes(quizzesData);
    setStudentProgress(progressData);
  };

  useEffect(() => {
    if (!ready) return;
    void loadAll().catch((err) => {
      console.error("Failed to fetch teacher data:", err);
      setError("Failed to load teacher workspace.");
    });
  }, [ready]);

  const pendingQuizzes = useMemo(
    () => publishedQuizzes.filter((quiz) => {
      if (quiz.status !== "pending") return false;

      if (quizFilterDifficulty !== "all" && quiz.difficulty !== quizFilterDifficulty) {
        return false;
      }

      if (quizFilterCourse !== "all" && quiz.lectureId) {
        const lecture = lectures.find((l) => l.id === quiz.lectureId);
        if (!lecture || lecture.courseId !== quizFilterCourse) {
          return false;
        }
      }

      return true;
    }),
    [publishedQuizzes, quizFilterDifficulty, quizFilterCourse, lectures]
  );

  const filteredStudents = useMemo(() => {
    const students = users.filter((user) => user.role === "STUDENT");
    if (!searchQuery.trim()) {
      return students;
    }
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [users, searchQuery]);

  const selectedStudent = useMemo(
    () => users.find((user) => user.id === selectedStudentId),
    [users, selectedStudentId],
  );

  const selectedStudentReport = useMemo(() => {
    if (!selectedStudent) return null;
    const progress = studentProgress.find(
      (item) =>
        item.studentId === selectedStudent.id ||
        item.studentId.toLowerCase() === selectedStudent.email.toLowerCase(),
    );
    const weakTopics = parseWeakTopics(progress?.weakTopics);
    const subjectRows = courses.slice(0, 4).map((course, index) => {
      const base = progress?.avgScore ?? 0;
      const score = Math.max(
        35,
        Math.min(99, Math.round(base - index * 4 + (progress?.streakDays ?? 0))),
      );
      return {
        subject: course.title,
        score,
        recommendation:
          score < 60
            ? "Assign revision workbook and one live follow-up session."
            : score < 80
              ? "Add one checkpoint quiz and transcript recap."
              : "Keep challenge mode active with advanced practice.",
      };
    });

    return {
      progress,
      weakTopics,
      subjectRows,
    };
  }, [selectedStudent, studentProgress, courses]);

  const handleTranscribe = async () => {
    if (!lectureTitle) {
      showErrorMessage("Please enter a lecture title first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/teacher/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lectureTitle,
          videoUrl: videoUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTranscript(data.transcript || "");
        if (data.videoUrl && !videoUrl) {
          setVideoUrl(data.videoUrl);
        }
        showStatusMessage("Transcript generated successfully.");
      } else {
        showErrorMessage("Failed to generate transcript.");
      }
    } catch {
      showErrorMessage("Failed to generate transcript.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateQuiz = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusMessage(null);
    try {
      await apiFetch("/api/teacher/quizzes/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: lectureTitle,
          transcript,
          questionCount,
          lectureId:
            courseId && lectures.filter((l) => l.courseId === courseId).length > 0
              ? lectures.find((l) => l.courseId === courseId)?.id
              : undefined,
        }),
      });
      await loadAll();
      showStatusMessage("AI quiz generated successfully.");
      setActiveTab("quizzes");
    } catch {
      showErrorMessage("Failed to generate quiz.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetLectureForm = () => {
    setEditingLectureId(null);
    setCourseId("");
    setLectureTitle("");
    setSourceMode("link");
    setVideoUrl("");
    setSelectedLectureFile(null);
    setTranscript("");
    setQuestionCount(3);
  };

  const handleSaveLecture = async () => {
    if (!courseId || !lectureTitle || !videoUrl) {
      showErrorMessage("Please complete the lecture details first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage(null);

    try {
      const url = editingLectureId
        ? `/api/admin/lectures/${editingLectureId}`
        : "/api/admin/lectures";
      const method = editingLectureId ? "PATCH" : "POST";

      await apiFetch(url, {
        method,
        body: JSON.stringify({
          courseId,
          title: lectureTitle,
          videoUrl,
          transcript,
          lectureOrder:
            lectures.filter((lecture) => lecture.courseId === courseId).length + 1,
          isCheckpointLocked: true,
        }),
      });

      await loadAll();
      showStatusMessage(
        editingLectureId
          ? "Lecture updated successfully."
          : "Lecture created successfully.",
      );
      resetLectureForm();
      if (editingLectureId) {
        setActiveTab("manage-lectures");
      }
    } catch {
      showErrorMessage("Failed to save lecture.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditLecture = (lecture: Lecture) => {
    setEditingLectureId(lecture.id);
    setCourseId(lecture.courseId);
    setLectureTitle(lecture.title);
    setVideoUrl(lecture.videoUrl);
    setTranscript(lecture.transcript ?? "");
    setSourceMode(getYouTubeId(lecture.videoUrl) ? "link" : "upload");
    setActiveTab("upload");
  };

  const handleDeleteLecture = async (lectureId: string) => {
    if (!confirm("Delete this lecture?")) {
      return;
    }
    try {
      await apiFetch(`/api/admin/lectures/${lectureId}`, { method: "DELETE" });
      await loadAll();
      showStatusMessage("Lecture deleted successfully.");
    } catch {
      showErrorMessage("Failed to delete lecture.");
    }
  };

  const handleReview = async (quizId: string, action: "approve" | "reject") => {
    try {
      await apiFetch(`/api/teacher/quizzes/${quizId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reviewedBy: session?.name ?? "Teacher" }),
      });
      await loadAll();
      showStatusMessage(
        action === "approve"
          ? "Quiz approved successfully."
          : "Quiz rejected successfully.",
      );
    } catch {
      showErrorMessage(`Failed to ${action} quiz.`);
    }
  };

  const handleCreateManualMock = async () => {
    const options = manualMockForm.options
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);

    if (
      !manualMockForm.courseId ||
      !manualMockForm.question ||
      options.length < 2 ||
      !manualMockForm.correctAnswer
    ) {
      showErrorMessage("Complete the manual mock exam form before saving.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const courseLecture = lectures.find(
        (lecture) => lecture.courseId === manualMockForm.courseId,
      );

      await apiFetch("/api/teacher/quizzes", {
        method: "POST",
        body: JSON.stringify({
          lectureId: courseLecture?.id,
          topic: manualMockForm.topic || "Mock Exam",
          question: manualMockForm.question,
          options,
          correctAnswer: manualMockForm.correctAnswer,
          difficulty: manualMockForm.difficulty,
          status: "pending",
        }),
      });

      await loadAll();
      setManualMockForm({
        courseId: "",
        difficulty: "medium",
        topic: "",
        question: "",
        options: "",
        correctAnswer: "",
      });
      showStatusMessage("Manual mock exam question created.");
    } catch {
      showErrorMessage("Failed to create manual mock exam.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAiMock = async () => {
    if (!aiMockCourseId) {
      showErrorMessage("Choose a course first.");
      return;
    }

    const courseLectures = lectures.filter(
      (lecture) => lecture.courseId === aiMockCourseId,
    );
    const combinedTranscript = courseLectures
      .map((lecture) => lecture.transcript ?? "")
      .join("\n\n")
      .trim();

    if (!combinedTranscript) {
      showErrorMessage(
        "This course has no lecture transcript yet. Generate one before building an AI mock exam.",
      );
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      await apiFetch("/api/teacher/quizzes/generate", {
        method: "POST",
        body: JSON.stringify({
          topic:
            aiMockTopic ||
            courses.find((course) => course.id === aiMockCourseId)?.title ||
            "Mock Exam",
          transcript: combinedTranscript,
          questionCount: aiMockQuestionCount,
          lectureId: courseLectures[0]?.id,
        }),
      });
      await loadAll();
      showStatusMessage("AI mock exam questions generated.");
    } catch {
      showErrorMessage("Failed to generate AI mock exam.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) return null;

  return (
    <DashboardShell
      role="teacher"
      title={`Welcome back, ${session?.name || "Teacher"}`}
      subtitle="Manage lecture delivery, build mock exams, and track every learner."
      activeTab={activeTab}
      onTabChange={setActiveTab}
      session={session ?? undefined}
    >
      <div className="flex flex-col gap-6">
        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {statusMessage}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {activeTab === "overview" ? (
          <TeacherDashboard
            stats={{
              totalStudents: users.filter((user) => user.role === "STUDENT")
                .length,
              activeStudents: studentProgress.length,
              totalCourses: courses.length,
              totalLectures: lectures.length,
              avgQuizScore: Math.round(
                studentProgress.reduce(
                  (total, item) => total + item.avgScore,
                  0,
                ) / (studentProgress.length || 1),
              ),
            }}
          />
        ) : null}

        {activeTab === "upload" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <PremiumCard
              eyebrow="Lecture Builder"
              title={editingLectureId ? "Edit Lecture" : "Create New Lecture"}
              description="Upload a recording or connect a YouTube lecture."
            >
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Course Selection
                  </label>
                  <select
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  >
                    <option value="">Choose a course...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Lecture Title
                  </label>
                  <input
                    type="text"
                    value={lectureTitle}
                    onChange={(event) => setLectureTitle(event.target.value)}
                    placeholder="e.g. Introduction to Derivatives"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setSourceMode("link")}
                    className={cn(
                      "rounded-xl border py-3 text-sm font-medium transition-all",
                      sourceMode === "link"
                        ? "border-accent-purple bg-accent-purple/10 text-white"
                        : "border-white/10 bg-white/5 text-slate-400",
                    )}
                  >
                    YouTube Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("upload")}
                    className={cn(
                      "rounded-xl border py-3 text-sm font-medium transition-all",
                      sourceMode === "upload"
                        ? "border-accent-purple bg-accent-purple/10 text-white"
                        : "border-white/10 bg-white/5 text-slate-400",
                    )}
                  >
                    File Upload
                  </button>
                </div>

                {sourceMode === "link" ? (
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept="video/*"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      onChange={(event) =>
                        setSelectedLectureFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/5 py-8 text-sm transition-all hover:border-accent-purple/50 hover:bg-white/10">
                      <PlusCircle className="h-5 w-5 text-accent-purple" />
                      <span className="font-medium text-slate-300">
                        {selectedLectureFile
                          ? selectedLectureFile.name
                          : videoUrl && !videoUrl.startsWith("http")
                            ? "Uploaded video linked"
                            : "Click to upload lecture video"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleTranscribe}
                    className="flex-1 rounded-xl bg-white/10 py-3 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-white/20 disabled:opacity-50"
                  >
                    {isProcessing ? "Processing..." : "Extract Transcript"}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing || !transcript}
                    onClick={handleGenerateQuiz}
                    className="flex-1 rounded-xl bg-accent-purple py-3 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-accent-purple/90 disabled:opacity-50"
                  >
                    {isProcessing ? "Generating..." : "Generate AI Quiz"}
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isProcessing || !lectureTitle}
                    onClick={handleSaveLecture}
                    className="flex-1 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-4 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-purple/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isProcessing
                      ? "Saving..."
                      : editingLectureId
                        ? "Update Lecture"
                        : "Save & Upload Lecture"}
                  </button>
                  {editingLectureId ? (
                    <button
                      type="button"
                      onClick={resetLectureForm}
                      className="rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </PremiumCard>

            <PremiumCard
              eyebrow="Preview"
              title="Lecture Preview"
              description="Check video source and transcript quality before publishing."
            >
              <div className="space-y-4">
                {sourceMode === "link" && getYouTubeThumbnail(videoUrl) ? (
                  <div className="aspect-video overflow-hidden rounded-2xl bg-ink-900">
                    <img
                      src={getYouTubeThumbnail(videoUrl) ?? ""}
                      alt="Lecture thumbnail"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-2xl border-2 border-dashed border-white/5 bg-ink-900">
                    <Video className="h-12 w-12 text-slate-700" />
                  </div>
                )}

                <div className="rounded-2xl bg-white/5 p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Transcript Preview
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {transcript || "No transcript generated yet."}
                  </p>
                </div>
              </div>
            </PremiumCard>
          </div>
        ) : null}

        {activeTab === "manage-lectures" ? (
          <PremiumCard
            eyebrow="Content"
            title="Manage Lectures"
            description="Update titles, inspect delivery order, or remove old recordings."
          >
            <div className="space-y-4">
              {lectures.map((lecture) => {
                const course = courses.find((item) => item.id === lecture.courseId);
                return (
                  <div
                    key={lecture.id}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 transition-all hover:bg-white/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
                        <Video size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {lecture.title}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {course?.title || "Unknown Course"} · Lecture{" "}
                          {lecture.lectureOrder}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditLecture(lecture)}
                        className="rounded-lg bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLecture(lecture.id)}
                        className="rounded-lg bg-white/5 p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {lectures.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-white/5 py-12 text-center text-slate-500">
                  No lectures found. Start by uploading one.
                </div>
              ) : null}
            </div>
          </PremiumCard>
        ) : null}

        {activeTab === "courses" ? (
          <PremiumCard
            eyebrow="Curriculum"
            title="My Courses"
            description="Open a course card to inspect lecture details, transcript snippets, and delivery order."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {courses.map((course) => {
                const courseLectures = lectures.filter(
                  (lecture) => lecture.courseId === course.id,
                );
                const isExpanded = expandedCourseId === course.id;

                return (
                  <div
                    key={course.id}
                    className="rounded-[28px] border border-white/5 bg-white/5 p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-purple/10 text-accent-purple">
                          <BookOpen size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white">
                          {course.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {course.code || "No Course Code"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCourseId(isExpanded ? null : course.id)
                        }
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10"
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? "Hide" : "View"} Details
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </button>
                    </div>

                    <div className="mt-6 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
                      <span>{courseLectures.length} lectures</span>
                      <span>
                        {courseLectures.filter((lecture) => lecture.publishedAt).length}{" "}
                        published
                      </span>
                    </div>

                    {isExpanded ? (
                      <div className="mt-5 space-y-3">
                        {courseLectures.map((lecture) => (
                          <div
                            key={lecture.id}
                            className="rounded-2xl border border-white/5 bg-ink-900/50 p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h4 className="text-sm font-bold text-white">
                                  Lecture {lecture.lectureOrder}: {lecture.title}
                                </h4>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Clock3 size={12} />
                                    {lecture.durationMinutes ?? 15} min
                                  </span>
                                  <span>{lecture.videoProvider || "Direct upload"}</span>
                                  <span>
                                    {lecture.publishedAt ? "Published" : "Pending review"}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEditLecture(lecture)}
                                className="rounded-lg bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                              >
                                <Edit size={16} />
                              </button>
                            </div>
                            <p className="mt-3 line-clamp-3 text-sm text-slate-300">
                              {lecture.transcript || "Transcript not generated yet."}
                            </p>
                          </div>
                        ))}
                        {courseLectures.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                            No lecture has been added to this course yet.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </PremiumCard>
        ) : null}

        {activeTab === "quizzes" ? (
          <PremiumCard
            eyebrow="Review"
            title="Pending Quiz Reviews"
            description="Approve or reject AI-generated questions before they reach students."
          >
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Filter by Difficulty
                </label>
                <select
                  value={quizFilterDifficulty}
                  onChange={(e) => setQuizFilterDifficulty(e.target.value as any)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                >
                  <option value="all">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Filter by Course
                </label>
                <select
                  value={quizFilterCourse}
                  onChange={(e) => setQuizFilterCourse(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                >
                  <option value="all">All Courses</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {pendingQuizzes.map((quiz) => {
                const lecture = quiz.lectureId ? lectures.find((l) => l.id === quiz.lectureId) : null;
                const course = lecture ? courses.find((c) => c.id === lecture.courseId) : null;

                return (
                  <div
                    key={quiz.id}
                    className="rounded-2xl border border-white/5 bg-white/5 p-6"
                  >
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                          quiz.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-300" :
                            quiz.difficulty === "medium" ? "bg-amber-500/10 text-amber-300" :
                              "bg-rose-500/10 text-rose-300"
                        )}>{quiz.difficulty}</span>
                        {quiz.segment ? (
                          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">{quiz.segment}</span>
                        ) : null}
                        {quiz.timestamp ? (
                          <span className="rounded-full bg-accent-purple/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-purple">{formatTime(quiz.timestamp)}</span>
                        ) : null}
                        {course ? (
                          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">{course.title}</span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReview(quiz.id, "approve")}
                          className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(quiz.id, "reject")}
                          className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                    <p className="text-lg font-medium text-white">{quiz.question}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {quiz.options.map((option, index) => (
                        <div
                          key={index}
                          className={cn(
                            "rounded-xl border border-white/5 bg-white/5 p-3 text-sm",
                            option === quiz.correctAnswer ? "border-emerald-500/50 bg-emerald-500/5 text-white" : "text-slate-400",
                          )}
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {pendingQuizzes.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-white/5 text-slate-500">
                  {publishedQuizzes.filter(q => q.status === "pending").length === 0 ? "No pending quizzes to review." : "No quizzes match the selected filters."}
                </div>
              ) : null}
            </div>
          </PremiumCard>
        ) : null}

        {activeTab === "mockups" ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <PremiumCard
                eyebrow="Manual Builder"
                title="Create Mock Exam Question"
                description="Create teacher-authored mock questions and send them through the same review flow."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <select
                    value={manualMockForm.courseId}
                    onChange={(event) =>
                      setManualMockForm((current) => ({
                        ...current,
                        courseId: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  >
                    <option value="">Choose course...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={manualMockForm.difficulty}
                    onChange={(event) =>
                      setManualMockForm((current) => ({
                        ...current,
                        difficulty: event.target.value as ManualMockForm["difficulty"],
                      }))
                    }
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <input
                  value={manualMockForm.topic}
                  onChange={(event) =>
                    setManualMockForm((current) => ({
                      ...current,
                      topic: event.target.value,
                    }))
                  }
                  placeholder="Topic or subject"
                  className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                />
                <textarea
                  value={manualMockForm.question}
                  onChange={(event) =>
                    setManualMockForm((current) => ({
                      ...current,
                      question: event.target.value,
                    }))
                  }
                  placeholder="Write the mock exam question"
                  className="mt-4 h-32 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                />
                <textarea
                  value={manualMockForm.options}
                  onChange={(event) =>
                    setManualMockForm((current) => ({
                      ...current,
                      options: event.target.value,
                    }))
                  }
                  placeholder={"Options, one per line\nOption A\nOption B\nOption C"}
                  className="mt-4 h-32 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                />
                <input
                  value={manualMockForm.correctAnswer}
                  onChange={(event) =>
                    setManualMockForm((current) => ({
                      ...current,
                      correctAnswer: event.target.value,
                    }))
                  }
                  placeholder="Correct answer exactly as written above"
                  className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateManualMock}
                  disabled={isProcessing}
                  className="mt-4 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan px-6 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
                >
                  Save Manual Mock Question
                </button>
              </PremiumCard>

              <PremiumCard
                eyebrow="AI Builder"
                title="Generate Mock Exam Set"
                description="Use the lecture transcripts already in the course to generate a mock exam set."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <select
                    value={aiMockCourseId}
                    onChange={(event) => setAiMockCourseId(event.target.value)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  >
                    <option value="">Choose course...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={aiMockQuestionCount}
                    onChange={(event) =>
                      setAiMockQuestionCount(Number(event.target.value))
                    }
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                  />
                </div>
                <input
                  value={aiMockTopic}
                  onChange={(event) => setAiMockTopic(event.target.value)}
                  placeholder="Optional custom exam topic"
                  className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-accent-purple/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateAiMock}
                  disabled={isProcessing}
                  className="mt-4 rounded-xl bg-accent-purple px-6 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
                >
                  Generate AI Mock Exam
                </button>
              </PremiumCard>
            </div>

            <PremiumCard
              eyebrow="Recent Output"
              title="Mock Exam Queue"
              description="Latest manual and AI-generated questions ready for review."
            >
              <div className="space-y-3">
                {publishedQuizzes.slice(0, 8).map((quiz) => (
                  <div
                    key={quiz.id}
                    className="rounded-2xl border border-white/5 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                        {quiz.status}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                        {quiz.topic || "Mock Exam"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">
                      {quiz.question}
                    </p>
                  </div>
                ))}
                {publishedQuizzes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                    No mock exam questions created yet.
                  </div>
                ) : null}
              </div>
            </PremiumCard>
          </div>
        ) : null}

        {activeTab === "analytics" ? (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search students by name or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white focus:border-accent-purple/50 focus:outline-none"
              />
            </div>

            <PremiumCard
              eyebrow="Performance"
              title="Student Directory"
              description="Open any learner card to inspect a deeper academic report."
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map((student) => {
                  const progress = studentProgress.find(
                    (item) =>
                      item.studentId === student.id ||
                      item.studentId.toLowerCase() ===
                        student.email.toLowerCase(),
                  );
                  return (
                    <div
                      key={student.id}
                      className="rounded-3xl border border-white/5 bg-white/5 p-6 transition-all hover:bg-white/10"
                    >
                      <div className="mb-4 flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple to-accent-cyan font-bold text-white">
                          {student.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="truncate text-sm font-bold text-white">
                            {student.name}
                          </h4>
                          <p className="truncate text-xs text-slate-500">
                            {student.email}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Avg Score
                          </p>
                          <p className="mt-1 text-lg font-bold text-accent-cyan">
                            {progress?.avgScore ?? 0}%
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Progress
                          </p>
                          <p className="mt-1 text-lg font-bold text-accent-purple">
                            {progress?.progressPercentage ?? 0}%
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentId(student.id)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10"
                      >
                        <Eye size={14} />
                        View Detailed Report
                      </button>
                    </div>
                  );
                })}
              </div>
              {filteredStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  No students found matching your search.
                </div>
              ) : null}
            </PremiumCard>

            {selectedStudent && selectedStudentReport ? (
              <PremiumCard
                eyebrow="Detailed Report"
                title={`${selectedStudent.name} Performance Review`}
                description="Subject-level view, identified weak points, and next-step recommendations."
              >
                <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Overall Snapshot
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <div>
                          <p className="text-xs text-slate-400">Progress</p>
                          <p className="text-2xl font-bold text-white">
                            {selectedStudentReport.progress?.progressPercentage ?? 0}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Average Score</p>
                          <p className="text-2xl font-bold text-white">
                            {selectedStudentReport.progress?.avgScore ?? 0}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Study Streak</p>
                          <p className="text-2xl font-bold text-white">
                            {selectedStudentReport.progress?.streakDays ?? 0} days
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Weak Topics
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedStudentReport.weakTopics.length ? (
                          selectedStudentReport.weakTopics.map((topic) => (
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

                  <div className="space-y-3">
                    {selectedStudentReport.subjectRows.map((row) => (
                      <div
                        key={row.subject}
                        className="rounded-2xl border border-white/5 bg-white/5 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-bold text-white">
                              {row.subject}
                            </h4>
                            <p className="mt-1 text-xs text-slate-400">
                              {row.recommendation}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-widest text-slate-500">
                              Score
                            </p>
                            <p className="text-2xl font-bold text-accent-cyan">
                              {row.score}%
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
                            style={{ width: `${row.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PremiumCard>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
