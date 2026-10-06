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

const DIFFICULTIES: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];

// Common words that make poor answers for a fill-in-the-blank question.
const STOPWORDS = new Set(
  (
    "about above after again against because before being below between both could does doing during " +
    "each further having here itself just more most other ourselves over same should some such than " +
    "that their theirs them themselves then there these they this those through under until very what " +
    "when where which while whom will with would your yours yourself actually basically really thing " +
    "things something someone everyone going gonna wanna right okay today first second third another " +
    "also always never every people little great example examples different important lecture video " +
    "segment transcript student students however without within whole therefore although whether " +
    "since unless instead rather maybe perhaps quite"
  ).split(" "),
);

// Greetings and course housekeeping are not teaching content.
const FILLER_SENTENCE_PATTERN =
  /^(?:hello|hi|hey|welcome|thank|thanks|okay|ok|so,? today|today|in this (?:video|lecture|session|class)|let'?s (?:get started|begin|start)|don'?t forget|see you)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim().replace(/[.!?]+$/, ""))
    .filter((part) => part.split(/\s+/).length >= 6 && part.length <= 220)
    .filter((part) => !FILLER_SENTENCE_PATTERN.test(part));
}

function keyTerms(sentence: string): string[] {
  const seen = new Set<string>();
  return sentence
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((word) => {
      const lower = word.toLowerCase();
      if (word.length < 5 || !/^[A-Za-z][A-Za-z0-9-]*$/.test(word) || STOPWORDS.has(lower) || seen.has(lower)) {
        return false;
      }
      seen.add(lower);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

function wordForm(word: string): string {
  const lower = word.toLowerCase();
  if (/(?:tion|sion|ment|ness|ity|ance|ence|ism)$/.test(lower)) return "noun";
  if (/ing$/.test(lower)) return "ing";
  if (/ed$/.test(lower)) return "ed";
  if (/ly$/.test(lower)) return "ly";
  if (/(?:ies|[^s]s)$/.test(lower)) return "plural";
  return "other";
}

function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed + 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const swap = Math.floor((state / 233280) * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Turns a real transcript sentence into a fill-in-the-blank question: the most specific term is blanked
 * out and the distractors are other key terms taught in the lecture, so every option is on-topic.
 */
function buildClozeQuestion(
  topic: string,
  segment: LectureSegmentInput,
  sentence: string,
  term: string,
  termPool: string[],
  difficulty: "easy" | "medium" | "hard",
  seed: number,
): FallbackQuestion | null {
  // Distractors of the same word form (noun, -ing, plural...) keep the blank from giving the answer away.
  const termForm = wordForm(term);
  const isCapitalized = /^[A-Z]/.test(term);
  const distractors = shuffleDeterministic(
    termPool.filter((candidate) => candidate.toLowerCase() !== term.toLowerCase()),
    seed,
  )
    .sort((a, b) => Number(wordForm(b) === termForm) - Number(wordForm(a) === termForm))
    .slice(0, 3)
    .map((candidate) =>
      isCapitalized
        ? candidate.charAt(0).toUpperCase() + candidate.slice(1)
        : /^[A-Z][a-z]/.test(candidate)
          ? candidate.toLowerCase()
          : candidate,
    );
  if (distractors.length < 3) return null;

  const blanked = sentence.replace(new RegExp(`\\b${term.replace(/[-]/g, "\\-")}\\b`), "_____");
  if (blanked === sentence) return null;

  return {
    difficulty,
    question: `Fill in the blank: "${blanked}."`,
    options: shuffleDeterministic([term, ...distractors], seed + 7),
    correctAnswer: term,
    topic: `${segment.label}|${topic}`,
    timestamp: segment.timestamp,
    segment: segment.label,
  };
}

/** Builds up to `count` questions grounded only in `segment`; other segments widen the distractor pool. */
export function generateFallbackQuestionsForSegment(
  topic: string,
  segment: LectureSegmentInput,
  segments: LectureSegmentInput[],
  count = 3,
): FallbackQuestion[] {
  const sentences = splitSentences(segment.text);
  const candidates = sentences
    .map((sentence) => ({ sentence, terms: keyTerms(sentence) }))
    .filter((item) => item.terms.length > 0)
    // Prefer sentences that carry more specific vocabulary.
    .sort((a, b) => b.terms[0].length - a.terms[0].length);

  const termPool = Array.from(
    new Map(
      [segment, ...segments.filter((item) => item !== segment)]
        .flatMap((item) => splitSentences(item.text).flatMap(keyTerms))
        .map((term) => [term.toLowerCase(), term] as const),
    ).values(),
  );

  const questions: FallbackQuestion[] = [];
  const usedTerms = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    if (questions.length >= count) break;
    const term = candidate.terms.find((item) => !usedTerms.has(item.toLowerCase()));
    if (!term) continue;
    const question = buildClozeQuestion(
      topic,
      segment,
      candidate.sentence,
      term,
      termPool,
      DIFFICULTIES[questions.length % DIFFICULTIES.length],
      index,
    );
    if (question) {
      usedTerms.add(term.toLowerCase());
      questions.push(question);
    }
  }

  return questions;
}
