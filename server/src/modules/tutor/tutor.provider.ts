const PLACEHOLDER_PATTERNS = [
  "your_openai_api_key",
  "your-openai-api-key",
  "your_groq_api_key",
  "your-groq-api-key",
  "your_api_key",
  "your_api",
  "your_secret",
  "changeme",
  "replace_me",
  "example",
];

export function isConfiguredApiKey(key?: string): boolean {
  if (!key?.trim()) return false;
  const normalized = key.trim().toLowerCase();
  if (normalized.length < 12) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export type TutorProvider = "groq" | "openai" | null;

/** Provider used for chat completions (Groq preferred, OpenAI fallback). */
export function resolveChatProvider(): TutorProvider {
  if (isConfiguredApiKey(process.env.GROQ_API_KEY)) {
    return "groq";
  }
  if (isConfiguredApiKey(process.env.OPENAI_API_KEY)) {
    return "openai";
  }
  return null;
}

/** Provider used for embeddings (OpenAI preferred, Groq fallback). */
export function resolveEmbeddingProvider(): TutorProvider {
  if (isConfiguredApiKey(process.env.OPENAI_API_KEY)) {
    return "openai";
  }
  if (isConfiguredApiKey(process.env.GROQ_API_KEY)) {
    return "groq";
  }
  return null;
}

export function resolveChatModel(): string | undefined {
  const provider = resolveChatProvider();
  if (provider === "groq") {
    return process.env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-120b";
  }
  if (provider === "openai") {
    return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
  }
  return undefined;
}

export function resolveEmbeddingModel(): string | undefined {
  const provider = resolveEmbeddingProvider();
  if (provider === "openai") {
    return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  }
  if (provider === "groq") {
    return process.env.GROQ_EMBEDDING_MODEL?.trim() || "nomic-embed-text-v1.5";
  }
  return undefined;
}

export function resolveEmbeddingDimensions(): number {
  const model = resolveEmbeddingModel() ?? "";
  if (model.startsWith("nomic")) {
    return 768;
  }
  return 1536;
}
