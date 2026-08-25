const PLACEHOLDER_PATTERNS = [
  "your_quiz_provider_api_key_here",
  "your_api_key",
  "your_secret",
  "changeme",
  "replace_me",
  "example",
];

export function isConfiguredApiKey(key?: string): boolean {
  if (!key?.trim()) return false;
  const normalized = key.trim().toLowerCase();
  if (normalized.length < 8) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function resolveOllamaUrl(): string | undefined {
  if (process.env.OLLAMA_URL?.trim()) {
    return process.env.OLLAMA_URL.trim();
  }

  const base = process.env.OLLAMA_BASE_URL?.trim();
  if (!base) return undefined;

  const normalized = base.replace(/\/$/, "");
  return normalized.endsWith("/api/generate")
    ? normalized
    : `${normalized}/api/generate`;
}

export type QuizAiProvider = "groq" | "openai" | null;

/** Provider used for AI quiz generation (Groq preferred, OpenAI fallback). */
export function resolveQuizAiProvider(): QuizAiProvider {
  if (isConfiguredApiKey(process.env.GROQ_API_KEY)) {
    return "groq";
  }
  if (isConfiguredApiKey(process.env.OPENAI_API_KEY)) {
    return "openai";
  }
  return null;
}

export function resolveQuizAiModel(): string | undefined {
  const provider = resolveQuizAiProvider();
  if (provider === "groq") {
    return process.env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-120b";
  }
  if (provider === "openai") {
    return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
  }
  return undefined;
}

export function resolveQuizAiBaseUrl(): string | undefined {
  const provider = resolveQuizAiProvider();
  if (provider === "groq") {
    return "https://api.groq.com/openai/v1/chat/completions";
  }
  if (provider === "openai") {
    return "https://api.openai.com/v1/chat/completions";
  }
  return undefined;
}

export function resolveQuizAiApiKey(): string | undefined {
  const provider = resolveQuizAiProvider();
  if (provider === "groq") {
    return process.env.GROQ_API_KEY;
  }
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY;
  }
  return undefined;
}
