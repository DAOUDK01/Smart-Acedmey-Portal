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
