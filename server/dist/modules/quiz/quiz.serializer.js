"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeQuiz = serializeQuiz;
exports.serializeQuizzes = serializeQuizzes;
function serializeQuiz(quiz) {
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
function serializeQuizzes(quizzes) {
    return quizzes.map((quiz) => serializeQuiz(quiz));
}
