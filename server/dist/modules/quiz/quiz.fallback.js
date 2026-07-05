"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFallbackQuizFromSegments = generateFallbackQuizFromSegments;
exports.generateFallbackQuiz = generateFallbackQuiz;
function buildQuestion(topic, sentence, difficulty, segmentLabel, timestamp) {
    const snippet = sentence.length > 110 ? `${sentence.slice(0, 107)}...` : sentence;
    const focusWord = sentence
        .split(/\s+/)
        .find((word) => word.length > 5 && /^[a-z]/i.test(word))
        ?.replace(/[^a-z0-9]/gi, "") || "concept";
    const correct = `It explains ${focusWord} in the context of ${topic}.`;
    const options = [
        correct,
        `It introduces an unrelated topic outside ${topic}.`,
        `It contradicts the main idea of ${topic}.`,
        `It only defines ${focusWord} without lecture context.`,
    ];
    return {
        difficulty,
        question: `At ${segmentLabel ?? "this segment"}, which statement best matches: "${snippet}"?`,
        options,
        correctAnswer: correct,
        topic: segmentLabel ? `${segmentLabel}|${topic}` : topic,
        timestamp,
        segment: segmentLabel,
    };
}
function generateFallbackQuizFromSegments(topic, segments) {
    const questions = segments.map((segment) => buildQuestion(topic, segment.text, segment.difficulty, segment.label, segment.timestamp));
    return {
        topic,
        questions,
        provider: "local-fallback",
    };
}
function generateFallbackQuiz(topic, transcript, questionCount = 3) {
    const topicName = topic?.trim() || "Lecture Review";
    const source = transcript?.trim() || topicName;
    const sentences = source
        .split(/[.!?\n]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 24);
    const count = Math.max(1, Math.min(questionCount, 8));
    const difficulties = ["easy", "medium", "hard"];
    const questions = [];
    for (let index = 0; index < count; index += 1) {
        const sentence = sentences[index % Math.max(sentences.length, 1)] || source;
        questions.push(buildQuestion(topicName, sentence, difficulties[index % difficulties.length], `Segment ${index + 1}`));
    }
    return {
        topic: topicName,
        questions,
        provider: "local-fallback",
    };
}
