import { LectureSegmentInput } from "./transcript-segments";

type FallbackQuestion = {
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  correctAnswer: string;
  topic: string;
  timestamp?: number;
  segment?: string;
};

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 24);
}

function pickKeyTerm(sentence: string): string {
  const words = sentence
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((word) => word.length > 5 && /^[A-Za-z]/.test(word))
    .sort((a, b) => b.length - a.length);
  return words[0] || "the main concept";
}

function truncate(sentence: string, max = 150): string {
  return sentence.length > max ? `${sentence.slice(0, max - 3)}...` : sentence;
}

function buildSentenceQuestion(
  topic: string,
  segment: LectureSegmentInput,
  segments: LectureSegmentInput[],
  difficulty: "easy" | "medium" | "hard",
): FallbackQuestion {
  const ownSentences = splitSentences(segment.text);
  const otherSentences = segments
    .filter((item) => item !== segment)
    .flatMap((item) => splitSentences(item.text));

  const fallbackOptions = [
    `It explains ${pickKeyTerm(ownSentences[0] ?? segment.text)} in the context of ${topic}.`,
    `It introduces an unrelated topic outside ${topic}.`,
    `It contradicts the main idea of ${topic}.`,
    `It only defines ${pickKeyTerm(ownSentences[0] ?? segment.text)} without lecture context.`,
  ];

  const segmentLabel = segment.label;
  const topicName = segmentLabel ? `${segmentLabel}|${topic}` : topic;

  if (difficulty === "easy") {
    const correct = ownSentences[0] ?? segment.text;
    const distractors = otherSentences.slice(0, 3);
    return {
      difficulty,
      question: `In ${segmentLabel}, which of these statements is made in the lecture?`,
      options:
        distractors.length >= 3
          ? [truncate(correct), ...distractors.map(truncate)].slice(0, 4)
          : fallbackOptions,
      correctAnswer: truncate(correct),
      topic: topicName,
      timestamp: segment.timestamp,
      segment: segmentLabel,
    };
  }

  if (difficulty === "medium") {
    const source = ownSentences[0] ?? segment.text;
    const keyTerm = pickKeyTerm(source);
    const sentenceWithTerm =
      ownSentences.find((sentence) => sentence.toLowerCase().includes(keyTerm.toLowerCase())) ??
      source;
    const distractors = otherSentences.slice(0, 3);
    return {
      difficulty,
      question: `According to the lecture, which statement about "${keyTerm}" is true?`,
      options:
        distractors.length >= 3
          ? [truncate(sentenceWithTerm), ...distractors.map(truncate)].slice(0, 4)
          : fallbackOptions,
      correctAnswer: truncate(sentenceWithTerm),
      topic: topicName,
      timestamp: segment.timestamp,
      segment: segmentLabel,
    };
  }

  const correct = otherSentences[0] ?? ownSentences[0] ?? segment.text;
  const distractors = ownSentences.slice(0, 3);
  return {
    difficulty,
    question: `In ${segmentLabel}, which of the following was NOT mentioned by the lecturer?`,
    options:
      distractors.length >= 3
        ? [truncate(correct), ...distractors.map(truncate)].slice(0, 4)
        : fallbackOptions,
    correctAnswer: truncate(correct),
    topic: topicName,
    timestamp: segment.timestamp,
    segment: segmentLabel,
  };
}

export function generateFallbackQuizFromSegments(
  topic: string,
  segments: LectureSegmentInput[],
  questionCount = 3,
) {
  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
  const questions: FallbackQuestion[] = [];

  for (const segment of segments) {
    const siblings =
      segments.length > 1
        ? segments
        : [
            ...segments,
            ...[
              { label: "Segment 2", text: `${topic} covers related examples and common pitfalls.`, timestamp: 90, difficulty: "medium" as const },
              { label: "Segment 3", text: `${topic} concludes with best practices and review questions.`, timestamp: 180, difficulty: "hard" as const },
            ].slice(0, 2),
          ];
    for (const difficulty of difficulties) {
      questions.push(buildSentenceQuestion(topic, segment, siblings, difficulty));
    }
  }

  return {
    topic,
    questions: questions.slice(0, Math.max(1, questionCount)),
    provider: "local-fallback" as const,
  };
}

export function generateFallbackQuiz(
  topic?: string,
  transcript?: string,
  questionCount = 3,
) {
  const topicName = topic?.trim() || "Lecture Review";
  const source = transcript?.trim() || topicName;
  const sentences = splitSentences(source);
  const count = Math.max(1, Math.min(questionCount, 8));
  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];

  const segments: LectureSegmentInput[] = Array.from({ length: count }, (_, index) => ({
    label: `Segment ${index + 1}`,
    text: sentences[index % Math.max(sentences.length, 1)] || source,
    timestamp: 15 + index * 60,
    difficulty: difficulties[index % difficulties.length],
  }));

  return generateFallbackQuizFromSegments(topicName, segments);
}