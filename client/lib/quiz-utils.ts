export type QuizStatus =
  | "pending"
  | "teacher_approved"
  | "approved"
  | "rejected"
  | "edited";

export function normalizeQuizStatus(status: string): QuizStatus {
  return status.toLowerCase() as QuizStatus;
}

export function isQuizStatus(status: string, expected: QuizStatus) {
  return normalizeQuizStatus(status) === expected;
}
