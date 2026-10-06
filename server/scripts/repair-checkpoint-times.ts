/**
 * Recomputes checkpoint and quiz times for existing lectures.
 *
 * Lectures saved before the YouTube caption-unit fix stored caption times in milliseconds as if they
 * were seconds (a caption at 2:41 became 161360s, shown as "2689:20"), and placed checkpoints at the
 * start of each segment. This rebuilds each lecture's segments from its transcript and real video
 * length, then updates its checkpoints, its quiz questions' timestamps and its durationMinutes.
 *
 * Usage (from server/):
 *   npx ts-node --transpile-only scripts/repair-checkpoint-times.ts           # dry run, prints changes
 *   npx ts-node --transpile-only scripts/repair-checkpoint-times.ts --apply   # writes them
 */
import "dotenv/config";
import { existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { TranscriptionService } from "../src/modules/content/transcription.service";
import { splitTranscriptIntoSegments } from "../src/modules/quiz/transcript-segments";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const transcription = new TranscriptionService();

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

async function realDurationSeconds(videoUrl: string): Promise<number | null> {
  if (/youtube\.com|youtu\.be/i.test(videoUrl)) {
    const captions = await transcription.transcribeYouTube(videoUrl);
    return captions?.durationSeconds ?? null;
  }
  if (videoUrl.startsWith("/uploads/")) {
    const sourcePath = join(process.cwd(), "uploads", videoUrl.replace(/^\/uploads\//, ""));
    return existsSync(sourcePath) ? transcription.mediaDurationSeconds(sourcePath) : null;
  }
  return null;
}

async function main() {
  const lectures = await prisma.lecture.findMany({ orderBy: { createdAt: "asc" } });
  let changedLectures = 0;

  for (const lecture of lectures) {
    if (!lecture.transcript?.trim()) continue;

    const [checkpoints, quizzes] = await Promise.all([
      prisma.checkpoint.findMany({ where: { lectureId: lecture.id }, orderBy: { sortOrder: "asc" } }),
      prisma.quizQuestion.findMany({ where: { lectureId: lecture.id } }),
    ]);

    const detected = await realDurationSeconds(lecture.videoUrl);
    const durationSeconds = detected ?? (lecture.durationMinutes ?? 10) * 60;
    const segments = splitTranscriptIntoSegments(
      lecture.transcript,
      durationSeconds,
      checkpoints.length || 3,
    );

    // Old questions may lack the "Segment N|" topic prefix; their timestamp then matches the old
    // checkpoint of the same segment, which identifies it.
    const segmentIndexFor = (quiz: (typeof quizzes)[number]) => {
      const label = quiz.topic?.includes("|") ? quiz.topic.split("|")[0] : undefined;
      const byLabel = segments.findIndex((segment) => segment.label === label);
      if (byLabel >= 0) return byLabel;
      const byTime = checkpoints.findIndex((checkpoint) => checkpoint.timestamp === quiz.timestamp);
      return byTime >= 0 && byTime < segments.length ? byTime : -1;
    };

    const checkpointChanges = segments
      .map((segment, index) => ({ segment, index, old: checkpoints[index] }))
      .filter(({ segment, old }) => !old || old.timestamp !== segment.timestamp);
    const quizChanges = quizzes
      .map((quiz) => ({ quiz, index: segmentIndexFor(quiz) }))
      .filter(({ index }) => index >= 0)
      .map(({ quiz, index }) => {
        const segment = segments[index];
        const topicText = quiz.topic?.includes("|") ? quiz.topic.split("|").slice(1).join("|") : quiz.topic;
        return { quiz, timestamp: segment.timestamp, topic: `${segment.label}|${topicText || lecture.title}` };
      })
      .filter(({ quiz, timestamp, topic }) => quiz.timestamp !== timestamp || quiz.topic !== topic);
    const unmatched = quizzes.filter((quiz) => segmentIndexFor(quiz) < 0);
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const durationChanged = detected !== null && lecture.durationMinutes !== durationMinutes;

    if (!checkpointChanges.length && !quizChanges.length && !durationChanged && !unmatched.length) continue;
    changedLectures += 1;

    console.log(`\n${lecture.title} (${lecture.id})`);
    console.log(
      `  video length: ${clock(durationSeconds)} ${detected !== null ? "(detected)" : "(from saved duration)"}` +
        (durationChanged ? `, durationMinutes ${lecture.durationMinutes} -> ${durationMinutes}` : ""),
    );
    for (const { segment, old } of checkpointChanges) {
      console.log(`  ${segment.label} checkpoint: ${old ? clock(old.timestamp) : "(none)"} -> ${clock(segment.timestamp)}`);
    }
    if (quizChanges.length) console.log(`  ${quizChanges.length} quiz question(s) retimed`);
    if (unmatched.length) console.log(`  ${unmatched.length} quiz question(s) could not be matched to a segment (left unchanged)`);

    if (!apply) continue;

    for (const [index, segment] of segments.entries()) {
      const data = { title: `${segment.label} Checkpoint`, timestamp: segment.timestamp, sortOrder: index + 1 };
      if (checkpoints[index]) {
        await prisma.checkpoint.update({ where: { id: checkpoints[index].id }, data });
      } else {
        await prisma.checkpoint.create({
          data: { lectureId: lecture.id, unlockScore: 70, isBlocking: true, isPublished: true, ...data },
        });
      }
    }
    const stale = checkpoints.slice(segments.length).map((checkpoint) => checkpoint.id);
    if (stale.length) await prisma.checkpoint.deleteMany({ where: { id: { in: stale } } });
    for (const { quiz, timestamp, topic } of quizChanges) {
      await prisma.quizQuestion.update({ where: { id: quiz.id }, data: { timestamp, topic } });
    }
    if (durationChanged) {
      await prisma.lecture.update({ where: { id: lecture.id }, data: { durationMinutes } });
    }
  }

  console.log(
    `\n${changedLectures} lecture(s) ${apply ? "repaired" : "need repair"}.` +
      (apply || !changedLectures ? "" : " Re-run with --apply to write these changes."),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
