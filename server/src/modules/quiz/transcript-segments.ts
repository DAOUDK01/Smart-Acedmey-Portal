export type SegmentDifficulty = "easy" | "medium" | "hard";

export type LectureSegmentInput = {
  label: string;
  text: string;
  timestamp: number;
  difficulty: SegmentDifficulty;
};

const DEFAULT_DIFFICULTIES: SegmentDifficulty[] = ["easy", "medium", "hard"];

const SEGMENT_HEADER_PATTERN = /\[Segment\s+\d+(?:\s+@\s+(\d{1,2}:\d{2}(?::\d{2})?))?\]/gi;

// Leave a few seconds before the end so the final checkpoint still fires before playback stops.
const END_CHECKPOINT_OFFSET_SECONDS = 3;

type TranscriptBlock = { text: string; start?: number };

function parseClockTimestamp(value: string): number {
  const parts = value.split(":").map((part) => Number(part) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function parseBlocks(transcript: string): TranscriptBlock[] {
  const headers: RegExpExecArray[] = [];
  const pattern = new RegExp(SEGMENT_HEADER_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(transcript)) !== null) headers.push(match);

  if (headers.length > 0) {
    return headers
      .map((header, index) => ({
        text: transcript
          .slice(header.index + header[0].length, headers[index + 1]?.index ?? transcript.length)
          .trim(),
        start: header[1] ? parseClockTimestamp(header[1]) : undefined,
      }))
      .filter((block) => block.text.length > 0);
  }

  return transcript
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((text) => ({ text }));
}

function splitSentences(text: string): TranscriptBlock[] {
  return (text.match(/[^.!?\n]+[.!?]*/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map((sentence) => ({ text: sentence }));
}

/** Splits blocks into `count` contiguous groups of roughly equal text length; every group gets at least one block. */
function groupBlocks(blocks: TranscriptBlock[], count: number): TranscriptBlock[][] {
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
  const groups: TranscriptBlock[][] = [];
  let current: TranscriptBlock[] = [];
  let consumed = 0;

  blocks.forEach((block, index) => {
    current.push(block);
    consumed += block.text.length;
    const groupsStillNeeded = count - groups.length - 1;
    const blocksLeft = blocks.length - index - 1;
    const target = (total * (groups.length + 1)) / count;
    if (groupsStillNeeded > 0 && (consumed >= target || blocksLeft === groupsStillNeeded)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current);

  return groups;
}

/**
 * Splits the whole transcript into contiguous segments. Each segment's timestamp is where it ENDS,
 * so its checkpoint quiz fires only after the student has watched that part of the lecture.
 */
export function splitTranscriptIntoSegments(
  transcript: string,
  durationSeconds = 600,
  segmentCount = 3,
): LectureSegmentInput[] {
  const cleaned = transcript.trim();
  const wanted = Math.max(1, Math.trunc(segmentCount) || 1);

  let blocks = parseBlocks(cleaned);
  if (blocks.length < wanted) {
    const sentences = splitSentences(blocks.map((block) => block.text).join(" ") || cleaned);
    if (sentences.length > blocks.length) blocks = sentences;
  }
  if (blocks.length === 0) blocks = [{ text: cleaned || "Lecture content" }];

  // Transcripts saved before the YouTube caption-unit fix stored milliseconds as seconds (2:00 became
  // "33:20:00"). Real start times are never ~1000x the video length, so scale those back down.
  const rawLastStart = Math.max(0, ...blocks.map((block) => block.start ?? 0));
  if (durationSeconds > 0 && rawLastStart > durationSeconds * 20) {
    blocks = blocks.map((block) =>
      block.start === undefined ? block : { ...block, start: block.start / 1000 },
    );
  }

  const count = Math.min(wanted, blocks.length);
  const groups = groupBlocks(blocks, count);

  const lastKnownStart = Math.max(0, ...blocks.map((block) => block.start ?? 0));
  const duration = Math.max(60, durationSeconds || 0, lastKnownStart + 15);
  const totalChars = Math.max(1, blocks.reduce((sum, block) => sum + block.text.length, 0));

  let charsBefore = 0;
  const groupStarts = groups.map((group) => {
    const estimated = (duration * charsBefore) / totalChars;
    charsBefore += group.reduce((sum, block) => sum + block.text.length, 0);
    return group[0].start ?? estimated;
  });

  return groups.map((group, index) => {
    const end =
      index < groups.length - 1
        ? groupStarts[index + 1]
        : duration - END_CHECKPOINT_OFFSET_SECONDS;
    return {
      label: `Segment ${index + 1}`,
      text: group.map((block) => block.text).join(" "),
      timestamp: Math.max(5, Math.round(end)),
      difficulty: DEFAULT_DIFFICULTIES[index % DEFAULT_DIFFICULTIES.length],
    };
  });
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
