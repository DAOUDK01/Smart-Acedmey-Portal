/**
 * Adaptive quiz difficulty: the teacher's difficulty on each quiz is never changed; it is only used to
 * choose which of a checkpoint's quizzes a particular student is shown, based on that student's
 * recent scores in the same subject.
 */
export type QuizDifficulty = "easy" | "medium" | "hard";

const LEVELS: QuizDifficulty[] = ["easy", "medium", "hard"];
// Only the most recent attempts per subject count, so the level follows the student as they improve.
export const ADAPTIVE_ATTEMPT_WINDOW = 10;
export const DEFAULT_ADAPTIVE_DIFFICULTY: QuizDifficulty = "medium";

/** 0–50% → easy, 51–75% → medium, 76–100% → hard; no history → medium. */
export function difficultyForScores(scores: number[]): QuizDifficulty {
  if (scores.length === 0) return DEFAULT_ADAPTIVE_DIFFICULTY;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  if (average <= 50) return "easy";
  if (average <= 75) return "medium";
  return "hard";
}

/** The target level when available, otherwise the nearest one (ties go to the easier level). */
export function closestAvailableDifficulty(
  target: QuizDifficulty,
  available: Iterable<string>,
): QuizDifficulty | null {
  const present = new Set(available);
  const targetRank = LEVELS.indexOf(target);
  const candidates = LEVELS.filter((level) => present.has(level)).sort(
    (a, b) =>
      Math.abs(LEVELS.indexOf(a) - targetRank) - Math.abs(LEVELS.indexOf(b) - targetRank) ||
      LEVELS.indexOf(a) - LEVELS.indexOf(b),
  );
  return candidates[0] ?? null;
}

export type AdaptiveQuiz = {
  id: string;
  lectureId?: string | null;
  sourceTopic?: string | null;
  timestamp?: number | null;
  difficulty: string;
};

/** Quizzes shown together (one lecture checkpoint, or one topic for lecture-less quizzes). */
function checkpointKey(quiz: AdaptiveQuiz) {
  const owner = quiz.lectureId ? `lecture:${quiz.lectureId}` : `topic:${quiz.sourceTopic ?? ""}`;
  return `${owner}|${quiz.timestamp ?? ""}`;
}

/**
 * Keeps, for every checkpoint, only the quizzes at the student's level for that quiz's subject
 * (falling back to the closest available level so no checkpoint is left empty). A checkpoint the
 * student has already answered keeps exactly the quizzes they answered, so a later level change
 * never re-opens it. Quiz objects are returned untouched, so their stored difficulty is preserved.
 */
export function selectAdaptiveQuizzes<T extends AdaptiveQuiz>(
  quizzes: T[],
  levelFor: (quiz: T) => QuizDifficulty,
  answeredQuizIds: ReadonlySet<string> = new Set(),
): T[] {
  const groups = new Map<string, T[]>();
  for (const quiz of quizzes) {
    const key = checkpointKey(quiz);
    groups.set(key, [...(groups.get(key) ?? []), quiz]);
  }

  const kept = new Set<T>();
  for (const group of groups.values()) {
    const answered = group.filter((quiz) => answeredQuizIds.has(quiz.id));
    if (answered.length > 0) {
      answered.forEach((quiz) => kept.add(quiz));
      continue;
    }
    const level = closestAvailableDifficulty(levelFor(group[0]), group.map((quiz) => quiz.difficulty));
    // Quizzes with a non-standard difficulty value cannot be ranked, so they are always kept.
    group
      .filter((quiz) => !LEVELS.includes(quiz.difficulty as QuizDifficulty) || quiz.difficulty === level)
      .forEach((quiz) => kept.add(quiz));
  }

  return quizzes.filter((quiz) => kept.has(quiz));
}

/** How many of a checkpoint's `count` questions go to each level (spread as evenly as possible). */
export function levelTargets(count: number): Record<QuizDifficulty, number> {
  const base = Math.floor(count / LEVELS.length);
  const extra = count % LEVELS.length;
  // Leftover questions go to medium first, then easy, so a short checkpoint still covers the middle.
  return {
    easy: base + (extra >= 2 ? 1 : 0),
    medium: base + (extra >= 1 ? 1 : 0),
    hard: base,
  };
}

/**
 * Balances one checkpoint's generated questions across easy/medium/hard so every student level has
 * its own quiz there. Provider questions keep their own label; a level the provider did not cover is
 * filled from `fallback` (relabelled to that level), and any remaining gap is filled with surplus
 * provider questions so the checkpoint still gets `count` questions. Returned easy → medium → hard.
 */
export function balanceCheckpointLevels<T extends { difficulty?: unknown }>(
  generated: T[],
  fallback: T[],
  count: number,
): Array<T & { difficulty: QuizDifficulty }> {
  const targets = levelTargets(count);
  const byLevel = new Map<QuizDifficulty, Array<T & { difficulty: QuizDifficulty }>>(
    LEVELS.map((level) => [level, []]),
  );
  const surplus: T[] = [];

  for (const question of generated) {
    const level = question.difficulty as QuizDifficulty;
    const bucket = byLevel.get(level);
    if (bucket && bucket.length < targets[level]) {
      bucket.push(question as T & { difficulty: QuizDifficulty });
    } else {
      surplus.push(question);
    }
  }

  const spareFallback = [...fallback];
  for (const level of LEVELS) {
    const bucket = byLevel.get(level)!;
    while (bucket.length < targets[level] && spareFallback.length > 0) {
      bucket.push({ ...spareFallback.shift()!, difficulty: level });
    }
  }

  const balanced = LEVELS.flatMap((level) => byLevel.get(level)!);
  // Not enough fallback material: top up with surplus provider questions under their own label.
  for (const question of surplus) {
    if (balanced.length >= count) break;
    const level = LEVELS.includes(question.difficulty as QuizDifficulty)
      ? (question.difficulty as QuizDifficulty)
      : DEFAULT_ADAPTIVE_DIFFICULTY;
    balanced.push({ ...question, difficulty: level });
  }
  return balanced.sort((a, b) => LEVELS.indexOf(a.difficulty) - LEVELS.indexOf(b.difficulty));
}
