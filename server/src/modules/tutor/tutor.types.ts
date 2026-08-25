export type TutorMode = "general" | "lecture" | "personal";

export type TutorChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TutorReplySource = {
  title: string;
  snippet: string;
  score?: number;
};

export type TutorChatResponse = {
  reply: string;
  mode: TutorMode;
  sources?: TutorReplySource[];
  fallback?: boolean;
};

const PERSONAL_PATTERNS = [
  /\bmy\b/,
  /\bmine\b/,
  /how am i/,
  /how i (am|'m|m )doing/,
  /my progress/,
  /my score/,
  /my weak/,
  /my avg/,
  /my average/,
  /my performance/,
  /my streak/,
  /what should i/,
  /recommend/i,
  /personalized/i,
  /for my/,
  /my grades?/i,
  /am i on track/,
  /do i need/,
  /how (am|'m|m) i doing/i,
  /which (topic|subject|lecture) should i/i,
];

const LECTURE_PATTERNS = [
  /overview/i,
  /key notes/i,
  /notes from/i,
  /takeaways?/i,
  /key (points|concepts|takeaways|ideas)/i,
  /main (points|ideas|concepts)/i,
  /notes/i,
  /covered in/i,
  /topics? in/i,
  /content of/i,
];

// A message only counts as lecture-related when it references course material
// ("lecture", "video", "lesson", "class", "chapter", "course", "module").
const LECTURE_REFERENCE = /\b(lecture|video|lesson|class|chapter|course|module)\b/i;

const LECTURE_QUESTION = /\b(what|how|explain|about|did|is|was|are|does|tell)\b/i;

export function classifyTutorIntent(message: string): TutorMode {
  const text = message.trim();

  // Summary/recap requests must always go to lecture mode, even when they
  // also contain personal words ("summarize this for me").
  const isSummaryRequest =
    /summar(?:y|ies|ize|ise|ization|isation)|recap|key notes|takeaways?/i.test(text);
  if (isSummaryRequest) {
    return "lecture";
  }

  const isPersonal = PERSONAL_PATTERNS.some((pattern) => pattern.test(text));
  if (isPersonal) {
    return "personal";
  }

  const mentionsLecture = LECTURE_REFERENCE.test(text);
  const isLecture =
    LECTURE_PATTERNS.some((pattern) => pattern.test(text)) ||
    (mentionsLecture && LECTURE_QUESTION.test(text));
  if (isLecture) {
    return "lecture";
  }

  return "general";
}
