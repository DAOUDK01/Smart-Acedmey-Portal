export function serializeQuiz<T extends Record<string, unknown>>(quiz: T) {
  const options = quiz.options;
  const normalizedOptions = Array.isArray(options)
    ? options
    : typeof options === "string"
      ? JSON.parse(options)
      : options;

  const topic = typeof quiz.topic === "string" ? quiz.topic : "";
  const segment = topic.includes("|") ? topic.split("|")[0] : undefined;

  return {
    ...quiz,
    status: String(quiz.status).toLowerCase(),
    options: normalizedOptions,
    segment,
  };
}

export function serializeQuizzes<T extends Record<string, unknown>>(quizzes: T[]) {
  return quizzes.map((quiz) => serializeQuiz(quiz));
}
