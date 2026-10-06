// Lightweight client helpers for auto-transcript extraction and quiz generation.
import { authenticatedFetch } from "@/lib/api";

export async function extractTranscriptFromUrl(
  url: string,
  apiBase = "http://localhost:4010",
): Promise<string | null> {
  if (!url || typeof window === "undefined") return null;

  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;
    const text = await resp.text();

    const m = text.match(
      /(transcript|captions?)[:\s\-\n]{0,40}([\s\S]{20,120})/i,
    );
    if (m && m[2]) return m[2].slice(0, 200);

    const meta = text.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
    );
    if (meta && meta[1]) return meta[1].slice(0, 200);

    return null;
  } catch {
    return null;
  }
}

/** Reads a local video/audio file's length from its metadata; null if the browser cannot decode it. */
export function readMediaDurationSeconds(file: File): Promise<number | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const finish = (value: number | null) => {
      URL.revokeObjectURL(objectUrl);
      media.removeAttribute("src");
      resolve(value);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () =>
      finish(Number.isFinite(media.duration) && media.duration > 0 ? Math.round(media.duration) : null);
    media.onerror = () => finish(null);
    media.src = objectUrl;
  });
}

export async function extractTranscriptFromFile(
  file: File,
  apiBase = "http://localhost:4010",
): Promise<{ transcript: string; videoUrl?: string; durationSeconds?: number } | null> {
  if (typeof window === "undefined") return null;

  const name = file.name.toLowerCase();
  if (name.endsWith(".srt") || name.endsWith(".vtt") || name.endsWith(".txt")) {
    try {
      const text = await file.text();
      const cleaned = text
        .replace(/\d{2}:\d{2}:\d{2},?\d{0,3}/g, " ")
        .replace(/\d+\n/g, " ");
      return { transcript: cleaned.trim() };
    } catch {
      return null;
    }
  }

  try {
    const form = new FormData();
    form.append("file", file);
    const res = await authenticatedFetch(`${apiBase}/api/teacher/transcribe`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const payload = await res.json();
      return {
        transcript: String(payload?.transcript || "").trim(),
        videoUrl: payload?.videoUrl,
        durationSeconds: Number(payload?.durationSeconds) > 0 ? Number(payload.durationSeconds) : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function autoGenerateQuizForDraft({
  topic,
  transcript,
  lectureId,
  questionCount = 3,
  apiBase = "http://localhost:4010/api/teacher/quizzes/generate",
}: {
  topic: string;
  transcript: string;
  lectureId: string;
  questionCount?: number;
  apiBase?: string;
}) {
  const res = await authenticatedFetch(apiBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic, transcript, lectureId, questionCount }),
  });

  if (!res.ok) throw new Error("remote quiz generation failed");
  return (await res.json()) as { topic: string; questions: any[] };
}
