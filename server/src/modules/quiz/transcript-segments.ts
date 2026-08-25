export type SegmentDifficulty = "easy" | "medium" | "hard";

export type LectureSegmentInput = {
  label: string;
  text: string;
  timestamp: number;
  difficulty: SegmentDifficulty;
};

const DEFAULT_DIFFICULTIES: SegmentDifficulty[] = ["easy", "medium", "hard"];

const SEGMENT_LABEL_PATTERN = /\[Segment\s+\d+(?:\s+@\s+\d{1,2}:\d{2}(?::\d{2})?)?\]/gi;

function parseClockTimestamp(value: string): number {
  const parts = value.split(":").map((part) => Number(part) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

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
      chunks.push(slice.join(". ") + ".");
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
): LectureSegmentInput[] {
  const cleaned = transcript.trim();
  const labeledBlocks = cleaned.match(
    new RegExp(
      `${SEGMENT_LABEL_PATTERN.source}[\\s\\S]*?(?=(?:${SEGMENT_LABEL_PATTERN.source})|$)`,
      "gi",
    ),
  );

  let texts: string[] = [];
  let explicitTimestamps: number[] = [];
  if (labeledBlocks && labeledBlocks.length > 0) {
    texts = labeledBlocks
      .map((block) =>
        block.replace(/^\[Segment\s+\d+(?:\s+@\s+\d{1,2}:\d{2}(?::\d{2})?)?\]\s*/i, "").trim(),
      )
      .filter(Boolean);
    explicitTimestamps = labeledBlocks.map((block) => {
      const match = block.match(/@\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
      return match ? parseClockTimestamp(match[1]) : 0;
    });
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
    timestamp: explicitTimestamps[index]
      ? Math.max(5, explicitTimestamps[index])
      : Math.max(
          15,
          Math.round(((index + 1) / (count + 1)) * safeDuration),
        ),
    difficulty: DEFAULT_DIFFICULTIES[index % DEFAULT_DIFFICULTIES.length],
  }));
}

export function buildStructuredTranscript(
  title: string,
  segmentTexts: string[],
): string {
  return segmentTexts
    .map((text, index) => `[Segment ${index + 1}]\n${text.trim()}`)
    .join("\n\n");
}

export function buildFallbackTranscript(title: string): string {
  return buildStructuredTranscript(title, [
    `In "${title}", we introduce the core ideas and explain why they matter for real-world applications.`,
    `Next we examine the main mechanics, patterns, and step-by-step examples that define ${title}.`,
    `Finally we review best practices, common mistakes, and checkpoint questions to confirm understanding of ${title}.`,
  ]);
}
