// Lightweight client helpers for auto-transcript extraction and quiz generation.

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

export async function extractTranscriptFromFile(
  file: File,
  apiBase = "http://localhost:4010",
): Promise<{ transcript: string; videoUrl?: string } | null> {
  if (typeof window === "undefined") return null;

  const name = file.name.toLowerCase();
  if (name.endsWith(".srt") || name.endsWith(".vtt") || name.endsWith(".txt")) {
    try {
      const text = await file.text();
      const cleaned = text
        .replace(/\d{2}:\d{2}:\d{2},?\d{0,3}/g, " ")
        .replace(/\d+\n/g, " ");
      return { transcript: cleaned.slice(0, 200) };
    } catch {
      return null;
    }
  }

  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${apiBase}/api/teacher/transcribe`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const payload = await res.json();
      return {
        transcript: String(payload?.transcript || "").slice(0, 200),
        videoUrl: payload?.videoUrl,
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
  const res = await fetch(apiBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, transcript, lectureId, questionCount }),
  });

  if (!res.ok) throw new Error("remote quiz generation failed");
  return (await res.json()) as { topic: string; questions: any[] };
}
