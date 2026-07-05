export type SegmentDifficulty = "easy" | "medium" | "hard";

export type LectureSegment = {
  label: string;
  text: string;
  timestamp: number;
  difficulty: SegmentDifficulty;
};

const DEFAULT_DIFFICULTIES: SegmentDifficulty[] = ["easy", "medium", "hard"];

function splitEvenly(text: string, count: number): string[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);

  if (sentences.length === 0) {
    return Array.from({ length: count }, () => text.trim() || "Lecture content");
  }

  const chunkSize = Math.max(1, Math.ceil(sentences.length / count));
  const chunks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const slice = sentences.slice(index * chunkSize, (index + 1) * chunkSize);
    if (slice.length > 0) {
      chunks.push(`${slice.join(". ")}.`);
    }
  }

  while (chunks.length < count) {
    chunks.push(chunks[chunks.length - 1] ?? text);
  }

  return chunks.slice(0, count);
}

export function splitTranscriptIntoSegments(
  transcript: string,
  durationSeconds = 600,
  segmentCount = 3,
): LectureSegment[] {
  const cleaned = transcript.trim();
  const labeledBlocks = cleaned.match(/\[Segment\s+\d+\][\s\S]*?(?=(?:\[Segment\s+\d+\])|$)/gi);

  let texts: string[] = [];
  if (labeledBlocks && labeledBlocks.length > 0) {
    texts = labeledBlocks
      .map((block) => block.replace(/^\[Segment\s+\d+\]\s*/i, "").trim())
      .filter(Boolean);
  } else {
    const paragraphs = cleaned
      .split(/\n\s*\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 20);

    texts =
      paragraphs.length >= segmentCount
        ? paragraphs.slice(0, segmentCount)
        : splitEvenly(cleaned, segmentCount);
  }

  const safeDuration = Math.max(60, durationSeconds);
  const count = Math.max(1, Math.min(texts.length || segmentCount, segmentCount));

  return texts.slice(0, count).map((text, index) => ({
    label: `Segment ${index + 1}`,
    text,
    timestamp: Math.max(
      15,
      Math.round(((index + 1) / (count + 1)) * safeDuration),
    ),
    difficulty: DEFAULT_DIFFICULTIES[index % DEFAULT_DIFFICULTIES.length],
  }));
}

export function parseTimestampInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.includes(":")) {
    const [mins, secs] = trimmed.split(":").map((part) => Number(part) || 0);
    return mins * 60 + secs;
  }
  return Number(trimmed) || 0;
}

export function formatTimestampInput(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
