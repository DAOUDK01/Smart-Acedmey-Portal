"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PremiumCard } from "@/components/premium-card";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { usePortalLock } from "@/lib/use-portal-lock";
import { getInitialTab, useTabHistory } from "@/lib/use-tab-history";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit,
  Eye,
  FileQuestion,
  Hourglass,
  Layers,
  Link2,
  Loader2,
  PlusCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { TeacherDashboard } from "./teacher/teacher-dashboard";
import { PendingApprovalBanner } from "@/components/pending-approval-banner";
import { AdaptiveLearningInfo, AdaptiveLearningStatus } from "@/components/adaptive-learning-info";
import {
  DEFAULT_ADAPTIVE_LEVEL,
  LEVEL_BADGE_CLASS,
  formatLevel,
  type AdaptiveLevel,
} from "@/lib/adaptive-level";
import MaintenanceScreen from "@/components/maintenance-screen";
import { isQuizStatus, type QuizStatus } from "@/lib/quiz-utils";
import {
  formatTimestampInput,
  parseTimestampInput,
  splitTranscriptIntoSegments,
  type LectureSegment,
} from "@/lib/transcript-segments";
import { extractTranscriptFromFile, readMediaDurationSeconds } from "@/lib/auto-lecture";
import { API_BASE_URL, apiFetch, authenticatedFetch } from "@/lib/api";

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

const formatTime = formatTimestampInput;

type Course = {
  id: string;
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
  sourceType?: string | null;
  hlsMasterUrl?: string | null;
  thumbnailUrl?: string | null;
  processingStatus?: string | null;
  processingProgress?: number | null;
  processingError?: string | null;
  checkpoints?: {
    id: string;
    title: string;
    timestamp: number;
    sortOrder: number;
  }[];
};

type LectureProcessingStatus = {
  id: string;
  processingStatus: string | null;
  processingProgress: number | null;
  processingError: string | null;
  hlsMasterUrl: string | null;
  thumbnailUrl: string | null;
};

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
  /** Set only on questions written by the AI generator. */
  aiPrompt?: string | null;
};

type AiGenerationResult =
  | {
      ok: true;
      kind: "exam-published" | "exam-review" | "questions";
      title?: string;
      examId?: string;
      questions: Quiz[];
      publishError?: string;
    }
  | { ok: false; kind: "exam" | "questions"; error: string };

type User = {
  id: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
  name: string;
  email: string;
};

/** A student's adaptive level per course, as the server uses it to pick their quizzes. */
type StudentAdaptiveLevels = {
  studentId: string;
  levels: { courseId: string; level: AdaptiveLevel; averageScore: number; attempts: number }[];
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

type TeacherAssignment = {
  id: string;
  sectionId: string;
  courseId: string;
  isActive: boolean;
  courseTitle: string;
  courseCode: string | null;
  className?: string;
  classCode?: string;
  sectionName?: string;
};

type ManualMockForm = {
  courseId: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  question: string;
  options: string;
  correctAnswer: string;
};

type TeacherMockExam = {
  id: string;
  title: string;
  description?: string | null;
  courseId?: string | null;
  durationSeconds?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: string;
  publishedAt?: string | null;
  createdAt?: string;
  questionCount: number;
  questions?: { id: string; question: string; status: string }[];
};

type MockExamFormState = {
  title: string;
  description: string;
  courseId: string;
  hasTimer: boolean;
  durationMinutes: string;
  hasTimeFrame: boolean;
  startsAt: string;
  endsAt: string;
  questionIds: string[];
};

// `datetime-local` inputs hold local wall-clock time; toISOString() would put UTC in the field and
// shift the exam window by the timezone offset every time an exam is edited and saved.
function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ExamDisplayStatus = "live" | "scheduled" | "draft" | "ended";

const EXAM_SECTION_ORDER: ExamDisplayStatus[] = ["live", "scheduled", "draft", "ended"];

const EXAM_STATUS_STYLES: Record<
  ExamDisplayStatus,
  { label: string; hint: string; text: string; badge: string; border: string }
> = {
  live: {
    label: "Live",
    hint: "Students can take these now.",
    text: "text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25",
    border: "border-l-emerald-500",
  },
  scheduled: {
    label: "Scheduled",
    hint: "Published, opening for students later.",
    text: "text-accent-cyan",
    badge: "bg-accent-cyan/10 text-accent-cyan ring-accent-cyan/25",
    border: "border-l-accent-cyan",
  },
  draft: {
    label: "Drafts",
    hint: "Not visible to students until published.",
    text: "text-amber-600",
    badge: "bg-amber-500/10 text-amber-600 ring-amber-500/25",
    border: "border-l-amber-500",
  },
  ended: {
    label: "Ended",
    hint: "The availability window has closed.",
    text: "text-slate-500",
    badge: "bg-slate-500/10 text-slate-500 ring-slate-500/25",
    border: "border-l-slate-400",
  },
};

function getExamDisplayStatus(exam: TeacherMockExam, now: number): ExamDisplayStatus {
  if (exam.status !== "published") return "draft";
  if (exam.endsAt && new Date(exam.endsAt).getTime() < now) return "ended";
  if (exam.startsAt && new Date(exam.startsAt).getTime() > now) return "scheduled";
  return "live";
}

function formatExamWindow(exam: TeacherMockExam) {
  const format = (value: string) =>
    new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (exam.startsAt && exam.endsAt) return `${format(exam.startsAt)} - ${format(exam.endsAt)}`;
  if (exam.startsAt) return `Opens ${format(exam.startsAt)}`;
  if (exam.endsAt) return `Until ${format(exam.endsAt)}`;
  return "Always open";
}

function QuestionStatusBadge({ status }: { status: QuizStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ring-1 ring-inset",
        isQuizStatus(status, "pending")
          ? "bg-amber-500/10 text-amber-600 ring-amber-500/25"
          : isQuizStatus(status, "approved")
            ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25"
            : isQuizStatus(status, "rejected")
              ? "bg-rose-500/10 text-rose-600 ring-rose-500/25"
              : "bg-accent-purple/[0.06] text-slate-600 ring-accent-purple/15",
      )}
    >
      {status}
    </span>
  );
}

// Matches the server's transcript limit for quiz generation.
const AI_TRANSCRIPT_LIMIT = 60_000;

const EMPTY_EXAM_FORM: MockExamFormState = {
  title: "",
  description: "",
  courseId: "",
  hasTimer: true,
  durationMinutes: "10",
  hasTimeFrame: false,
  startsAt: "",
  endsAt: "",
  questionIds: [],
};

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

/** mm:ss field that lets the teacher type freely and only commits a parsed value on blur or Enter. */
function CheckpointTimeInput({
  seconds,
  onCommit,
}: {
  seconds: number;
  onCommit: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(formatTimestampInput(seconds));
  useEffect(() => setDraft(formatTimestampInput(seconds)), [seconds]);

  const commit = () => {
    const parsed = parseTimestampInput(draft);
    if (parsed > 0 && parsed !== seconds) onCommit(parsed);
    else setDraft(formatTimestampInput(seconds));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder="mm:ss"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
      className="mt-2 px-3 py-2"
    />
  );
}

export function TeacherConsole() {
  const { ready, session, isApproved, maintenance } = usePortalLock("/teacher");
  const [activeTab, setActiveTab] = useState(() => getInitialTab("overview"));
  // Tab the teacher tried to open while the Upload Lecture form had unsaved work; shows the leave dialog.
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtractingTranscript, setIsExtractingTranscript] = useState(false);
  // Bumped to remount the native file picker, which is the only way to clear its selected file.
  const [fileInputKey, setFileInputKey] = useState(0);
  // Every question generated for the lecture being built; all of them are linked to it on save.
  const [pendingDraftQuizIds, setPendingDraftQuizIds] = useState<string[]>([]);
  // Drafts already approved/rejected in Quiz Review (kept in pendingDraftQuizIds so they still get linked).
  const [reviewedDraftQuizIds, setReviewedDraftQuizIds] = useState<string[]>([]);
  // While true, Quiz Review shows only this lecture's freshly generated questions.
  const [quizReviewDraftOnly, setQuizReviewDraftOnly] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [publishedQuizzes, setPublishedQuizzes] = useState<Quiz[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
  const [adaptiveLevels, setAdaptiveLevels] = useState<StudentAdaptiveLevels[]>([]);
  const [myAssignments, setMyAssignments] = useState<TeacherAssignment[]>([]);

  const [editingLectureId, setEditingLectureId] = useState<string | null>(null);
  const [savedLecture, setSavedLecture] = useState<{
    id: string;
    courseId: string;
    title: string;
    videoUrl: string;
  } | null>(null);
  const [courseId, setCourseId] = useState("");
  const [lectureTitle, setLectureTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("link");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedLectureFile, setSelectedLectureFile] = useState<File | null>(
    null,
  );
  const [transcript, setTranscript] = useState("");
  const [questionCount, setQuestionCount] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(10);
  // Exact length read from the uploaded file; null means the teacher-entered minutes are used.
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [isDetectingDuration, setIsDetectingDuration] = useState(false);
  const [durationLookupFailed, setDurationLookupFailed] = useState(false);
  const lectureDurationSeconds = videoDurationSeconds ?? durationMinutes * 60;
  const [lectureSegments, setLectureSegments] = useState<LectureSegment[]>([]);
  const segmentsTouchedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Quiz review filters
  const [quizFilterDifficulty, setQuizFilterDifficulty] = useState<
    "all" | "easy" | "medium" | "hard"
  >("all");
  const [quizFilterCourse, setQuizFilterCourse] = useState<string>("all");
  const [quizFilterLecture, setQuizFilterLecture] = useState<string>("all");
  const [quizFilterSegment, setQuizFilterSegment] = useState<string>("all");

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
  const [aiResult, setAiResult] = useState<AiGenerationResult | null>(null);
  // Questions from the most recent generation, highlighted in the AI question list.
  const [latestAiQuestionIds, setLatestAiQuestionIds] = useState<string[]>([]);
  const [aiExamForm, setAiExamForm] = useState({
    courseId: "",
    title: "",
    topic: "",
    questionCount: 10,
    hasTimer: false,
    durationMinutes: "15",
  });
  const [mockExams, setMockExams] = useState<TeacherMockExam[]>([]);
  const [examForm, setExamForm] = useState<MockExamFormState>(EMPTY_EXAM_FORM);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [mockView, setMockView] = useState<"exams" | "builder" | "ai" | "questions">("exams");
  const [examFilter, setExamFilter] = useState<"all" | ExamDisplayStatus>("all");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionStatusFilter, setQuestionStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [teacherChartStats, setTeacherChartStats] = useState<{
    performanceData: { name: string; score: number }[];
    studentActivityData: { name: string; active: number }[];
    avgQuizScore: number;
  }>({ performanceData: [], studentActivityData: [], avgQuizScore: 0 });
  // Charts show a skeleton until the first load, and an error only if they never loaded.
  const [chartStatus, setChartStatus] = useState<"loading" | "ready" | "error">("loading");

  const showStatusMessage = (message: string) => {
    toast.success(message);
  };

  const showErrorMessage = (message: string) => {
    toast.error(message);
  };

  const loadAll = async () => {
    const [usersData, coursesData, lecturesData, quizzesData, mockExamsData, progressData, statsData, assignmentData] =
      await Promise.all([
        apiFetch<User[]>("/api/admin/users"),
        apiFetch<Course[]>("/api/admin/courses"),
        apiFetch<Lecture[]>("/api/admin/lectures"),
        apiFetch<Quiz[]>("/api/teacher/quizzes"),
        apiFetch<TeacherMockExam[]>("/api/teacher/mock-exams"),
        apiFetch<StudentProgress[]>("/api/guardian/progress"),
        apiFetch<{
          performanceData: { name: string; score: number }[];
          studentActivityData: { name: string; active: number }[];
          avgQuizScore: number;
        }>("/api/stats/teacher"),
        apiFetch<{
          assignments: TeacherAssignment[];
          created: number;
          alreadyAssigned: boolean;
        }>("/api/teacher/me/ensure-starter-assignments", { method: "POST" }).catch(() => ({
          assignments: [],
          created: 0,
          alreadyAssigned: false,
        })),
      ]);

    setUsers(usersData);
    setPublishedQuizzes(quizzesData);
    setMockExams(mockExamsData);
    setStudentProgress(progressData);
    setTeacherChartStats(statsData);
    setChartStatus("ready");
    // Informational only, so a failure here must not block the rest of the dashboard.
    void apiFetch<{ students: StudentAdaptiveLevels[] }>("/api/teacher/quizzes/adaptive-levels")
      .then((data) => setAdaptiveLevels(data.students ?? []))
      .catch(() => undefined);

    const assignments = assignmentData.assignments ?? [];
    setMyAssignments(assignments);
    const assignedCourseIds = new Set(assignments.map((item) => item.courseId));

    const scopedCourses =
      assignedCourseIds.size > 0
        ? coursesData.filter((course) => assignedCourseIds.has(course.id))
        : coursesData;
    setCourses(scopedCourses);
    setLectures(
      lecturesData.filter(
        (lecture) =>
          assignedCourseIds.size === 0 ||
          assignedCourseIds.has(lecture.courseId),
      ),
    );

    if (assignmentData.created > 0) {
      const welcomeKey = `smart-academy:teacher-assign-welcome:${session?.email || "guest"}`;
      let welcomeShown = false;
      try {
        welcomeShown = window.localStorage.getItem(welcomeKey) === "1";
      } catch {
        // storage may be unavailable; show the message anyway
      }
      if (!welcomeShown) {
        try {
          window.localStorage.setItem(welcomeKey, "1");
        } catch {
          // ignore storage errors
        }
        showStatusMessage(
          `Welcome! You have been assigned ${assignmentData.created} class course${assignmentData.created > 1 ? "s" : ""} automatically.`,
        );
      }
    }
  };

  useEffect(() => {
    if (!ready || !isApproved) return;
    void loadAll().catch((err) => {
      console.error("Failed to fetch teacher data:", err);
      toast.error("Failed to load teacher workspace.");
      setChartStatus((current) => (current === "ready" ? current : "error"));
    });
  }, [ready, isApproved]);

  const refreshProcessingStatus = useCallback(async () => {
    try {
      const processing = await apiFetch<LectureProcessingStatus[]>(
        "/api/admin/lectures/processing",
      );
      if (processing.length === 0) return;
      setLectures((prev) =>
        prev.map((lecture) => {
          const update = processing.find((item) => item.id === lecture.id);
          return update
            ? {
                ...lecture,
                processingStatus: update.processingStatus,
                processingProgress: update.processingProgress,
                processingError: update.processingError,
                hlsMasterUrl: update.hlsMasterUrl,
                thumbnailUrl: update.thumbnailUrl,
              }
            : lecture;
        }),
      );
    } catch {
      // ignore transient polling errors
    }
  }, []);

  useEffect(() => {
    if (!ready || !isApproved) return;
    const hasActiveProcessing = lectures.some(
      (lecture) =>
        lecture.processingStatus &&
        lecture.processingStatus !== "READY" &&
        lecture.processingStatus !== "FAILED",
    );
    if (!hasActiveProcessing) return;
    const interval = window.setInterval(
      () => void refreshProcessingStatus(),
      4000,
    );
    return () => window.clearInterval(interval);
  }, [ready, isApproved, lectures, refreshProcessingStatus]);

  // Pending questions narrowed by course and lecture only, so the segment dropdown lists just the
  // segments that exist for the current selection.
  const pendingInScope = useMemo(
    () => publishedQuizzes.filter((quiz) => {
      if (!isQuizStatus(quiz.status, "pending")) return false;

      if (quizFilterCourse !== "all") {
        const lecture = lectures.find((l) => l.id === quiz.lectureId);
        if (!lecture || lecture.courseId !== quizFilterCourse) return false;
      }

      if (quizFilterLecture !== "all" && quiz.lectureId !== quizFilterLecture) {
        return false;
      }

      return true;
    }),
    [publishedQuizzes, quizFilterCourse, quizFilterLecture, lectures]
  );

  const quizFilterLectureOptions = useMemo(
    () => lectures.filter(
      (lecture) =>
        (quizFilterCourse === "all" || lecture.courseId === quizFilterCourse) &&
        publishedQuizzes.some(
          (quiz) => quiz.lectureId === lecture.id && isQuizStatus(quiz.status, "pending"),
        ),
    ),
    [lectures, publishedQuizzes, quizFilterCourse]
  );

  const quizFilterSegmentOptions = useMemo(
    () => [...new Set(pendingInScope.map((quiz) => quiz.segment).filter((label): label is string => Boolean(label)))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [pendingInScope]
  );

  useEffect(() => {
    if (quizFilterLecture !== "all" && !quizFilterLectureOptions.some((lecture) => lecture.id === quizFilterLecture)) {
      setQuizFilterLecture("all");
    }
    if (quizFilterSegment !== "all" && !quizFilterSegmentOptions.includes(quizFilterSegment)) {
      setQuizFilterSegment("all");
    }
  }, [quizFilterLecture, quizFilterLectureOptions, quizFilterSegment, quizFilterSegmentOptions]);

  const pendingQuizzes = useMemo(
    () => pendingInScope.filter((quiz) => {
      if (quizReviewDraftOnly && !pendingDraftQuizIds.includes(quiz.id)) {
        return false;
      }

      if (quizFilterDifficulty !== "all" && quiz.difficulty !== quizFilterDifficulty) {
        return false;
      }

      if (quizFilterSegment !== "all" && quiz.segment !== quizFilterSegment) {
        return false;
      }

      return true;
    }),
    [pendingInScope, quizFilterDifficulty, quizFilterSegment, quizReviewDraftOnly, pendingDraftQuizIds]
  );

  const mockQuestions = useMemo(
    () => publishedQuizzes.filter((quiz) => !quiz.lectureId),
    [publishedQuizzes],
  );

  const aiQuestions = useMemo(
    () =>
      mockQuestions
        .filter((quiz) => Boolean(quiz.aiPrompt))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [mockQuestions],
  );

  const examsWithStatus = useMemo(() => {
    const now = Date.now();
    return mockExams.map((exam) => ({ exam, displayStatus: getExamDisplayStatus(exam, now) }));
  }, [mockExams]);

  const examCounts = useMemo(() => {
    const counts: Record<ExamDisplayStatus, number> = { live: 0, scheduled: 0, draft: 0, ended: 0 };
    examsWithStatus.forEach((entry) => {
      counts[entry.displayStatus] += 1;
    });
    return counts;
  }, [examsWithStatus]);

  const pickerQuestions = useMemo(() => {
    const term = questionSearch.trim().toLowerCase();
    return mockQuestions.filter(
      (quiz) =>
        !isQuizStatus(quiz.status, "rejected") &&
        (!term ||
          quiz.question.toLowerCase().includes(term) ||
          (quiz.topic ?? "").toLowerCase().includes(term)),
    );
  }, [mockQuestions, questionSearch]);

  const bankQuestions = useMemo(() => {
    const term = questionSearch.trim().toLowerCase();
    return mockQuestions.filter(
      (quiz) =>
        (questionStatusFilter === "all" || isQuizStatus(quiz.status, questionStatusFilter)) &&
        (!term ||
          quiz.question.toLowerCase().includes(term) ||
          (quiz.topic ?? "").toLowerCase().includes(term)),
    );
  }, [mockQuestions, questionSearch, questionStatusFilter]);

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

  const riskAlerts = useMemo(() => {
    const students = users.filter((user) => user.role === "STUDENT");
    return students
      .map((student) => {
        const progress = studentProgress.find(
          (item) =>
            item.studentId === student.id ||
            item.studentId.toLowerCase() === student.email.toLowerCase(),
        );
        return {
          student,
          avgScore: progress?.avgScore ?? 0,
          progressPercentage: progress?.progressPercentage ?? 0,
          streakDays: progress?.streakDays ?? 0,
          lastActivityAt: progress?.lastActivityAt ?? null,
        };
      })
      .filter((item) => item.avgScore < 50)
      .sort((a, b) => a.avgScore - b.avgScore);
  }, [users, studentProgress]);

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

  useEffect(() => {
    if (segmentsTouchedRef.current) return;
    if (!transcript.trim()) {
      setLectureSegments([]);
      return;
    }
    setLectureSegments(
      splitTranscriptIntoSegments(transcript, lectureDurationSeconds, questionCount),
    );
  }, [transcript, lectureDurationSeconds, questionCount]);

  const applyDetectedDuration = (seconds: number) => {
    setVideoDurationSeconds(seconds);
    setDurationMinutes(Math.max(1, Math.round(seconds / 60)));
  };

  // Whenever the lecture's video changes (YouTube link typed or pasted, upload finished, lecture
  // opened for editing), look up its real length so the teacher never has to enter it.
  useEffect(() => {
    const url = videoUrl.trim();
    setDurationLookupFailed(false);
    if (!url || (!getYouTubeId(url) && !url.startsWith("/uploads/"))) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsDetectingDuration(true);
      void apiFetch<{ durationSeconds: number | null }>(
        `/api/teacher/video-duration?url=${encodeURIComponent(url)}`,
      )
        .then((result) => {
          if (cancelled) return;
          if (Number(result?.durationSeconds) > 0) {
            applyDetectedDuration(Number(result.durationSeconds));
          } else {
            setDurationLookupFailed(true);
          }
        })
        .catch(() => {
          if (!cancelled) setDurationLookupFailed(true);
        })
        .finally(() => {
          if (!cancelled) setIsDetectingDuration(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setIsDetectingDuration(false);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!selectedLectureFile || sourceMode !== "upload") return;
    let cancelled = false;
    let detectedLocally = false;
    void readMediaDurationSeconds(selectedLectureFile).then((seconds) => {
      if (cancelled || !seconds) return;
      detectedLocally = true;
      applyDetectedDuration(seconds);
    });
    setIsExtractingTranscript(true);
    void extractTranscriptFromFile(selectedLectureFile, API_BASE_URL).then((result) => {
      if (cancelled) return;
      setIsExtractingTranscript(false);
      if (!result) {
        showErrorMessage(
          "Could not extract the transcript from this file. Click Extract Transcript to retry.",
        );
        return;
      }
      if (result.transcript) setTranscript(result.transcript);
      if (result.videoUrl) setVideoUrl(result.videoUrl);
      // Server-side ffprobe covers formats the browser cannot decode (e.g. mkv, avi).
      if (!detectedLocally && result.durationSeconds) applyDetectedDuration(result.durationSeconds);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedLectureFile, sourceMode]);

  const handleTranscribe = async () => {
    if (!lectureTitle) {
      showErrorMessage("Please enter a lecture title first.");
      return;
    }

    setIsProcessing(true);
    try {
      if (selectedLectureFile) {
        const form = new FormData();
        form.append("file", selectedLectureFile);
        form.append("title", lectureTitle);
        if (videoUrl) form.append("videoUrl", videoUrl);

        const response = await authenticatedFetch("/api/teacher/transcribe", {
          method: "POST",
          body: form,
        });

        if (!response.ok) {
          throw new Error("Transcript extraction failed.");
        }

        const data = await response.json();
        setTranscript(data.transcript || "");
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (!videoDurationSeconds && Number(data.durationSeconds) > 0) {
          applyDetectedDuration(Number(data.durationSeconds));
        }
      } else {
        const response = await authenticatedFetch("/api/teacher/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: lectureTitle,
            videoUrl,
          }),
        });

        if (!response.ok) {
          throw new Error("Transcript extraction failed.");
        }

        const data = await response.json();
        setTranscript(data.transcript || "");
        if (data.videoUrl && !videoUrl) {
          setVideoUrl(data.videoUrl);
        }
        // YouTube length comes from the captions, replacing the 10-minute default.
        if (Number(data.durationSeconds) > 0) {
          applyDetectedDuration(Number(data.durationSeconds));
        }
      }

      showStatusMessage("Transcript generated successfully.");
    } catch {
      showErrorMessage("Failed to generate transcript.");
    } finally {
      setIsProcessing(false);
    }
  };

  const generateQuizForLecture = async () => {
    const payload = await apiFetch<{ questions?: { id?: string }[] }>(
      "/api/teacher/quizzes/generate",
      {
        method: "POST",
        body: JSON.stringify({
          topic: lectureTitle,
          transcript,
          questionCount: Math.max(lectureSegments.length, 1) * 3,
          durationSeconds: lectureDurationSeconds,
          segments: lectureSegments,
        }),
      },
    );
    return (
      payload.questions
        ?.map((question) => question.id)
        .filter((id): id is string => Boolean(id)) ?? []
    );
  };

  const handleGenerateQuiz = async () => {
    if (!courseId || !lectureTitle || !videoUrl) {
      showErrorMessage(
        "Complete the lecture details (course, title, video) first, then generate its quiz.",
      );
      return;
    }
    setIsProcessing(true);
    try {
      const quizIds = await generateQuizForLecture();
      // Regenerating replaces the previous unsaved drafts instead of leaving them as orphans.
      await discardDraftQuizzes(pendingDraftQuizIds);
      setPendingDraftQuizIds(quizIds);
      setReviewedDraftQuizIds([]);
      setQuizReviewDraftOnly(true);
      await loadAll();
      showStatusMessage(
        "AI quiz generated. Review and approve each question in the Quiz Review tab.",
      );
      setActiveTab("quizzes");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate quiz.";
      showErrorMessage(message.includes("fetch") ? "Failed to generate quiz. Check that the backend is running." : message);
    } finally {
      setIsProcessing(false);
    }
  };

  /** Deletes generated questions that were never linked to a saved lecture. */
  const discardDraftQuizzes = async (quizIds: string[]) => {
    await Promise.all(
      quizIds.map((quizId) =>
        apiFetch(`/api/admin/quiz/questions/${quizId}`, { method: "DELETE" }).catch(() => undefined),
      ),
    );
  };

  const hasUnsavedLecture = Boolean(
    editingLectureId ||
      lectureTitle.trim() ||
      videoUrl.trim() ||
      transcript.trim() ||
      selectedLectureFile ||
      pendingDraftQuizIds.length > 0,
  );

  // Leaving Upload Lecture with unsaved work asks first. Internal moves (e.g. to Quiz Review after
  // generating) call setActiveTab directly and are not interrupted.
  const requestTabChange = (tab: string) => {
    if (activeTab === "upload" && tab !== "upload" && hasUnsavedLecture) {
      setPendingTabChange(tab);
      return;
    }
    setActiveTab(tab);
  };
  useTabHistory(activeTab, requestTabChange);

  const handleStayOnUpload = () => {
    setPendingTabChange(null);
    // Browser Back already moved the URL; put it back on the upload tab.
    window.history.pushState({ tab: "upload" }, "", `${window.location.pathname}?tab=upload`);
  };

  const handleKeepDraftAndLeave = () => {
    const tab = pendingTabChange;
    setPendingTabChange(null);
    if (tab) setActiveTab(tab);
  };

  const handleDiscardAndLeave = async () => {
    const tab = pendingTabChange;
    setPendingTabChange(null);
    await discardDraftQuizzes(pendingDraftQuizIds);
    resetLectureForm();
    if (tab) setActiveTab(tab);
    await loadAll().catch(() => undefined);
  };

  // Closing or reloading the browser tab with unsaved lecture work shows the browser's own warning.
  useEffect(() => {
    if (!hasUnsavedLecture) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedLecture]);

  const resetLectureForm = () => {
    setEditingLectureId(null);
    setSavedLecture(null);
    setPendingDraftQuizIds([]);
    setReviewedDraftQuizIds([]);
    setQuizReviewDraftOnly(false);
    segmentsTouchedRef.current = false;
    setCourseId("");
    setLectureTitle("");
    setSourceMode("link");
    setVideoUrl("");
    setSelectedLectureFile(null);
    setFileInputKey((key) => key + 1);
    setIsExtractingTranscript(false);
    setTranscript("");
    setQuestionCount(3);
    setDurationMinutes(10);
    setVideoDurationSeconds(null);
    setLectureSegments([]);
  };

  const handleSaveLecture = async () => {
    if (!courseId || !lectureTitle) {
      showErrorMessage("Please complete the lecture details first.");
      return;
    }
    if (!videoUrl) {
      showErrorMessage(
        sourceMode === "upload"
          ? "Select a video file and wait for it to finish uploading before saving."
          : "Enter the YouTube video link before saving.",
      );
      return;
    }

    if (
      !editingLectureId &&
      savedLecture &&
      savedLecture.courseId === courseId &&
      savedLecture.title === lectureTitle &&
      savedLecture.videoUrl === videoUrl
    ) {
      showStatusMessage(
        "This lecture is already saved. Click Generate AI Quiz, or change the details to create a new lecture.",
      );
      return;
    }

    setIsProcessing(true);

    try {
      const url = editingLectureId
        ? `/api/admin/lectures/${editingLectureId}`
        : "/api/admin/lectures";
      const method = editingLectureId ? "PATCH" : "POST";

      const saved = await apiFetch<{ id: string }>(url, {
        method,
        body: JSON.stringify({
          courseId,
          title: lectureTitle,
          videoUrl,
          transcript,
          lectureOrder:
            lectures.filter((lecture) => lecture.courseId === courseId).length + 1,
          durationMinutes,
          isCheckpointLocked: true,
          segments: lectureSegments.length > 0 ? lectureSegments : undefined,
        }),
      });

      const lectureId = editingLectureId ?? saved?.id;
      if (lectureId && pendingDraftQuizIds.length > 0) {
        await Promise.all(
          pendingDraftQuizIds.map((quizId) => {
            // The player pauses at each question's own timestamp, so carry over any planner edits.
            const segmentLabel = publishedQuizzes.find((quiz) => quiz.id === quizId)?.segment;
            const timestamp = lectureSegments.find((segment) => segment.label === segmentLabel)?.timestamp;
            return apiFetch(`/api/teacher/quizzes/${quizId}`, {
              method: "PATCH",
              body: JSON.stringify(timestamp !== undefined ? { lectureId, timestamp } : { lectureId }),
            });
          }),
        );
      }

      // The lecture is saved, so clear the form right away; a failed refresh must not leave it filled in.
      const wasEditing = Boolean(editingLectureId);
      resetLectureForm();
      showStatusMessage(
        wasEditing
          ? "Lecture updated successfully."
          : "Lecture uploaded successfully. Manage it in the Manage Lectures tab.",
      );
      if (wasEditing) {
        setActiveTab("manage-lectures");
      }
      await loadAll().catch(() => undefined);
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
    setDurationMinutes(lecture.durationMinutes ?? 10);
    setVideoDurationSeconds(null);
    setSourceMode(getYouTubeId(lecture.videoUrl) ? "link" : "upload");
    const checkpoints = lecture.checkpoints ?? [];
    if (checkpoints.length > 0) {
      segmentsTouchedRef.current = true;
      const lectureSeconds = (lecture.durationMinutes ?? 10) * 60;
      const texts = splitTranscriptIntoSegments(
        lecture.transcript ?? "",
        lectureSeconds,
        checkpoints.length,
      );
      setLectureSegments(
        [...checkpoints]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((checkpoint, index) => {
            // Checkpoints are stored as "Segment N Checkpoint"; quizzes are keyed by "Segment N".
            const label = (checkpoint.title || `Segment ${index + 1}`).replace(/\s+Checkpoint$/i, "");
            // Show where the video really pauses: the segment's quiz timestamp, when it has quizzes.
            const quizTimestamp = publishedQuizzes.find(
              (quiz) => quiz.lectureId === lecture.id && quiz.segment === label && typeof quiz.timestamp === "number",
            )?.timestamp;
            // Lectures saved before the caption-unit fix can hold times far past the video's end.
            const timestamp =
              [quizTimestamp, checkpoint.timestamp, texts[index]?.timestamp].find(
                (value): value is number => typeof value === "number" && value > 0 && value <= lectureSeconds,
              ) ?? checkpoint.timestamp;
            return {
              label,
              timestamp,
              difficulty: (["easy", "medium", "hard"] as const)[index % 3],
              text: texts[index]?.text ?? "",
            };
          }),
      );
    } else {
      segmentsTouchedRef.current = false;
    }
    setActiveTab("upload");
  };

  const handleDeleteLecture = async (lectureId: string) => {
    const lecture = lectures.find((item) => item.id === lectureId);
    const isProcessing = lecture?.processingStatus === "PROCESSING";
    const message = isProcessing
      ? "This lecture is still being processed (thumbnail generation in progress). Deleting it will cancel that work. Delete anyway?"
      : "Delete this lecture?";
    if (!confirm(message)) {
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

  const handleRetryProcessing = async (lecture: Lecture) => {
    try {
      const result = await apiFetch<{ ok: boolean; message?: string }>(
        `/api/admin/lectures/${lecture.id}/retry-processing`,
        { method: "POST" },
      );
      if (result.ok) {
        showStatusMessage("Video processing restarted.");
        await loadAll();
      } else {
        showErrorMessage(result.message || "Could not restart processing.");
      }
    } catch {
      showErrorMessage("Failed to restart processing.");
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
          ? "Quiz approved and published for students."
          : "Quiz rejected successfully.",
      );
      if (activeTab === "quizzes" && pendingDraftQuizIds.includes(quizId)) {
        const reviewed = [...new Set([...reviewedDraftQuizIds, quizId])];
        setReviewedDraftQuizIds(reviewed);
        if (pendingDraftQuizIds.every((id) => reviewed.includes(id))) {
          setQuizReviewDraftOnly(false);
          setActiveTab("upload");
          showStatusMessage(
            "All quiz questions reviewed. Save & upload the lecture to link them.",
          );
        }
      }
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
    try {
      await apiFetch("/api/teacher/quizzes", {
        method: "POST",
        body: JSON.stringify({
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

  // Generates mock questions (saved as pending in the question bank) from a course's lecture
  // transcripts. Throws with a message the teacher can act on when nothing could be generated.
  const generateAiQuestions = async (courseId: string, topic: string, questionCount: number) => {
    if (!courseId) throw new Error("Choose a course first.");
    const combinedTranscript = lectures
      .filter((lecture) => lecture.courseId === courseId)
      .map((lecture) => lecture.transcript ?? "")
      .join("\n\n")
      .trim();
    if (!combinedTranscript) {
      throw new Error(
        "This course has no lecture transcript yet. Generate one for its lectures before using AI to build mock questions.",
      );
    }

    const result = await apiFetch<{ questions: Quiz[] }>("/api/teacher/quizzes/generate", {
      method: "POST",
      body: JSON.stringify({
        topic: topic.trim() || courses.find((course) => course.id === courseId)?.title || "Mock Exam",
        // The server rejects transcripts over this size; the start of the course is enough context.
        transcript: combinedTranscript.slice(0, AI_TRANSCRIPT_LIMIT),
        questionCount,
      }),
    });
    if (!result.questions?.length) {
      throw new Error("The AI did not return any questions. Try again or adjust the topic.");
    }
    setLatestAiQuestionIds(result.questions.map((question) => question.id));
    return result.questions;
  };

  const handleCreateAiMock = async () => {
    setIsProcessing(true);
    try {
      const questions = await generateAiQuestions(aiMockCourseId, aiMockTopic, aiMockQuestionCount);
      await loadAll();
      setAiResult({ ok: true, kind: "questions", questions });
    } catch (error) {
      setAiResult({
        ok: false,
        kind: "questions",
        error: error instanceof Error ? error.message : "Failed to generate AI questions.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /** "publish" makes the exam live straight away; "review" prepares it in the builder first. */
  const handleGenerateAiExam = async (mode: "publish" | "review") => {
    const minutes = Number(aiExamForm.durationMinutes);
    if (aiExamForm.hasTimer && (!minutes || minutes <= 0)) {
      setAiResult({ ok: false, kind: "exam", error: "Enter a valid timer duration in minutes." });
      return;
    }
    const topic = aiExamForm.topic.trim();
    const courseTitle = courses.find((course) => course.id === aiExamForm.courseId)?.title;
    const title = aiExamForm.title.trim() || `${topic || courseTitle || "AI"} Mock Exam`;
    const description = topic ? `AI-generated exam on ${topic}.` : "";

    setIsProcessing(true);
    try {
      const questions = await generateAiQuestions(
        aiExamForm.courseId,
        aiExamForm.topic,
        aiExamForm.questionCount,
      );
      const questionIds = questions.map((question) => question.id);

      if (mode === "review") {
        await loadAll();
        setEditingExamId(null);
        setExamForm({
          ...EMPTY_EXAM_FORM,
          title,
          description,
          courseId: aiExamForm.courseId,
          hasTimer: aiExamForm.hasTimer,
          durationMinutes: aiExamForm.hasTimer ? String(minutes) : EMPTY_EXAM_FORM.durationMinutes,
          questionIds,
        });
        setQuestionSearch("");
        setAiResult({ ok: true, kind: "exam-review", title, questions });
        return;
      }

      const exam = await apiFetch<TeacherMockExam>("/api/teacher/mock-exams", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          courseId: aiExamForm.courseId || undefined,
          durationSeconds: aiExamForm.hasTimer ? minutes * 60 : undefined,
          questionIds,
        }),
      });
      let publishError: string | undefined;
      try {
        await apiFetch(`/api/teacher/mock-exams/${exam.id}/publish`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } catch (error) {
        publishError = error instanceof Error ? error.message : "Failed to publish mock exam.";
      }
      await loadAll();
      setExpandedExamId(exam.id);
      setAiExamForm((current) => ({ ...current, title: "", topic: "" }));
      setAiResult({ ok: true, kind: "exam-published", title, examId: exam.id, questions, publishError });
    } catch (error) {
      setAiResult({
        ok: false,
        kind: "exam",
        error: error instanceof Error ? error.message : "Failed to generate the AI exam.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleExamQuestion = (questionId: string) => {
    setExamForm((current) => ({
      ...current,
      questionIds: current.questionIds.includes(questionId)
        ? current.questionIds.filter((id) => id !== questionId)
        : [...current.questionIds, questionId],
    }));
  };

  const resetExamForm = () => {
    setExamForm(EMPTY_EXAM_FORM);
    setEditingExamId(null);
  };

  const startNewExam = () => {
    resetExamForm();
    setQuestionSearch("");
    setMockView("builder");
  };

  const selectAllPickerQuestions = () => {
    setExamForm((current) => ({
      ...current,
      questionIds: [
        ...current.questionIds,
        ...pickerQuestions
          .map((quiz) => quiz.id)
          .filter((id) => !current.questionIds.includes(id)),
      ],
    }));
  };

  const handleEditMockExam = (exam: TeacherMockExam) => {
    setEditingExamId(exam.id);
    setExpandedExamId(exam.id);
    setQuestionSearch("");
    setMockView("builder");
    setExamForm({
      title: exam.title,
      description: exam.description ?? "",
      courseId: exam.courseId ?? "",
      hasTimer: exam.durationSeconds != null,
      durationMinutes: exam.durationSeconds != null
        ? String(Math.round(exam.durationSeconds / 60))
        : "10",
      hasTimeFrame: !!(exam.startsAt || exam.endsAt),
      startsAt: exam.startsAt ? toDateTimeLocal(exam.startsAt) : "",
      endsAt: exam.endsAt ? toDateTimeLocal(exam.endsAt) : "",
      questionIds: (exam.questions ?? []).map((q) => q.id),
    });
  };

  const handleCreateMockExam = async () => {
    if (!examForm.title.trim()) {
      showErrorMessage("Give the mock exam a title.");
      return;
    }
    if (examForm.questionIds.length === 0) {
      showErrorMessage("Select at least one question for the mock exam.");
      return;
    }
    if (examForm.hasTimeFrame && (!examForm.startsAt || !examForm.endsAt)) {
      showErrorMessage("Set both a start and end time for the exam window.");
      return;
    }
    if (
      examForm.hasTimeFrame &&
      new Date(examForm.endsAt) <= new Date(examForm.startsAt)
    ) {
      showErrorMessage("The end time must be after the start time.");
      return;
    }
    if (examForm.hasTimer && (!examForm.durationMinutes || Number(examForm.durationMinutes) <= 0)) {
      showErrorMessage("Enter a valid timer duration in minutes.");
      return;
    }

    const payload = {
      title: examForm.title.trim(),
      description: examForm.description.trim() || undefined,
      courseId: examForm.courseId || undefined,
      durationSeconds: examForm.hasTimer
        ? Number(examForm.durationMinutes) * 60
        : undefined,
      startsAt:
        examForm.hasTimeFrame && examForm.startsAt
          ? new Date(examForm.startsAt).toISOString()
          : undefined,
      endsAt:
        examForm.hasTimeFrame && examForm.endsAt
          ? new Date(examForm.endsAt).toISOString()
          : undefined,
      questionIds: examForm.questionIds,
    };

    setIsProcessing(true);
    try {
      const saved = editingExamId
        ? await apiFetch<TeacherMockExam>(`/api/teacher/mock-exams/${editingExamId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<TeacherMockExam>("/api/teacher/mock-exams", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      // Saving publishes the exam straight to students; there is no separate draft step.
      let publishError: string | null = null;
      if (saved.status !== "published") {
        try {
          await apiFetch(`/api/teacher/mock-exams/${saved.id}/publish`, {
            method: "POST",
            body: JSON.stringify({}),
          });
        } catch (error) {
          publishError = error instanceof Error ? error.message : "Failed to publish mock exam.";
        }
      }

      await loadAll();
      resetExamForm();
      setExpandedExamId(saved.id);
      setExamFilter("all");
      setMockView("exams");
      // The exam list only mounts once the view switches, so scroll after that render.
      window.requestAnimationFrame(() =>
        document
          .getElementById("teacher-mock-exam-list")
          ?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
      );
      if (publishError) {
        showErrorMessage(`Mock exam saved but not published: ${publishError}`);
      } else {
        showStatusMessage(
          editingExamId ? "Mock exam updated and live for students." : "Mock exam published to students.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save mock exam.";
      showErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublishMockExam = async (examId: string) => {
    try {
      await apiFetch(`/api/teacher/mock-exams/${examId}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadAll();
      showStatusMessage("Mock exam published to students.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to publish mock exam.";
      showErrorMessage(message);
    }
  };

  const handleDeleteMockExam = async (examId: string) => {
    if (!confirm("Delete this mock exam?")) return;
    try {
      await apiFetch(`/api/teacher/mock-exams/${examId}`, {
        method: "DELETE",
      });
      await loadAll();
      showStatusMessage("Mock exam deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete mock exam.";
      showErrorMessage(message);
    }
  };

  const handleRemoveExamQuestion = async (examId: string, questionId: string) => {
    try {
      await apiFetch(
        `/api/teacher/mock-exams/${examId}/questions/${questionId}`,
        { method: "DELETE" },
      );
      await loadAll();
      showStatusMessage("Question removed from the mock exam.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove question from the mock exam.";
      showErrorMessage(message);
    }
  };

  if (!ready) return null;

  if (maintenance?.enabled && session?.role !== "ADMIN") {
    return <MaintenanceScreen message={maintenance.message} />;
  }

  return (
    <DashboardShell
      role="teacher"
      title={`Welcome back, ${session?.name || "Teacher"}`}
      subtitle="Manage lecture delivery, build mock exams, and track every learner."
      activeTab={activeTab}
      onTabChange={requestTabChange}
      session={session ?? undefined}
    >
      <div className="flex flex-col gap-6">
        <PendingApprovalBanner roleLabel="teacher" isApproved={isApproved} />

      {aiResult ? (
        <Dialog
          label={aiResult.ok ? "AI generation complete" : "AI generation failed"}
          onClose={() => setAiResult(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        >
          <div className="motion-pop w-full max-w-lg rounded-2xl border border-accent-purple/15 bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  aiResult.ok && !aiResult.publishError
                    ? "bg-emerald-500/15 text-emerald-600"
                    : aiResult.ok
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-rose-500/15 text-rose-600",
                )}
              >
                {aiResult.ok ? <Sparkles size={20} /> : <ShieldAlert size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-white">
                  {!aiResult.ok
                    ? aiResult.kind === "exam"
                      ? "Couldn't generate the exam"
                      : "Couldn't generate questions"
                    : aiResult.kind === "exam-published"
                      ? aiResult.publishError
                        ? "Exam generated, but not published"
                        : "Exam generated and published"
                      : aiResult.kind === "exam-review"
                        ? "Exam generated, ready to review"
                        : "Questions generated"}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {!aiResult.ok
                    ? aiResult.error
                    : aiResult.kind === "exam-published"
                      ? aiResult.publishError
                        ? `"${aiResult.title}" was saved as a draft with ${aiResult.questions.length} questions. ${aiResult.publishError}`
                        : `"${aiResult.title}" is live for students with ${aiResult.questions.length} questions.`
                      : aiResult.kind === "exam-review"
                        ? `"${aiResult.title}" has ${aiResult.questions.length} questions. Open the builder to check them, then publish.`
                        : `${aiResult.questions.length} questions were added to the question bank.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiResult(null)}
                aria-label="Close dialog"
                className="rounded-lg px-2 py-1 text-slate-500 hover:text-rose-600"
              >
                ×
              </button>
            </div>

            {aiResult.ok ? (
              <ol className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-3">
                {aiResult.questions.slice(0, 5).map((question, index) => (
                  <li key={question.id} className="text-xs font-semibold text-slate-300">
                    {index + 1}. {question.question}
                  </li>
                ))}
                {aiResult.questions.length > 5 ? (
                  <li className="text-xs text-slate-500">
                    + {aiResult.questions.length - 5} more
                  </li>
                ) : null}
              </ol>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              {!aiResult.ok ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => {
                    const kind = aiResult.kind;
                    setAiResult(null);
                    setMockView("ai");
                    if (kind === "questions") void handleCreateAiMock();
                  }}
                >
                  {aiResult.kind === "questions" ? "Try again" : "Back to AI Generator"}
                </Button>
              ) : aiResult.kind === "exam-published" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAiResult(null);
                    setExamFilter("all");
                    setMockView("exams");
                  }}
                >
                  View exam
                </Button>
              ) : aiResult.kind === "exam-review" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAiResult(null);
                    setMockView("builder");
                  }}
                >
                  Review in builder
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAiResult(null);
                    setMockView("ai");
                  }}
                >
                  See AI questions
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setAiResult(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}

        {pendingTabChange ? (
          <Dialog
            label="Leave Upload Lecture?"
            onClose={handleStayOnUpload}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-md rounded-2xl border border-accent-purple/15 bg-ink-900 p-6 shadow-2xl">
              <div className="mb-3 flex items-start justify-between gap-4">
                <h2 className="text-lg font-bold text-white">Leave Upload Lecture?</h2>
                <button
                  type="button"
                  onClick={handleStayOnUpload}
                  aria-label="Close dialog"
                  className="rounded-lg px-2 py-1 text-slate-500 hover:text-rose-600"
                >
                  ×
                </button>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                {editingLectureId ? "Your changes to this lecture are" : "This lecture is"} not saved yet
                {pendingDraftQuizIds.length > 0
                  ? `, and its ${pendingDraftQuizIds.length} generated quiz question${pendingDraftQuizIds.length > 1 ? "s are" : " is"} not linked to it`
                  : ""}
                . You can keep it as a draft and come back, or discard it.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="button" variant="primary" size="sm" onClick={handleStayOnUpload}>
                  Stay and finish
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleKeepDraftAndLeave}>
                  Keep draft & leave
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={() => void handleDiscardAndLeave()}>
                  Discard
                </Button>
              </div>
            </div>
          </Dialog>
        ) : null}

        {activeTab === "overview" ? (
          <>
            {myAssignments.length > 0 ? (
              <PremiumCard
                eyebrow="Class Assignments"
                title="Your Assigned Classes"
                description="You can only post and manage content for the classes and courses below."
              >
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {myAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-start gap-3 rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm">
                        <BookOpen size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          {assignment.courseTitle}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {assignment.className
                            ? `${assignment.className}${assignment.sectionName ? ` - Section ${assignment.sectionName}` : ""}`
                            : "Class assignment"}
                        </p>
                        {assignment.courseCode ? (
                          <span className="mt-2 inline-block rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {assignment.courseCode}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </PremiumCard>
            ) : (
              <Alert variant="warning" className="mb-6">
                You have no assigned classes yet. Ask an admin to assign you
                classes and courses from the Classes section.
              </Alert>
            )}

            {riskAlerts.length > 0 ? (
              <Alert variant="warning" className="mb-6 flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <ShieldAlert size={18} />
                  <strong>{riskAlerts.length}</strong> student
                  {riskAlerts.length > 1 ? "s are" : " is"} at risk with an average quiz score below 50%.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("alerts")}
                >
                  View Risk Alerts
                </Button>
              </Alert>
            ) : null}

            <TeacherDashboard
              stats={{
              totalStudents: users.filter((user) => user.role === "STUDENT")
                .length,
              activeStudents: studentProgress.length,
              totalCourses: courses.length,
              totalLectures: lectures.length,
              avgQuizScore: teacherChartStats.avgQuizScore || Math.round(
                studentProgress.reduce(
                  (total, item) => total + item.avgScore,
                  0,
                ) / (studentProgress.length || 1),
              ),
            }}
            performanceData={teacherChartStats.performanceData}
            studentActivityData={teacherChartStats.studentActivityData}
            chartStatus={chartStatus}
            onRetry={() => {
              setChartStatus("loading");
              void loadAll().catch(() => setChartStatus("error"));
            }}
          />
          </>
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
                  <Select
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                    className="mt-2"
                  >
                    <option value="">Choose a course...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Lecture Title
                  </label>
                  <Input
                    type="text"
                    value={lectureTitle}
                    onChange={(event) => setLectureTitle(event.target.value)}
                    placeholder="e.g. Introduction to Derivatives"
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Duration (minutes)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(event) => {
                        setVideoDurationSeconds(null);
                        setDurationMinutes(Number(event.target.value) || 10);
                      }}
                      className="mt-2"
                    />
                    {isDetectingDuration ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-purple">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Detecting video length...
                      </p>
                    ) : videoDurationSeconds ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Detected from video: {formatTimestampInput(videoDurationSeconds)}
                      </p>
                    ) : durationLookupFailed ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Could not read the video length; enter it manually.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Segment Quizzes
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={questionCount}
                      onChange={(event) => setQuestionCount(Number(event.target.value) || 3)}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSourceMode("link")}
                    className={cn(
                      sourceMode === "link" &&
                        "border-accent-purple bg-accent-purple/10 text-white",
                    )}
                  >
                    <Link2 size={16} className="text-rose-500" />
                    YouTube Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSourceMode("upload")}
                    className={cn(
                      sourceMode === "upload" &&
                        "border-accent-purple bg-accent-purple/10 text-white",
                    )}
                  >
                    <Upload size={16} className="text-accent-cyan" />
                    File Upload
                  </Button>
                </div>

                {sourceMode === "link" ? (
                  <Input
                    type="url"
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                ) : (
                  <div className="relative">
                    <input
                      key={fileInputKey}
                      type="file"
                      accept="video/*"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      onChange={(event) =>
                        setSelectedLectureFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-accent-purple/25 bg-accent-purple/[0.06] py-8 text-sm transition-all hover:border-accent-purple/50 hover:bg-accent-purple/[0.12]">
                      <PlusCircle className="h-5 w-5 text-accent-purple" />
                      <span className="font-medium text-slate-600">
                        {isExtractingTranscript ? (
                          <span className="inline-flex items-center gap-2 text-accent-purple">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Extracting transcript...
                          </span>
                        ) : selectedLectureFile ? (
                          selectedLectureFile.name
                        ) : videoUrl && !videoUrl.startsWith("http") ? (
                          "Uploaded video linked"
                        ) : (
                          "Click to upload lecture video"
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={isProcessing || isExtractingTranscript}
                    onClick={handleTranscribe}
                  >
                    {isProcessing
                      ? "Processing..."
                      : isExtractingTranscript
                        ? "Extracting..."
                        : "Extract Transcript"}
                  </Button>
                  <Button
                    type="button"
                    variant="solid"
                    size="sm"
                    fullWidth
                    disabled={isProcessing || !transcript}
                    onClick={handleGenerateQuiz}
                  >
                    {isProcessing ? "Generating..." : "Generate AI Quiz"}
                  </Button>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    size="lg"
                    fullWidth
                    disabled={
                      isProcessing ||
                      !lectureTitle ||
                      !videoUrl ||
                      (sourceMode === "upload" && !selectedLectureFile && !editingLectureId)
                    }
                    onClick={handleSaveLecture}
                  >
                    {isProcessing
                      ? "Saving..."
                      : editingLectureId
                        ? "Update Lecture"
                        : "Save & Upload Lecture"}
                  </Button>
                  {editingLectureId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={resetLectureForm}
                    >
                      Cancel
                    </Button>
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
                ) : editingLectureId &&
                  lectures.find((lecture) => lecture.id === editingLectureId)
                    ?.thumbnailUrl ? (
                  <div className="aspect-video overflow-hidden rounded-2xl bg-ink-900">
                    <img
                      src={`${API_BASE_URL}${lectures.find((lecture) => lecture.id === editingLectureId)?.thumbnailUrl}`}
                      alt="Lecture thumbnail"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-2xl border-2 border-dashed border-accent-purple/10 bg-ink-900">
                    <Video className="h-12 w-12 text-slate-700" />
                  </div>
                )}

                <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Transcript Preview
                  </h4>
                  <Textarea
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    rows={6}
                    placeholder="Extract or edit the lecture transcript used for segment quizzes."
                    className="mt-2 leading-relaxed text-slate-600"
                  />
                </div>

                {lectureSegments.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Segment Quiz Planner
                    </h4>
                    <AdaptiveLearningInfo />
                    {lectureSegments.map((segment, index) => (
                      <div
                        key={`${segment.label}-${index}`}
                        className="rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-4"
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Checkpoint Time (mm:ss)
                            </label>
                            <CheckpointTimeInput
                              seconds={segment.timestamp}
                              onCommit={(seconds) => {
                                segmentsTouchedRef.current = true;
                                const next = [...lectureSegments];
                                next[index] = { ...segment, timestamp: seconds };
                                setLectureSegments(next);
                              }}
                            />
                            <p className="mt-1 text-[11px] text-slate-500">
                              Covers {formatTimestampInput(index === 0 ? 0 : lectureSegments[index - 1].timestamp)}
                              {" – "}
                              {formatTimestampInput(segment.timestamp)}
                            </p>
                            {segment.timestamp > lectureDurationSeconds ? (
                              <p className="mt-1 text-[11px] text-rose-500">
                                After the end of the video ({formatTimestampInput(lectureDurationSeconds)}).
                              </p>
                            ) : index > 0 && segment.timestamp <= lectureSegments[index - 1].timestamp ? (
                              <p className="mt-1 text-[11px] text-rose-500">
                                Must be later than the previous checkpoint.
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Difficulty
                            </label>
                            <Select
                              value={segment.difficulty}
                              onChange={(event) => {
                                segmentsTouchedRef.current = true;
                                const next = [...lectureSegments];
                                next[index] = {
                                  ...segment,
                                  difficulty: event.target.value as LectureSegment["difficulty"],
                                };
                                setLectureSegments(next);
                              }}
                              className="mt-2 px-3 py-2"
                            >
                              <option value="easy">Easy</option>
                              <option value="medium">Medium</option>
                              <option value="hard">Hard</option>
                            </Select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Segment
                            </label>
                            <p className="mt-2 text-sm font-semibold text-white">{segment.label}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                    className="flex items-center justify-between rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4 transition-all hover:bg-accent-purple/[0.12]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm">
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
                        {lecture.processingStatus &&
                        lecture.processingStatus !== "READY" ? (
                          <span
                            title={lecture.processingError ?? undefined}
                            className={cn(
                              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                              lecture.processingStatus === "FAILED"
                                ? "bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/25"
                                : "bg-accent-cyan/10 text-cyan-400 ring-1 ring-inset ring-accent-cyan/25",
                            )}
                          >
                            {lecture.processingStatus === "FAILED"
                              ? "Processing failed"
                              : `Processing ${lecture.processingProgress ?? 0}%`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {lecture.processingStatus === "FAILED" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="p-2 text-amber-400 hover:text-amber-500"
                          onClick={() => handleRetryProcessing(lecture)}
                          title="Retry video processing"
                          aria-label="Retry video processing"
                        >
                          <RotateCcw size={18} />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="p-2 text-accent-purple hover:text-violet-700"
                        onClick={() => handleEditLecture(lecture)}
                      >
                        <Edit size={18} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="p-2 text-rose-500 hover:text-rose-600"
                        onClick={() => handleDeleteLecture(lecture.id)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {lectures.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-accent-purple/10 py-12 text-center text-slate-500">
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
                    className="rounded-[28px] border border-accent-purple/10 bg-accent-purple/[0.06] p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm">
                          <BookOpen size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white">
                          {course.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {course.code || "No Course Code"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExpandedCourseId(isExpanded ? null : course.id)
                        }
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? "Hide" : "View"} Details
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </Button>
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
                            className="rounded-2xl border border-accent-purple/10 bg-ink-900/50 p-4"
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="p-2 text-accent-purple hover:text-violet-700"
                                onClick={() => handleEditLecture(lecture)}
                              >
                                <Edit size={16} />
                              </Button>
                            </div>
                            <p className="mt-3 line-clamp-3 text-sm text-slate-600">
                              {lecture.transcript || "Transcript not generated yet."}
                            </p>
                          </div>
                        ))}
                        {courseLectures.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-accent-purple/15 p-4 text-sm text-slate-500">
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
            {quizReviewDraftOnly ? (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.06] px-4 py-3">
                <p className="text-sm text-slate-600">
                  Showing only the questions generated for{" "}
                  <span className="font-semibold text-white">{lectureTitle || "this lecture"}</span>.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setQuizReviewDraftOnly(false)}>
                    Show all pending quizzes
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab("upload")}>
                    Back to lecture
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="mb-4 flex justify-end">
              <AdaptiveLearningStatus />
            </div>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Course / Subject
                </label>
                <Select
                  value={quizFilterCourse}
                  onChange={(e) => {
                    setQuizFilterCourse(e.target.value);
                    setQuizFilterLecture("all");
                    setQuizFilterSegment("all");
                  }}
                >
                  <option value="all">All Courses</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Lecture
                </label>
                <Select
                  value={quizFilterLecture}
                  onChange={(e) => {
                    setQuizFilterLecture(e.target.value);
                    setQuizFilterSegment("all");
                  }}
                >
                  <option value="all">All Lectures</option>
                  {quizFilterLectureOptions.map((lecture) => (
                    <option key={lecture.id} value={lecture.id}>{lecture.title}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Segment
                </label>
                <Select
                  value={quizFilterSegment}
                  onChange={(e) => setQuizFilterSegment(e.target.value)}
                >
                  <option value="all">All Segments</option>
                  {quizFilterSegmentOptions.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                  Difficulty
                </label>
                <Select
                  value={quizFilterDifficulty}
                  onChange={(e) => setQuizFilterDifficulty(e.target.value as any)}
                >
                  <option value="all">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              {(() => {
                const groups = new Map<string, Quiz[]>();
                for (const quiz of pendingQuizzes) {
                  const key = `${quiz.lectureId ?? "mock"}|${quiz.segment ?? "n/a"}|${quiz.timestamp ?? "n/a"}`;
                  const list = groups.get(key) ?? [];
                  list.push(quiz);
                  groups.set(key, list);
                }
                const difficultyRank: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
                const lectureTitle = (id?: string) => lectures.find((l) => l.id === id)?.title ?? "";
                // Lecture by lecture, segments in playback order, questions easiest first.
                const ordered = [...groups.entries()]
                  .map(([key, list]) => [
                    key,
                    [...list].sort((a, b) => (difficultyRank[a.difficulty] ?? 1) - (difficultyRank[b.difficulty] ?? 1)),
                  ] as const)
                  .sort(([, a], [, b]) =>
                    lectureTitle(a[0].lectureId).localeCompare(lectureTitle(b[0].lectureId)) ||
                    (a[0].timestamp ?? 0) - (b[0].timestamp ?? 0),
                  );
                return ordered.map(([key, quizzes]) => {
                  const first = quizzes[0];
                  const difficultySummary = (["easy", "medium", "hard"] as const)
                    .map((level) => [level, quizzes.filter((quiz) => quiz.difficulty === level).length] as const)
                    .filter(([, count]) => count > 0)
                    .map(([level, count]) => `${count} ${level}`)
                    .join(" · ");
                  const lecture = first.lectureId ? lectures.find((l) => l.id === first.lectureId) : null;
                  const course = lecture ? courses.find((c) => c.id === lecture.courseId) : null;

                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-6"
                    >
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {first.segment ? (
                            <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">{first.segment}</span>
                          ) : null}
                          {first.timestamp !== undefined ? (
                            <span className="rounded-full bg-accent-purple/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-purple">{formatTime(first.timestamp)}</span>
                          ) : null}
                          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-600">
                            {quizzes.length} question{quizzes.length > 1 ? "s" : ""}
                          </span>
                          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                            {difficultySummary}
                          </span>
                          {lecture ? (
                            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">{lecture.title}</span>
                          ) : null}
                          {course ? (
                            <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{course.title}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {quizzes.map((quiz) => (
                          <div
                            key={quiz.id}
                            className="rounded-xl border border-accent-purple/10 bg-ink-900/60 p-4"
                          >
                            <div className="mb-2 flex items-center justify-between gap-4">
                              <div className="flex flex-wrap gap-2">
                                <span className={cn(
                                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                  quiz.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm" :
                                    quiz.difficulty === "medium" ? "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25 backdrop-blur-sm" :
                                      "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25 backdrop-blur-sm"
                                )}>{quiz.difficulty}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="success"
                                  size="sm"
                                  onClick={() => handleReview(quiz.id, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleReview(quiz.id, "reject")}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                            <p className="text-base font-medium text-white">{quiz.question}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {quiz.options.map((option, optionIndex) => (
                                <div
                                  key={optionIndex}
                                  className={cn(
                                    "rounded-xl border border-accent-purple/10 bg-accent-purple/[0.06] p-3 text-sm",
                                    option === quiz.correctAnswer ? "border-emerald-500/50 bg-emerald-500/5 text-white" : "text-slate-400",
                                  )}
                                >
                                  {option}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
              {pendingQuizzes.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-accent-purple/10 text-slate-500">
                  {publishedQuizzes.filter((q) => isQuizStatus(q.status, "pending")).length === 0 ? "No pending quizzes to review." : "No quizzes match the selected filters."}
                </div>
              ) : null}
            </div>
          </PremiumCard>
        ) : null}

        {activeTab === "mockups" ? (
          <div className="space-y-6">
            <div className="glass-panel rounded-[28px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      { key: "live", label: "Live now" },
                      { key: "scheduled", label: "Scheduled" },
                      { key: "draft", label: "Drafts" },
                      { key: "ended", label: "Ended" },
                    ] as const
                  ).map((stat) => (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => {
                        setMockView("exams");
                        setExamFilter(stat.key);
                      }}
                      className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] px-4 py-3 text-left transition-colors hover:border-accent-purple/30"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {stat.label}
                      </p>
                      <p className={cn("mt-1 text-2xl font-bold", EXAM_STATUS_STYLES[stat.key].text)}>
                        {examCounts[stat.key]}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="solid" onClick={() => setMockView("ai")}>
                    <Sparkles size={16} />
                    Create with AI
                  </Button>
                  <Button type="button" onClick={startNewExam}>
                    <PlusCircle size={16} />
                    New Mock Exam
                  </Button>
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Mock exam sections"
                className="mt-5 flex flex-wrap gap-2 border-t border-accent-purple/10 pt-4"
              >
                {(
                  [
                    { key: "exams", label: "Exams", icon: Layers, count: mockExams.length },
                    {
                      key: "builder",
                      label: editingExamId ? "Edit Exam" : "Build Exam",
                      icon: editingExamId ? Edit : PlusCircle,
                      count: null,
                    },
                    { key: "ai", label: "AI Generator", icon: Sparkles, count: null },
                    {
                      key: "questions",
                      label: "Question Bank",
                      icon: FileQuestion,
                      count: mockQuestions.length,
                    },
                  ] as const
                ).map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    role="tab"
                    aria-selected={mockView === view.key}
                    onClick={() => setMockView(view.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                      mockView === view.key
                        ? "bg-accent-purple text-[#fff] shadow-glow"
                        : "text-slate-500 hover:bg-accent-purple/[0.08] hover:text-accent-purple",
                    )}
                  >
                    <view.icon size={14} />
                    {view.label}
                    {view.count !== null ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px]",
                          mockView === view.key ? "bg-white/20" : "bg-accent-purple/10",
                        )}
                      >
                        {view.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {mockView === "exams" ? (
              <div id="teacher-mock-exam-list" className="scroll-mt-24 space-y-6">
                <div className="flex flex-wrap gap-2">
                  {(["all", "live", "scheduled", "draft", "ended"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setExamFilter(filter)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors",
                        examFilter === filter
                          ? "border-accent-purple bg-accent-purple/15 text-accent-purple"
                          : "border-accent-purple/15 text-slate-500 hover:border-accent-purple/40",
                      )}
                    >
                      {filter === "all" ? "All" : EXAM_STATUS_STYLES[filter].label}
                      <span className="ml-1.5 opacity-70">
                        {filter === "all" ? mockExams.length : examCounts[filter]}
                      </span>
                    </button>
                  ))}
                </div>

                {mockExams.length === 0 ? (
                  <div className="glass-panel flex flex-col items-center rounded-[28px] p-10 text-center">
                    <Layers size={28} className="text-accent-purple" />
                    <p className="mt-3 text-base font-semibold text-white">No mock exams yet</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Add questions to the question bank, then build an exam from them. Saved exams
                      are published to students straight away.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <Button type="button" onClick={() => setMockView("ai")}>
                        <Sparkles size={16} />
                        Generate with AI
                      </Button>
                      <Button type="button" variant="outline" onClick={startNewExam}>
                        <PlusCircle size={16} />
                        Build an exam
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setMockView("questions")}>
                        <FileQuestion size={16} />
                        Add questions
                      </Button>
                    </div>
                  </div>
                ) : null}

                {EXAM_SECTION_ORDER.filter(
                  (status) => examFilter === "all" || examFilter === status,
                ).map((status) => {
                  const sectionExams = examsWithStatus.filter((entry) => entry.displayStatus === status);
                  if (sectionExams.length === 0) {
                    return examFilter === status ? (
                      <div
                        key={status}
                        className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-center text-sm text-slate-500"
                      >
                        No {EXAM_STATUS_STYLES[status].label.toLowerCase()} exams.
                      </div>
                    ) : null;
                  }
                  return (
                    <section key={status} aria-label={EXAM_STATUS_STYLES[status].label}>
                      <div className="mb-3 flex items-baseline gap-3">
                        <h3 className={cn("text-sm font-bold uppercase tracking-widest", EXAM_STATUS_STYLES[status].text)}>
                          {EXAM_STATUS_STYLES[status].label}
                        </h3>
                        <p className="text-xs text-slate-500">{EXAM_STATUS_STYLES[status].hint}</p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        {sectionExams.map(({ exam, displayStatus }) => {
                          const expanded = expandedExamId === exam.id;
                          const courseTitle = exam.courseId
                            ? courses.find((course) => course.id === exam.courseId)?.title
                            : null;
                          return (
                            <div
                              key={exam.id}
                              className={cn(
                                "glass-panel rounded-[24px] border-l-4 p-5",
                                EXAM_STATUS_STYLES[displayStatus].border,
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-bold text-white">{exam.title}</p>
                                  {courseTitle ? (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                      <BookOpen size={12} />
                                      {courseTitle}
                                    </p>
                                  ) : null}
                                </div>
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset",
                                    EXAM_STATUS_STYLES[displayStatus].badge,
                                  )}
                                >
                                  {EXAM_STATUS_STYLES[displayStatus].label}
                                </span>
                              </div>
                              {exam.description ? (
                                <p className="mt-2 line-clamp-2 text-xs text-slate-400">{exam.description}</p>
                              ) : null}

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                                <span className="flex items-center gap-1">
                                  <FileQuestion size={12} />
                                  {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
                                </span>
                                <span className="flex items-center gap-1">
                                  {exam.durationSeconds ? <Clock3 size={12} /> : <Hourglass size={12} />}
                                  {exam.durationSeconds
                                    ? `${Math.round(exam.durationSeconds / 60)} min`
                                    : "No timer"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <CalendarClock size={12} />
                                  {formatExamWindow(exam)}
                                </span>
                              </div>

                              {displayStatus === "draft" ? (
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                                  <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                                    <Eye size={14} />
                                    Not visible to students yet.
                                  </p>
                                  <Button
                                    type="button"
                                    variant="success"
                                    size="sm"
                                    onClick={() => handlePublishMockExam(exam.id)}
                                  >
                                    <Check size={13} />
                                    Publish now
                                  </Button>
                                </div>
                              ) : null}

                              {expanded ? (
                                <ol className="mt-4 space-y-2">
                                  {(exam.questions ?? []).length === 0 ? (
                                    <li className="rounded-xl border border-dashed border-accent-purple/15 p-3 text-xs text-slate-500">
                                      No questions in this exam yet.
                                    </li>
                                  ) : (
                                    (exam.questions ?? []).map((question, index) => (
                                      <li
                                        key={question.id}
                                        className="flex items-start justify-between gap-3 rounded-xl bg-accent-purple/[0.06] p-3"
                                      >
                                        <p className="min-w-0 flex-1 text-xs font-semibold text-slate-300">
                                          {index + 1}. {question.question}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveExamQuestion(exam.id, question.id)}
                                          className="shrink-0 text-slate-600 transition-colors hover:text-rose-500"
                                          aria-label="Remove question"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </li>
                                    ))
                                  )}
                                </ol>
                              ) : null}

                              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent-purple/10 pt-3">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedExamId(expanded ? null : exam.id)}
                                  aria-expanded={expanded}
                                >
                                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  {expanded ? "Hide questions" : "View questions"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditMockExam(exam)}
                                >
                                  <Edit size={13} />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto hover:text-rose-600"
                                  onClick={() => handleDeleteMockExam(exam.id)}
                                >
                                  <Trash2 size={13} />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}

            {mockView === "builder" ? (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <PremiumCard
                  eyebrow={editingExamId ? "Editing" : "Step 1"}
                  title={editingExamId ? "Edit exam details" : "Exam details"}
                  description="Name the exam, then choose whether it has a timer and an availability window."
                >
                  <div className="space-y-4">
                    <Input
                      value={examForm.title}
                      onChange={(event) =>
                        setExamForm((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Exam title, e.g. Midterm Mock 1"
                    />
                    <Select
                      value={examForm.courseId}
                      onChange={(event) =>
                        setExamForm((current) => ({ ...current, courseId: event.target.value }))
                      }
                    >
                      <option value="">Course (optional)</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </Select>
                    <Textarea
                      value={examForm.description}
                      onChange={(event) =>
                        setExamForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Optional description shown to students"
                      className="h-20"
                    />

                    <div className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <input
                          type="checkbox"
                          checked={examForm.hasTimer}
                          onChange={(event) =>
                            setExamForm((current) => ({ ...current, hasTimer: event.target.checked }))
                          }
                          className="h-4 w-4 accent-accent-purple"
                        />
                        Exam timer
                      </label>
                      {examForm.hasTimer ? (
                        <div className="mt-3 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={examForm.durationMinutes}
                            onChange={(event) =>
                              setExamForm((current) => ({
                                ...current,
                                durationMinutes: event.target.value,
                              }))
                            }
                          />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            minutes
                          </span>
                        </div>
                      ) : null}
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <Hourglass size={13} />
                        {examForm.hasTimer
                          ? "Countdown starts when the student begins the exam."
                          : "No timer: students can submit any time."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <input
                          type="checkbox"
                          checked={examForm.hasTimeFrame}
                          onChange={(event) =>
                            setExamForm((current) => ({ ...current, hasTimeFrame: event.target.checked }))
                          }
                          className="h-4 w-4 accent-accent-purple"
                        />
                        Availability window
                      </label>
                      {examForm.hasTimeFrame ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Opens
                            <Input
                              type="datetime-local"
                              value={examForm.startsAt}
                              onChange={(event) =>
                                setExamForm((current) => ({ ...current, startsAt: event.target.value }))
                              }
                              className="mt-1"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Closes
                            <Input
                              type="datetime-local"
                              value={examForm.endsAt}
                              onChange={(event) =>
                                setExamForm((current) => ({ ...current, endsAt: event.target.value }))
                              }
                              className="mt-1"
                            />
                          </label>
                        </div>
                      ) : null}
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarClock size={13} />
                        {examForm.hasTimeFrame
                          ? "Students only see the exam between these times."
                          : "Always available once published."}
                      </p>
                    </div>
                  </div>
                </PremiumCard>

                <PremiumCard
                  eyebrow={editingExamId ? "Questions" : "Step 2"}
                  title="Choose questions"
                  description="Pick questions from your question bank. Pending questions are approved automatically when the exam is published."
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <Input
                        value={questionSearch}
                        onChange={(event) => setQuestionSearch(event.target.value)}
                        placeholder="Search questions or topics"
                        className="pl-9"
                        aria-label="Search questions"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllPickerQuestions}
                      disabled={pickerQuestions.length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExamForm((current) => ({ ...current, questionIds: [] }))}
                      disabled={examForm.questionIds.length === 0}
                    >
                      Clear
                    </Button>
                  </div>

                  <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                    {mockQuestions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-center">
                        <p className="text-sm text-slate-500">Your question bank is empty.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => setMockView("questions")}
                        >
                          <PlusCircle size={13} />
                          Add questions
                        </Button>
                      </div>
                    ) : pickerQuestions.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-center text-sm text-slate-500">
                        No questions match &ldquo;{questionSearch}&rdquo;.
                      </p>
                    ) : (
                      pickerQuestions.map((quiz) => {
                        const order = examForm.questionIds.indexOf(quiz.id);
                        const selected = order !== -1;
                        return (
                          <label
                            key={quiz.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all",
                              selected
                                ? "border-accent-purple bg-accent-purple/10"
                                : "border-accent-purple/10 hover:bg-accent-purple/[0.08]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleExamQuestion(quiz.id)}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold",
                                selected
                                  ? "border-accent-purple bg-accent-purple text-[#fff]"
                                  : "border-accent-purple/25 text-transparent",
                              )}
                            >
                              {selected ? order + 1 : ""}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-white">{quiz.question}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                <QuestionStatusBadge status={quiz.status} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                  {quiz.difficulty}
                                </span>
                                {quiz.topic ? (
                                  <span className="truncate text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                                    {quiz.topic}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PremiumCard>

                <div className="glass-panel sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[24px] p-4 xl:col-span-2">
                  <p className="text-sm text-slate-500">
                    <span className="font-bold text-white">{examForm.questionIds.length}</span> question
                    {examForm.questionIds.length === 1 ? "" : "s"} selected
                    {examForm.hasTimer && examForm.durationMinutes
                      ? ` · ${examForm.durationMinutes} min timer`
                      : ""}
                    {" · "}published to students when saved
                  </p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        resetExamForm();
                        setMockView("exams");
                      }}
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleCreateMockExam} disabled={isProcessing}>
                      {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {editingExamId ? "Update & Publish" : "Create & Publish"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {mockView === "ai" ? (
              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <PremiumCard
                  eyebrow="Full exam"
                  title="Generate a complete mock exam"
                  description="AI writes the questions from the course's lecture transcripts and assembles them into an exam."
                  accent="from-accent-purple/25 via-accent-cyan/15 to-transparent"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={aiExamForm.courseId}
                      onChange={(event) =>
                        setAiExamForm((current) => ({ ...current, courseId: event.target.value }))
                      }
                      aria-label="Course"
                    >
                      <option value="">Choose course...</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </Select>
                    <label className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Questions
                      <Input
                        type="number"
                        min={3}
                        max={30}
                        value={aiExamForm.questionCount}
                        onChange={(event) =>
                          setAiExamForm((current) => ({
                            ...current,
                            questionCount: Math.min(30, Math.max(3, Number(event.target.value) || 3)),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <Input
                    value={aiExamForm.title}
                    onChange={(event) =>
                      setAiExamForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Exam title (optional, generated if left empty)"
                    className="mt-4"
                  />
                  <Input
                    value={aiExamForm.topic}
                    onChange={(event) =>
                      setAiExamForm((current) => ({ ...current, topic: event.target.value }))
                    }
                    placeholder="Focus topic (optional), e.g. Arrays and loops"
                    className="mt-4"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <input
                        type="checkbox"
                        checked={aiExamForm.hasTimer}
                        onChange={(event) =>
                          setAiExamForm((current) => ({ ...current, hasTimer: event.target.checked }))
                        }
                        className="h-4 w-4 accent-accent-purple"
                      />
                      Exam timer
                    </label>
                    {aiExamForm.hasTimer ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={aiExamForm.durationMinutes}
                          onChange={(event) =>
                            setAiExamForm((current) => ({ ...current, durationMinutes: event.target.value }))
                          }
                          className="w-24"
                          aria-label="Timer minutes"
                        />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">minutes</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No timer: students can submit any time.</span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={() => handleGenerateAiExam("publish")}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      Generate &amp; Publish
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleGenerateAiExam("review")}
                      disabled={isProcessing}
                    >
                      <Edit size={16} />
                      Generate &amp; Review
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {isProcessing
                      ? "Generating questions. This can take up to a minute..."
                      : "Review opens the generated exam in the builder so you can swap questions before publishing."}
                  </p>
                </PremiumCard>

                <PremiumCard
                  eyebrow="Questions only"
                  title="Generate questions for the bank"
                  description="Add AI-written questions to the question bank to use in any exam later."
                >
                  <div className="grid gap-4 md:grid-cols-[1fr_120px]">
                    <Select
                      value={aiMockCourseId}
                      onChange={(event) => setAiMockCourseId(event.target.value)}
                    >
                      <option value="">Choose course...</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min={3}
                      max={10}
                      value={aiMockQuestionCount}
                      onChange={(event) => setAiMockQuestionCount(Number(event.target.value))}
                      aria-label="Number of questions"
                    />
                  </div>
                  <Input
                    value={aiMockTopic}
                    onChange={(event) => setAiMockTopic(event.target.value)}
                    placeholder="Optional topic to focus on"
                    className="mt-4"
                  />
                  <Button
                    type="button"
                    variant="solid"
                    className="mt-4"
                    onClick={handleCreateAiMock}
                    disabled={isProcessing}
                  >
                    <Sparkles size={16} />
                    Generate Questions
                  </Button>
                </PremiumCard>
                <div className="xl:col-span-2">
                  <PremiumCard
                    eyebrow="AI Generated"
                    title={`AI-generated questions (${aiQuestions.length})`}
                    description="Every question written by the AI generator, newest first. Approve or reject them here, or add them to an exam from the builder."
                  >
                    {aiQuestions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-center text-sm text-slate-500">
                        No AI-generated questions yet. Generate an exam or a set of questions above.
                      </div>
                    ) : (
                      <div className="grid max-h-[640px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
                        {aiQuestions.map((quiz) => {
                          const isNew = latestAiQuestionIds.includes(quiz.id);
                          return (
                            <div
                              key={quiz.id}
                              className={cn(
                                "rounded-2xl border p-4",
                                isNew
                                  ? "border-accent-purple/40 bg-accent-purple/10"
                                  : "border-accent-purple/10 bg-accent-purple/[0.06]",
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isNew ? (
                                    <span className="flex items-center gap-1 rounded-full bg-accent-purple px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#fff]">
                                      <Sparkles size={10} />
                                      New
                                    </span>
                                  ) : null}
                                  <QuestionStatusBadge status={quiz.status} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {quiz.difficulty}
                                  </span>
                                  <span className="truncate text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                                    {quiz.topic?.split("|").pop() || "Mock Exam"}
                                  </span>
                                </div>
                                {isQuizStatus(quiz.status, "pending") ? (
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="success"
                                      size="sm"
                                      onClick={() => handleReview(quiz.id, "approve")}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      onClick={() => handleReview(quiz.id, "reject")}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                              <p className="mt-3 text-sm font-semibold text-white">{quiz.question}</p>
                              {quiz.options?.length ? (
                                <ul className="mt-2 grid gap-1">
                                  {quiz.options.map((option) => (
                                    <li
                                      key={option}
                                      className={cn(
                                        "flex items-center gap-1.5 text-xs",
                                        option === quiz.correctAnswer
                                          ? "font-semibold text-emerald-600"
                                          : "text-slate-500",
                                      )}
                                    >
                                      {option === quiz.correctAnswer ? <Check size={12} /> : <span className="w-3" />}
                                      {option}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </PremiumCard>
                </div>
              </div>
            ) : null}

            {mockView === "questions" ? (
              <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-6">
                  <PremiumCard
                    eyebrow="Write"
                    title="Add a question"
                    description="Write your own question for the question bank."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
                        value={manualMockForm.courseId}
                        onChange={(event) =>
                          setManualMockForm((current) => ({ ...current, courseId: event.target.value }))
                        }
                      >
                        <option value="">Choose course...</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={manualMockForm.difficulty}
                        onChange={(event) =>
                          setManualMockForm((current) => ({
                            ...current,
                            difficulty: event.target.value as ManualMockForm["difficulty"],
                          }))
                        }
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </Select>
                    </div>
                    <Input
                      value={manualMockForm.topic}
                      onChange={(event) =>
                        setManualMockForm((current) => ({ ...current, topic: event.target.value }))
                      }
                      placeholder="Topic or subject"
                      className="mt-4"
                    />
                    <Textarea
                      value={manualMockForm.question}
                      onChange={(event) =>
                        setManualMockForm((current) => ({ ...current, question: event.target.value }))
                      }
                      placeholder="Write the question"
                      className="mt-4 h-24"
                    />
                    <Textarea
                      value={manualMockForm.options}
                      onChange={(event) =>
                        setManualMockForm((current) => ({ ...current, options: event.target.value }))
                      }
                      placeholder={"Options, one per line\nOption A\nOption B\nOption C"}
                      className="mt-4 h-28"
                    />
                    <Input
                      value={manualMockForm.correctAnswer}
                      onChange={(event) =>
                        setManualMockForm((current) => ({ ...current, correctAnswer: event.target.value }))
                      }
                      placeholder="Correct answer exactly as written above"
                      className="mt-4"
                    />
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={handleCreateManualMock}
                      disabled={isProcessing}
                    >
                      <PlusCircle size={16} />
                      Save Question
                    </Button>
                  </PremiumCard>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-4">
                    <p className="text-sm text-slate-500">Want questions generated for you?</p>
                    <Button type="button" variant="solid" size="sm" onClick={() => setMockView("ai")}>
                      <Sparkles size={13} />
                      Use the AI Generator
                    </Button>
                  </div>
                </div>

                <PremiumCard
                  eyebrow="Question Bank"
                  title={`All questions (${mockQuestions.length})`}
                  description="Every mock exam question. Approve or reject pending ones here, or let publishing an exam approve them."
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <Input
                        value={questionSearch}
                        onChange={(event) => setQuestionSearch(event.target.value)}
                        placeholder="Search questions or topics"
                        className="pl-9"
                        aria-label="Search questions"
                      />
                    </div>
                    {(["all", "pending", "approved", "rejected"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setQuestionStatusFilter(filter)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors",
                          questionStatusFilter === filter
                            ? "border-accent-purple bg-accent-purple/15 text-accent-purple"
                            : "border-accent-purple/15 text-slate-500 hover:border-accent-purple/40",
                        )}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                    {bankQuestions.map((quiz) => (
                      <div
                        key={quiz.id}
                        className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <QuestionStatusBadge status={quiz.status} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              {quiz.difficulty}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                              {quiz.topic || "Mock Exam"}
                            </span>
                          </div>
                          {isQuizStatus(quiz.status, "pending") ? (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="success"
                                size="sm"
                                onClick={() => handleReview(quiz.id, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => handleReview(quiz.id, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-white">{quiz.question}</p>
                        {quiz.options?.length ? (
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {quiz.options.map((option) => (
                              <li
                                key={option}
                                className={cn(
                                  "flex items-center gap-1.5 text-xs",
                                  option === quiz.correctAnswer
                                    ? "font-semibold text-emerald-600"
                                    : "text-slate-500",
                                )}
                              >
                                {option === quiz.correctAnswer ? <Check size={12} /> : <span className="w-3" />}
                                {option}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                    {bankQuestions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-accent-purple/15 p-6 text-center text-sm text-slate-500">
                        {mockQuestions.length === 0
                          ? "No questions yet. Write one or generate a set with AI."
                          : "No questions match these filters."}
                      </div>
                    ) : null}
                  </div>
                </PremiumCard>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "analytics" ? (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <Input
                type="text"
                placeholder="Search students by name or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="py-4 pl-12"
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
                      className="rounded-3xl border border-accent-purple/10 bg-accent-purple/[0.06] p-6 transition-all hover:bg-accent-purple/[0.12]"
                    >
                      <div className="mb-4 flex items-center gap-4">
                        <Avatar size="lg" title={student.name} />
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
                        <div className="rounded-2xl bg-accent-purple/[0.06] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Avg Score
                          </p>
                          <p className="mt-1 text-lg font-bold text-accent-cyan">
                            {progress?.avgScore ?? 0}%
                          </p>
                        </div>
                        <div className="rounded-2xl bg-accent-purple/[0.06] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Progress
                          </p>
                          <p className="mt-1 text-lg font-bold text-accent-purple">
                            {progress?.progressPercentage ?? 0}%
                          </p>
                        </div>
                      </div>
                      {(() => {
                        // The same per-course levels the server picks this student's quizzes by. Courses
                        // without recent quiz results use the starting level.
                        const courseTitle = new Map(courses.map((course) => [course.id, course.title]));
                        const levels =
                          adaptiveLevels
                            .find(
                              (item) =>
                                item.studentId === student.id ||
                                item.studentId.toLowerCase() === student.email.toLowerCase(),
                            )
                            ?.levels.filter((item) => courseTitle.has(item.courseId)) ?? [];
                        const rows =
                          levels.length > 0
                            ? levels.map((item) => ({
                                key: item.courseId,
                                label: courseTitle.get(item.courseId)!,
                                level: item.level,
                                title: `${item.averageScore}% average over the last ${item.attempts} quiz${item.attempts === 1 ? "" : "zes"} in this course.`,
                              }))
                            : [
                                {
                                  key: "default",
                                  label: "Starting level",
                                  level: DEFAULT_ADAPTIVE_LEVEL,
                                  title: "No quiz results in your courses yet.",
                                },
                              ];
                        return (
                          <div className="mt-3 rounded-2xl bg-accent-purple/[0.06] px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Adaptive Level
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {rows.map((row) => (
                                <li
                                  key={row.key}
                                  className="flex items-center justify-between gap-3"
                                  title={row.title}
                                >
                                  <span className="truncate text-xs text-slate-600">{row.label}</span>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                      LEVEL_BADGE_CLASS[row.level],
                                    )}
                                  >
                                    {formatLevel(row.level)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        fullWidth
                        className="mt-4 tracking-widest"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <Eye size={14} />
                        View Detailed Report
                      </Button>
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
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
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
                    <div className="rounded-2xl bg-accent-purple/[0.06] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Weak Topics
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedStudentReport.weakTopics.length ? (
                          selectedStudentReport.weakTopics.map((topic) => (
                            <span
                              key={topic}
                              className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-600"
                            >
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

                  <div className="space-y-3">
                    {selectedStudentReport.subjectRows.map((row) => (
                      <div
                        key={row.subject}
                        className="rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4"
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
                        <div className="mt-3 h-2 rounded-full bg-accent-purple/[0.06]">
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

        {activeTab === "alerts" ? (
          <div className="space-y-6">
            {riskAlerts.length > 0 ? (
              <Alert variant="error" className="flex items-center gap-2">
                <ShieldAlert size={18} />
                {riskAlerts.length} student{riskAlerts.length > 1 ? "s are" : " is"} performing below 50%. Immediate attention recommended.
              </Alert>
            ) : null}

            <PremiumCard
              eyebrow="Risk Alert"
              title="Students Below 50% Average Score"
              description="Learners whose average quiz score is under 50% are flagged for early intervention."
            >
              <div className="space-y-3">
                {riskAlerts.map(({ student, avgScore, progressPercentage, streakDays, lastActivityAt }) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar size="lg" title={student.name} />
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {student.name}
                        </h4>
                        <p className="text-xs text-slate-400">{student.email}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
                          <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-slate-600">
                            {progressPercentage}% progress
                          </span>
                          <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-slate-600">
                            {streakDays}-day streak
                          </span>
                          {lastActivityAt ? (
                            <span className="rounded-full bg-accent-purple/[0.06] px-2 py-0.5 text-slate-600">
                              Last active{" "}
                              {new Date(lastActivityAt).toLocaleDateString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-widest text-rose-600">
                        Avg Score
                      </p>
                      <p className="text-2xl font-bold text-rose-600">
                        {avgScore}%
                      </p>
                    </div>
                  </div>
                ))}
                {riskAlerts.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-accent-purple/10 text-slate-500">
                    No students are below the 50% threshold. All learners are on track.
                  </div>
                ) : null}
              </div>
            </PremiumCard>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
