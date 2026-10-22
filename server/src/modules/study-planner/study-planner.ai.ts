import { Injectable, Logger } from "@nestjs/common";
import {
  resolveQuizAiApiKey,
  resolveQuizAiBaseUrl,
  resolveQuizAiModel,
  resolveQuizAiProvider,
} from "../quiz/quiz.provider";
import { PRIORITIES, PlannerInput, Priority, StudyUnit, ValidatedAdvice } from "./study-planner.types";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_SUMMARY_CHARS = 600;
const MAX_NOTE_CHARS = 200;
const MAX_TIPS = 4;

export const STUDY_PLANNER_SYSTEM_PROMPT = `You are an academic study coach helping a student prioritise a study plan.
You receive the student's study units with REAL data from their learning portal. The application builds the calendar itself; your job is only to prioritise units and explain briefly.

RULES:
1. Only use the facts provided. Never invent quiz scores, percentages, attempt counts, lecture progress, exam dates, links or resources.
2. A unit whose "quizAverage" is missing has no reliable quiz data: do not claim the student is weak or strong at it based on scores.
3. Weak quiz performance, low confidence, unfinished lectures and near deadlines deserve higher priority.
4. Use only the unit keys you were given.
5. Keep "summary" under 80 words, each "note" under 25 words, and each tip under 25 words. Use plain, encouraging language for a student.

Return strict JSON:
{
  "summary": "string",
  "units": [{ "key": "unit key", "priority": "HIGH|MEDIUM|LOW", "note": "string" }],
  "tips": ["string"]
}
List "units" in the order the student should focus on them.`;

/** The facts the model sees. Performance figures are only included when they are reliable. */
export function buildAdvicePrompt(units: StudyUnit[], input: PlannerInput, endDate: string) {
  return JSON.stringify({
    plan: {
      startDate: input.startDate,
      endDate,
      examDate: input.examDate,
      dailyMinutes: input.dailyMinutes,
      targetScore: input.targetScore,
    },
    units: units.map((unit) => ({
      key: unit.key,
      kind: unit.kind,
      subject: unit.subject,
      topic: unit.topic,
      lectureCompleted: unit.kind === "lecture" ? unit.lectureCompleted : undefined,
      watchPercent: unit.watchPercent != null ? Math.round(unit.watchPercent) : undefined,
      quizAverage: unit.reliable && unit.performance ? Math.round(unit.performance.averageScore) : undefined,
      latestQuizScore: unit.reliable && unit.performance ? Math.round(unit.performance.latestScore) : undefined,
      quizAttempts: unit.performance?.attempts ?? 0,
      confidence: unit.confidence ?? undefined,
      deadline: unit.deadline ?? undefined,
      rulePriority: unit.priority,
    })),
  });
}

export type AllowedFacts = { percentages: Set<number>; attempts: Set<number> };

export function allowedFactsFor(units: StudyUnit[], input: PlannerInput): AllowedFacts {
  const percentages = new Set<number>();
  const attempts = new Set<number>();
  for (const unit of units) {
    if (unit.watchPercent != null) percentages.add(Math.round(unit.watchPercent));
    if (unit.performance) {
      attempts.add(unit.performance.attempts);
      if (unit.reliable) {
        percentages.add(Math.round(unit.performance.averageScore));
        percentages.add(Math.round(unit.performance.latestScore));
      }
    }
  }
  if (input.targetScore != null) percentages.add(input.targetScore);
  return { percentages, attempts };
}

/** True when the text states a metric that is not in the student's data, or links somewhere. */
export function hasUnsupportedClaim(text: string, facts: AllowedFacts): boolean {
  if (/https?:\/\/|www\./i.test(text)) return true;
  for (const match of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/gi)) {
    if (!facts.percentages.has(Math.round(Number(match[1])))) return true;
  }
  for (const match of text.matchAll(/scor\w*\s+(?:of\s+|was\s+|is\s+)?(\d{1,3})\b(?!\s*(?:%|percent))/gi)) {
    if (!facts.percentages.has(Number(match[1]))) return true;
  }
  for (const match of text.matchAll(/(\d+)\s+(?:quiz\s+)?attempts?\b/gi)) {
    if (!facts.attempts.has(Number(match[1]))) return true;
  }
  return false;
}

function cleanText(value: unknown, maxChars: number, facts: AllowedFacts): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > maxChars) return null;
  return hasUnsupportedClaim(text, facts) ? null : text;
}

/**
 * Validates the model's JSON against the units that really exist. Unknown keys, invalid priorities,
 * oversized text and unsupported claims are dropped. Returns null when nothing usable remains.
 */
export function validateAdvice(raw: unknown, units: StudyUnit[], facts: AllowedFacts): ValidatedAdvice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const keys = new Set(units.map((unit) => unit.key));
  const seen = new Set<string>();

  const validUnits: ValidatedAdvice["units"] = [];
  if (Array.isArray(data.units)) {
    for (const item of data.units) {
      if (!item || typeof item !== "object") continue;
      const { key, priority, note } = item as Record<string, unknown>;
      if (typeof key !== "string" || !keys.has(key) || seen.has(key)) continue;
      const normalizedPriority = typeof priority === "string" ? priority.toUpperCase() : "";
      if (!(PRIORITIES as readonly string[]).includes(normalizedPriority)) continue;
      seen.add(key);
      validUnits.push({ key, priority: normalizedPriority as Priority, note: cleanText(note, MAX_NOTE_CHARS, facts) });
    }
  }

  const summary = cleanText(data.summary, MAX_SUMMARY_CHARS, facts);
  const tips = Array.isArray(data.tips)
    ? data.tips
        .map((tip) => cleanText(tip, MAX_NOTE_CHARS, facts))
        .filter((tip): tip is string => tip !== null)
        .slice(0, MAX_TIPS)
    : [];

  if (validUnits.length === 0 && !summary) return null;
  return { summary, units: validUnits, tips };
}

export class StudyPlannerAiError extends Error {}

/** Calls the portal's configured chat provider (Groq preferred, OpenAI fallback) in JSON mode. */
@Injectable()
export class StudyPlannerAiClient {
  private readonly logger = new Logger(StudyPlannerAiClient.name);

  isConfigured(): boolean {
    return resolveQuizAiProvider() !== null;
  }

  /** Returns the parsed JSON, or null when no provider is configured. Throws on timeouts and bad responses. */
  async requestAdvice(userPrompt: string): Promise<unknown | null> {
    const apiKey = resolveQuizAiApiKey();
    const baseUrl = resolveQuizAiBaseUrl();
    const model = resolveQuizAiModel();
    if (!apiKey || !baseUrl || !model) return null;

    const timeoutMs = Number(process.env.STUDY_PLANNER_AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: STUDY_PLANNER_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) throw new StudyPlannerAiError(`AI request failed with status ${response.status}`);
      const raw = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = raw.choices?.[0]?.message?.content;
      if (!content) throw new StudyPlannerAiError("AI response missing content");
      try {
        return JSON.parse(content);
      } catch {
        throw new StudyPlannerAiError("AI response was not valid JSON");
      }
    } catch (error) {
      if (error instanceof StudyPlannerAiError) throw error;
      const message = (error as Error)?.name === "AbortError" ? "AI request timed out" : "AI request failed";
      this.logger.warn(`${message}: ${(error as Error)?.message ?? "unknown error"}`);
      throw new StudyPlannerAiError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
