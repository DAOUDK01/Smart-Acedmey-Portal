export type UserRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

export interface QuizJsonPayload {
  topic: string;
  questions: Array<{
    difficulty: "easy" | "medium" | "hard";
    question: string;
    options: string[];
    correctAnswer: string;
    topic?: string;
    bloomLevel?: string;
  }>;
}
