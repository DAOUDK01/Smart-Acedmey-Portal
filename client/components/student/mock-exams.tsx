"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  Flag,
  Hourglass,
  Play,
  TimerReset,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumCard } from "../premium-card";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type MockExamQuiz = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  timestamp?: number;
  topic?: string;
  segment?: string;
};

export type MockExam = {
  id: string;
  title: string;
  description?: string | null;
  courseId?: string | null;
  durationSeconds?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: string;
  questionCount?: number;
  questions: MockExamQuiz[];
};

type QuizResult = {
  passed: boolean;
  correctAnswer: string;
  explanation: string;
};

type MockExamsProps = {
  exams: MockExam[];
  answeredQuizIds: Set<string>;
  onQuizAnswered: (quizId: string) => void;
  onSubmitAnswer: (
    quiz: MockExamQuiz,
    answer: string,
  ) => Promise<QuizResult | null>;
  onSubmitExam: (
    exam: MockExam,
    answers: Record<string, string>,
  ) => Promise<boolean>;
};

type ExamPhase = "idle" | "running" | "finished" | "terminated";

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number) {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MockExams({
  exams,
  answeredQuizIds,
  onQuizAnswered,
  onSubmitAnswer,
  onSubmitExam,
}: MockExamsProps) {
  const [phase, setPhase] = useState<ExamPhase>("idle");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [questionResults, setQuestionResults] = useState<Record<string, boolean>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [activeExam, setActiveExam] = useState<MockExam | null>(null);
  const [resultExam, setResultExam] = useState<MockExam | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittedExamIds, setSubmittedExamIds] = useState<Set<string>>(new Set());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const now = useMemo(() => Date.now(), [phase]);

  const availableExams = useMemo(() => {
    return exams.filter((exam) => {
      if (submittedExamIds.has(exam.id)) return false;
      const startsAt = exam.startsAt ? new Date(exam.startsAt).getTime() : null;
      const endsAt = exam.endsAt ? new Date(exam.endsAt).getTime() : null;
      if (startsAt && startsAt > now) return false;
      if (endsAt && endsAt < now) return false;
      return exam.questions.length > 0;
    });
  }, [exams, submittedExamIds, now]);

  const isTimed = activeExam?.durationSeconds != null;

  const startExam = (exam: MockExam) => {
    setActiveExam(exam);
    setResultExam(null);
    setSelectedAnswers({});
    setQuestionResults({});
    setScore(null);
    setTimeRemaining(exam.durationSeconds ?? 0);
    setElapsed(0);
    setCurrentQuestionIndex(0);
    setPhase("running");
  };

  const finishExam = useCallback(
    async (fromTimer = false) => {
      if (phaseRef.current !== "running") return;
      const exam = activeExam;
      if (!exam) return;
      // The result screen renders from resultExam; without this it came up blank.
      setResultExam(exam);
      setPhase("finished");

      const correct = Object.values(questionResults).filter(Boolean).length;
      setScore(correct);

      for (const quiz of exam.questions) {
        const answer = selectedAnswers[quiz.id];
        if (answer) {
          void onSubmitAnswer(quiz, answer).catch(() => null);
        }
        onQuizAnswered(quiz.id);
      }

      await onSubmitExam(exam, selectedAnswers).catch(() => false);
      setSubmittedExamIds((current) => {
        const next = new Set(current);
        next.add(exam.id);
        return next;
      });

      if (fromTimer) setTimeRemaining(0);
    },
    [
      activeExam,
      selectedAnswers,
      questionResults,
      onSubmitAnswer,
      onQuizAnswered,
      onSubmitExam,
    ],
  );

  const terminateExam = useCallback(async () => {
    if (phaseRef.current !== "running") return;
    const exam = activeExam;
    setPhase("terminated");
    setScore(0);
    if (!exam) return;

    // Record the attempt with no answers (score 0). Otherwise leaving the tab would
    // let a student see the correct answers and simply retake the exam.
    await onSubmitExam(exam, {}).catch(() => false);
    setSubmittedExamIds((current) => new Set(current).add(exam.id));
  }, [activeExam, onSubmitExam]);

  useEffect(() => {
    if (phase !== "running" || !activeExam) return;
    if (activeExam.durationSeconds == null) {
      const interval = setInterval(() => {
        setElapsed((value) => value + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
    const interval = setInterval(() => {
      setTimeRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(interval);
          void finishExam(true);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, activeExam, finishExam]);

  useEffect(() => {
    if (phase !== "running" || !activeExam?.durationSeconds) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        terminateExam();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [phase, activeExam, terminateExam]);

  const handleSelectAnswer = (quiz: MockExamQuiz, option: string) => {
    if (questionResults[quiz.id] !== undefined) return;
    setSelectedAnswers((current) => ({ ...current, [quiz.id]: option }));
    setQuestionResults((current) => ({
      ...current,
      [quiz.id]: option === quiz.correctAnswer,
    }));
  };

  if (availableExams.length === 0 && phase === "idle") {
    return (
      <PremiumCard
        eyebrow="Exam Center"
        title="Mock Exams"
        description="Practice with teacher-published mock exams across your courses."
      >
        <div className="py-8 text-center text-slate-500">
          No mock exams available right now. Check back once your teacher
          publishes one.
        </div>
      </PremiumCard>
    );
  }

  if (phase === "running" && activeExam) {
    const exam = activeExam;
    const quiz = exam.questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === exam.questions.length - 1;
    const answeredCount = Object.keys(questionResults).length;
    const currentScore = Object.values(questionResults).filter(Boolean).length;
    const lowTime = isTimed && timeRemaining <= 60;
    const displayTime = isTimed ? timeRemaining : elapsed;

    const examOverlay = (
      <Dialog label={exam.title || "Mock exam"} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm sm:p-8">
        <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-accent-purple/15 bg-ink-900 shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-accent-purple/15 px-6 py-4">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-white">
                {exam.title || "Mock Exam"}
              </h3>
              <p className="text-xs text-slate-500">
                Question {currentQuestionIndex + 1} of {exam.questions.length}
                {isTimed ? " - do not switch tabs" : " - no time limit"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-700">
                <Check size={16} />
                {currentScore}
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-4 py-2 font-mono text-xl font-bold tabular-nums",
                  lowTime
                    ? "animate-pulse bg-rose-500/10 text-rose-700"
                    : "bg-accent-purple/[0.06] text-white",
                )}
              >
                {isTimed ? <Clock size={18} /> : <TimerReset size={18} />}
                {formatTime(displayTime)}
              </div>
            </div>
          </div>

          <div className="px-6 pt-6">
            <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-accent-purple/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan transition-all duration-300"
                style={{
                  width: `${((currentQuestionIndex + 1) / exam.questions.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col rounded-2xl border border-accent-purple/15 bg-accent-purple/[0.06] p-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent-purple/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-purple">
                  Question {currentQuestionIndex + 1}
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                    quiz.difficulty === "easy"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : quiz.difficulty === "medium"
                        ? "bg-amber-500/10 text-amber-700"
                        : "bg-rose-500/10 text-rose-700",
                  )}
                >
                  {quiz.difficulty}
                </span>
                {quiz.topic ? (
                  <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    {quiz.topic}
                  </span>
                ) : null}
              </div>

              <p className="text-lg font-semibold text-white">{quiz.question}</p>

              <div className="mt-5 grid gap-2">
                {quiz.options.map((option) => {
                  const result = questionResults[quiz.id];
                  const isSelected = selectedAnswers[quiz.id] === option;
                  const isCorrect = result !== undefined && option === quiz.correctAnswer;
                  const isWrongPick = result !== undefined && isSelected && !isCorrect;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={result !== undefined}
                      onClick={() => handleSelectAnswer(quiz, option)}
                      className={cn(
                        "w-full rounded-2xl border p-3.5 text-left text-sm transition-all",
                        isCorrect
                          ? "border-emerald-500 bg-emerald-500/10 text-white"
                          : isWrongPick
                            ? "border-rose-500 bg-rose-500/10 text-white"
                            : isSelected
                              ? "border-accent-purple bg-accent-purple/10 text-white"
                              : "border-accent-purple/15 bg-accent-purple/[0.06] text-slate-600 hover:bg-accent-purple/[0.12]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        {option}
                        {isCorrect ? (
                          <Check size={16} className="shrink-0 text-emerald-600" />
                        ) : isWrongPick ? (
                          <X size={16} className="shrink-0 text-rose-600" />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {questionResults[quiz.id] !== undefined && (
                <p className="mt-3 text-sm">
                  {questionResults[quiz.id] ? (
                    <span className="text-emerald-700">Correct! +1 point.</span>
                  ) : (
                    <span className="text-rose-700">
                      Incorrect. The correct answer is: {quiz.correctAnswer}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-accent-purple/15 px-6 py-4">
            <Button
              variant="ghost"
              disabled={currentQuestionIndex === 0}
              onClick={() =>
                setCurrentQuestionIndex((index) => Math.max(0, index - 1))
              }
            >
              Previous
            </Button>
            <p className="text-xs text-slate-500">
              {answeredCount} of {exam.questions.length} answered
            </p>
            {isLastQuestion ? (
              <Button variant="success" onClick={() => void finishExam()}>
                <Flag size={14} />
                Submit Exam
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setCurrentQuestionIndex((index) =>
                    Math.min(exam.questions.length - 1, index + 1),
                  )
                }
              >
                Next Question
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    );

    if (typeof window === "undefined") return null;
    return createPortal(examOverlay, document.body);
  }

  const percentage =
    score !== null && resultExam && resultExam.questions.length > 0
      ? Math.round((score / resultExam.questions.length) * 100)
      : 0;
  const passed = percentage >= 60;

  return (
    <PremiumCard
      eyebrow="Exam Center"
      title="Mock Exams"
      description="Practice with teacher-published mock exams across your courses."
    >
      {phase === "idle" && (
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-slate-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              Timed exams start their countdown immediately. Leaving the tab
              ends a timed exam with a score of 0. Exams with no timer can be
              submitted any time while they remain open.
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {availableExams.map((exam) => {
              const startsAt = formatDateTime(exam.startsAt);
              const endsAt = formatDateTime(exam.endsAt);
              return (
                <div
                  key={exam.id}
                  className="flex flex-col gap-4 rounded-3xl border border-accent-purple/10 bg-accent-purple/[0.06] p-5 transition-all hover:bg-accent-purple/[0.1]"
                >
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {exam.title || "Mock Exam"}
                    </h3>
                    {exam.description ? (
                      <p className="mt-1 text-sm text-slate-400">
                        {exam.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-accent-purple/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {exam.questions.length} question
                      {exam.questions.length === 1 ? "" : "s"}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                        exam.durationSeconds
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-emerald-500/10 text-emerald-600",
                      )}
                    >
                      {exam.durationSeconds ? (
                        <>
                          <Clock size={12} />
                          {formatDuration(exam.durationSeconds)}
                        </>
                      ) : (
                        <>
                          <Hourglass size={12} />
                          No time limit
                        </>
                      )}
                    </span>
                    {endsAt || startsAt ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-accent-purple/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                        <CalendarClock size={12} />
                        {startsAt && !endsAt
                          ? `Opens ${startsAt}`
                          : !startsAt && endsAt
                            ? `Until ${endsAt}`
                            : startsAt && endsAt
                              ? `${startsAt} - ${endsAt}`
                              : "No deadline"}
                      </span>
                    ) : null}
                  </div>

                  <Button
                    size="lg"
                    className="mt-auto"
                    onClick={() => startExam(exam)}
                  >
                    <Play size={16} />
                    Start Exam
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "terminated" && (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
            <AlertTriangle size={28} className="text-rose-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Exam Terminated</h3>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              You left the exam tab, so the timed exam was stopped immediately.
              Your score is 0 for this attempt.
            </p>
          </div>
          <div className="rounded-2xl bg-rose-500/10 px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">
              Final Score
            </p>
            <p className="mt-1 text-3xl font-bold text-rose-700">0%</p>
          </div>
          <Button variant="secondary" onClick={() => setPhase("idle")}>
            Back to Exams
          </Button>
        </div>
      )}

      {phase === "finished" && resultExam && (
        <div className="flex flex-col gap-6 py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full",
                passed ? "bg-emerald-500/10" : "bg-rose-500/10",
              )}
            >
              {passed ? (
                <Check size={28} className="text-emerald-600" />
              ) : (
                <X size={28} className="text-rose-600" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {passed ? "Exam Passed!" : "Exam Completed"}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                You answered {score} of {resultExam.questions.length} questions
                correctly ({percentage}%). This exam has been removed from your
                list.
              </p>
            </div>
            <div className="rounded-2xl bg-accent-purple/[0.06] px-6 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Final Score
              </p>
              <p
                className={cn(
                  "mt-1 text-3xl font-bold",
                  passed ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {percentage}%
              </p>
            </div>
            <Button variant="secondary" onClick={() => setPhase("idle")}>
              Back to Exams
            </Button>
          </div>

          <div className="grid gap-3">
            {resultExam.questions.map((quiz, index) => {
              const answer = selectedAnswers[quiz.id];
              const correct = answer === quiz.correctAnswer;

              return (
                <div
                  key={quiz.id}
                  className="flex flex-col gap-2 rounded-2xl border border-accent-purple/10 bg-accent-purple/[0.06] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-white">
                      {index + 1}. {quiz.question}
                    </p>
                    {correct ? (
                      <Check size={16} className="shrink-0 text-emerald-600" />
                    ) : (
                      <X size={16} className="shrink-0 text-rose-600" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Your answer:{" "}
                    <span className={correct ? "text-emerald-700" : "text-rose-700"}>
                      {answer || "No answer"}
                    </span>
                  </p>
                  {!correct && (
                    <p className="text-xs text-slate-400">
                      Correct answer:{" "}
                      <span className="text-emerald-700">{quiz.correctAnswer}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PremiumCard>
  );
}