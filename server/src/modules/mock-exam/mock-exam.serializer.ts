import { serializeQuizzes } from "../quiz/quiz.serializer";

export function serializeMockExam(exam: any) {
  const questions = (exam.questions ?? [])
    .map((entry: any) => entry.question)
    .filter(Boolean);

  return {
    ...exam,
    status: String(exam.status).toLowerCase(),
    questionCount: questions.length,
    questions: serializeQuizzes(questions),
  };
}

export function serializeMockExams(exams: any[]) {
  return exams.map((exam) => serializeMockExam(exam));
}