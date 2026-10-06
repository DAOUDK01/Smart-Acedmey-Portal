import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { join, resolve, sep } from "path";
import { existsSync, rmSync } from "fs";
import { PrismaService } from "../../prisma.service";
import { HlsProcessingService } from "./hls-processing.service";
import { TranscriptionService } from "./transcription.service";
import {
  buildFallbackTranscript,
  buildStructuredTranscript,
  splitTranscriptIntoSegments,
} from "../quiz/transcript-segments";
import { isConfiguredApiKey, resolveOllamaUrl } from "../quiz/quiz.provider";
import {
  CreateCheckpointDto,
  CreateCourseDto,
  CreateLectureDto,
  CreateProgressDto,
  UpdateCheckpointDto,
  UpdateCourseDto,
  UpdateLectureDto,
  UpdateProgressDto,
} from "./content.dto";

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hlsProcessing: HlsProcessingService,
    private readonly transcription: TranscriptionService,
  ) {}

  /** Students and guardians only ever receive published content; drafts are staff-only. */
  private isLearner(user?: { role?: string }) {
    return user?.role === "STUDENT" || user?.role === "GUARDIAN";
  }

  async listCourses(user?: { role?: string }) {
    const courses = await this.prisma.$queryRaw<Array<{ isPublished: boolean }>>`
      SELECT "id", "code", "title", "description", "level", "isPublished", "sortOrder", "createdAt", "updatedAt"
      FROM "Course" ORDER BY "createdAt" DESC
    `;
    return this.isLearner(user) ? courses.filter((course) => course.isPublished) : courses;
  }

  async createCourse(body: CreateCourseDto) {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<any[]>`
      INSERT INTO "Course" ("id", "code", "title", "description", "level", "isPublished", "sortOrder", "createdAt", "updatedAt")
      VALUES (${id}, ${body.code || null}, ${body.title}, ${body.description || null}, ${body.level || null}, ${body.isPublished ?? false}, ${body.sortOrder ?? 0}, NOW(), NOW()) RETURNING *
    `;
    return rows[0];
  }

  async updateCourse(id: string, body: Record<string, unknown>) {
    const payload = body as Record<string, any>;
    const current = (await this.prisma.$queryRaw<any[]>`SELECT * FROM "Course" WHERE "id"=${id} LIMIT 1`)[0];
    const code = Object.prototype.hasOwnProperty.call(payload, "code") ? payload.code || null : current.code;
    const description = Object.prototype.hasOwnProperty.call(payload, "description") ? payload.description || null : current.description;
    const level = Object.prototype.hasOwnProperty.call(payload, "level") ? payload.level || null : current.level;
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE "Course" SET "code"=${code}, "title"=${payload.title ?? current.title},
        "description"=${description}, "level"=${level},
        "isPublished"=${payload.isPublished ?? current.isPublished}, "sortOrder"=${payload.sortOrder ?? current.sortOrder}, "updatedAt"=NOW()
      WHERE "id"=${id} RETURNING *
    `;
    return rows[0];
  }

  async deleteCourse(id: string) {
    await this.prisma.$executeRaw`DELETE FROM "Course" WHERE "id"=${id}`;
    return { success: true };
  }

  async listLectures(user?: { role?: string }) {
    const lectures = await this.prisma.lecture.findMany({
      orderBy: { createdAt: "desc" },
    });
    const checkpoints = await this.prisma.checkpoint.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const byLecture = new Map<string, Array<{ id: string; lectureId: string; title: string; timestamp: number; requiredQuizId: string | null; sortOrder: number; unlockScore: number; isBlocking: boolean; isPublished: boolean }>>();
    for (const checkpoint of checkpoints) {
      const list = byLecture.get(checkpoint.lectureId) ?? [];
      list.push(checkpoint);
      byLecture.set(checkpoint.lectureId, list);
    }
    return lectures
      .filter((lecture) => !this.isLearner(user) || lecture.publishedAt)
      .map((lecture) => ({
        ...lecture,
        checkpoints: byLecture.get(lecture.id) ?? [],
      }));
  }

  /** Transcript plus the real video length: probed from an uploaded file, or taken from YouTube captions. */
  async transcribeWithDuration(
    title: string,
    videoUrl: string,
    filePath?: string,
  ): Promise<{ transcript: string; durationSeconds: number | null }> {
    if (!filePath && this.isYouTubeUrl(videoUrl)) {
      const captions = await this.transcription.transcribeYouTube(videoUrl);
      if (captions?.transcript.trim()) {
        return { transcript: captions.transcript.trim(), durationSeconds: captions.durationSeconds ?? null };
      }
    }

    const [transcript, durationSeconds] = await Promise.all([
      this.generateTranscriptForVideo(title, videoUrl, filePath),
      filePath ? this.transcription.mediaDurationSeconds(filePath) : null,
    ]);
    return { transcript, durationSeconds };
  }

  /** Real length of a lecture video: YouTube links via their watch page, uploads via ffprobe. */
  async detectVideoDurationSeconds(videoUrl: string): Promise<number | null> {
    const url = videoUrl.trim();
    if (this.isYouTubeUrl(url)) {
      return this.transcription.youTubeDurationSeconds(url);
    }
    if (url.startsWith("/uploads/")) {
      // The path comes from the client, so it must stay inside the uploads folder.
      const uploadsDir = resolve(process.cwd(), "uploads");
      const sourcePath = resolve(uploadsDir, url.replace(/^\/uploads\//, ""));
      if (!sourcePath.startsWith(uploadsDir + sep) || !existsSync(sourcePath)) return null;
      return this.transcription.mediaDurationSeconds(sourcePath);
    }
    return null;
  }

  private isYouTubeUrl(videoUrl: string) {
    return videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
  }

  async generateTranscriptForVideo(
    title: string,
    videoUrl: string,
    filePath?: string,
  ): Promise<string> {
    if (filePath && existsSync(filePath)) {
      const realTranscript = await this.transcription.transcribeVideoFile(filePath);
      if (realTranscript?.trim()) return realTranscript.trim();
    }

    if (this.isYouTubeUrl(videoUrl)) {
      const captions = await this.transcription.transcribeYouTube(videoUrl);
      if (captions?.transcript.trim()) return captions.transcript.trim();
    }

    const prompt = `You are an AI video transcriber. Generate a realistic lecture transcript for "${title}".
Return exactly 3 segments separated by blank lines. Label each segment implicitly by paragraph order:
1) introduction and motivation
2) core concepts and examples
3) summary, best practices, and review
Return ONLY the transcript text without headings or markdown.`;

    if (isConfiguredApiKey(process.env.QUIZ_API_KEY)) {
      const url = process.env.QUIZ_API_URL;
      try {
        const response = await fetch(url!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.QUIZ_API_KEY}`,
            "x-api-key": process.env.QUIZ_API_KEY!,
          },
          body: JSON.stringify({ prompt, topic: title, format: "text" }),
        });
        if (response.ok) {
          const raw = (await response.json()) as {
            response?: string;
            text?: string;
            transcript?: string;
          };
          const text = raw?.response ?? raw?.text ?? raw?.transcript;
          if (text) return String(text).trim();
        }
      } catch {
        // fallback below
      }
    }

    const ollamaUrl = resolveOllamaUrl();
    if (ollamaUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(ollamaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL ?? "llama3.1",
            prompt,
            stream: false,
          }),
        });
        if (response.ok) {
          const raw = (await response.json()) as { response?: string };
          if (raw?.response) return String(raw.response).trim();
        }
      } catch {
        // fallback below
      } finally {
        clearTimeout(timeout);
      }
    }

    return buildFallbackTranscript(title);
  }

  async createLecture(body: CreateLectureDto) {
    const isYouTubeSource =
      body.videoUrl.includes("youtube.com") || body.videoUrl.includes("youtu.be");
    const isUploadedSource = body.videoUrl.startsWith("/uploads/");

    let transcript = body.transcript;
    if (!transcript || !transcript.trim()) {
      if (isUploadedSource) {
        const sourcePath = this.resolveUploadedSourcePath(body.videoUrl);
        if (existsSync(sourcePath)) {
          const realTranscript = await this.transcription.transcribeVideoFile(sourcePath);
          if (realTranscript?.trim()) transcript = realTranscript.trim();
        }
      }
      if (!transcript || !transcript.trim()) {
        transcript = await this.generateTranscriptForVideo(body.title, body.videoUrl);
      }
    }

    const durationMinutes = body.durationMinutes ?? 10;
    const durationSeconds = durationMinutes * 60;
    const isCheckpointLocked = body.isCheckpointLocked ?? true;
    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();

    const structuredTranscript =
      transcript && transcript.includes("[Segment")
        ? transcript
        : buildStructuredTranscript(
            body.title,
            splitTranscriptIntoSegments(transcript || body.title, durationSeconds, 3).map(
              (segment) => segment.text,
            ),
          );

    const lecture = await this.prisma.lecture.create({
      data: {
        courseId: body.courseId,
        videoUrl: body.videoUrl,
        transcript: structuredTranscript,
        title: body.title,
        lectureOrder: body.lectureOrder ?? 0,
        durationMinutes,
        videoProvider:
          body.videoProvider ??
          (isYouTubeSource ? "YouTube" : "Upload"),
        sourceType: isYouTubeSource ? "YOUTUBE" : "UPLOAD",
        processingStatus: isUploadedSource ? "PROCESSING" : null,
        processingProgress: isUploadedSource ? 5 : null,
        isCheckpointLocked,
        publishedAt,
      },
    });

    if (isUploadedSource) {
      const sourcePath = this.resolveUploadedSourcePath(lecture.videoUrl);
      this.hlsProcessing.startProcessing(lecture.id, sourcePath, lecture.videoUrl);
    }

    const segments =
      body.segments && body.segments.length > 0
        ? body.segments.map((segment, index) => ({
            ...segment,
            label: segment.label || `Segment ${index + 1}`,
            timestamp: Math.max(5, Number(segment.timestamp) || 0),
          }))
        : splitTranscriptIntoSegments(structuredTranscript, durationSeconds, 3);

    await this.prisma.checkpoint.createMany({
      data: segments.map((segment, index) => ({
        lectureId: lecture.id,
        title: `${segment.label} Checkpoint`,
        timestamp: segment.timestamp,
        sortOrder: index + 1,
        unlockScore: 70,
        isBlocking: true,
        isPublished: true,
      })),
    });

    return lecture;
  }

  async updateLecture(id: string, body: Record<string, unknown>) {
    const payload = body as Record<string, any>;
    const lecture = await this.prisma.lecture.findUnique({ where: { id } });

    if (!lecture) {
      return this.createLecture(body as any);
    }

    const nextVideoUrl = typeof payload.videoUrl === "string" ? payload.videoUrl : lecture.videoUrl;
    const isYouTubeSource = /(?:youtube\.com|youtu\.be)/i.test(nextVideoUrl);
    const isUploadedSource = nextVideoUrl.startsWith("/uploads/");
    const sourceChanged = lecture.videoUrl !== nextVideoUrl;
    const replacingUpload = lecture.videoUrl.startsWith("/uploads/") && !isUploadedSource;

    const updated = await this.prisma.lecture.update({
      where: { id },
      data: {
        courseId: payload.courseId ?? lecture.courseId,
        videoUrl: nextVideoUrl,
        transcript: payload.transcript ?? lecture.transcript,
        title: payload.title ?? lecture.title,
        lectureOrder: payload.lectureOrder ?? lecture.lectureOrder,
        durationMinutes: payload.durationMinutes ?? lecture.durationMinutes,
        videoProvider: isYouTubeSource ? "YouTube" : isUploadedSource ? "Upload" : payload.videoProvider ?? lecture.videoProvider,
        sourceType: isYouTubeSource ? "YOUTUBE" : isUploadedSource ? "UPLOAD" : lecture.sourceType,
        hlsMasterUrl: isUploadedSource && !sourceChanged ? lecture.hlsMasterUrl : null,
        thumbnailUrl: isYouTubeSource ? null : lecture.thumbnailUrl,
        processingStatus: isUploadedSource && !sourceChanged ? lecture.processingStatus : null,
        processingProgress: isUploadedSource && !sourceChanged ? lecture.processingProgress : null,
        processingError: isUploadedSource && !sourceChanged ? lecture.processingError : null,
        isCheckpointLocked: payload.isCheckpointLocked ?? lecture.isCheckpointLocked,
        publishedAt: payload.publishedAt === null ? null : payload.publishedAt ? new Date(payload.publishedAt) : undefined,
      },
    });

    if (sourceChanged && lecture.videoUrl.startsWith("/uploads/")) {
      const hlsDir = join(process.cwd(), "uploads", "hls", id);
      if (existsSync(hlsDir)) rmSync(hlsDir, { recursive: true, force: true });
    }

    if (payload.segments?.length) {
      const segments = payload.segments.map((segment: any, index: number) => ({
        label: segment.label || `Segment ${index + 1}`,
        timestamp: Math.max(5, Number(segment.timestamp) || 0),
      }));
      const existing = await this.prisma.checkpoint.findMany({
        where: { lectureId: id },
        orderBy: { sortOrder: "asc" },
      });

      for (const [index, segment] of segments.entries()) {
        const data = {
          title: `${segment.label} Checkpoint`,
          timestamp: segment.timestamp,
          sortOrder: index + 1,
          unlockScore: 70,
          isBlocking: true,
          isPublished: true,
        };
        if (existing[index]) {
          await this.prisma.checkpoint.update({
            where: { id: existing[index].id },
            data,
          });
        } else {
          await this.prisma.checkpoint.create({
            data: { lectureId: id, ...data },
          });
        }
        // The student player pauses at each question's own timestamp, so keep it in step with the planner.
        await this.prisma.quizQuestion.updateMany({
          where: { lectureId: id, topic: { startsWith: `${segment.label}|` } },
          data: { timestamp: segment.timestamp },
        });
      }

      const stale = existing.slice(segments.length).map((checkpoint) => checkpoint.id);
      if (stale.length > 0) {
        await this.prisma.checkpoint.deleteMany({ where: { id: { in: stale } } });
      }
    }

    if (
      isUploadedSource &&
      updated.processingStatus !== "READY" &&
      updated.processingStatus !== "PROCESSING"
    ) {
      const sourcePath = this.resolveUploadedSourcePath(updated.videoUrl);
      if (existsSync(sourcePath)) {
        await this.prisma.lecture.update({
          where: { id },
          data: { sourceType: "UPLOAD", processingStatus: "PROCESSING", processingProgress: 5, processingError: null },
        });
        this.hlsProcessing.startProcessing(id, sourcePath, updated.videoUrl);
      }
    }

    return updated;
  }

  async deleteLecture(id: string) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id } });

    if (lecture && lecture.videoUrl.startsWith("/uploads/")) {
      const hlsDir = join(process.cwd(), "uploads", "hls", id);
      try {
        if (existsSync(hlsDir)) {
          rmSync(hlsDir, { recursive: true, force: true });
        }
      } catch {
        // best-effort cleanup
      }
    }

    return this.prisma.lecture.delete({ where: { id } });
  }

  resolveUploadedSourcePath(videoUrl: string) {
    const relative = videoUrl.replace(/^\/uploads\//, "");
    return join(process.cwd(), "uploads", relative);
  }

  listProcessingLectures() {
    return this.prisma.lecture.findMany({
      where: {
        sourceType: "UPLOAD",
        processingStatus: { notIn: ["READY"] },
      },
      select: {
        id: true,
        processingStatus: true,
        processingProgress: true,
        processingError: true,
        hlsMasterUrl: true,
        thumbnailUrl: true,
      },
    });
  }

  async retryLectureProcessing(id: string) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id } });

    if (!lecture) {
      throw new NotFoundException("Lecture not found");
    }

    if (lecture.processingStatus === "PROCESSING") {
      return { ok: false, message: "Video is already being processed." };
    }

    if (lecture.sourceType !== "UPLOAD" && !lecture.videoUrl.startsWith("/uploads/")) {
      return { ok: false, message: "Only uploaded videos can be processed." };
    }

    const sourcePath = this.resolveUploadedSourcePath(lecture.videoUrl);
    if (!existsSync(sourcePath)) {
      throw new NotFoundException("Original video file is missing.");
    }

    this.hlsProcessing.startProcessing(id, sourcePath, lecture.videoUrl);
    return { ok: true };
  }

  listCheckpoints() {
    return this.prisma.checkpoint.findMany({ orderBy: { timestamp: "asc" } });
  }

  createCheckpoint(body: CreateCheckpointDto) {
    return this.prisma.checkpoint.create({
      data: {
        lectureId: body.lectureId,
        title: body.title ?? "Checkpoint",
        timestamp: body.timestamp,
        requiredQuizId: body.requiredQuizId,
        sortOrder: body.sortOrder ?? 0,
        unlockScore: body.unlockScore ?? 70,
        isBlocking: body.isBlocking ?? true,
        isPublished: body.isPublished ?? false,
      },
    });
  }

  updateCheckpoint(id: string, body: Record<string, unknown>) {
    const payload = body as Record<string, any>;
    return this.prisma.checkpoint.update({
      where: { id },
      data: {
        lectureId: payload.lectureId,
        title: payload.title,
        timestamp: payload.timestamp,
        requiredQuizId: payload.requiredQuizId,
        sortOrder: payload.sortOrder,
        unlockScore: payload.unlockScore,
        isBlocking: payload.isBlocking,
        isPublished: payload.isPublished,
      },
    });
  }

  deleteCheckpoint(id: string) {
    return this.prisma.checkpoint.delete({ where: { id } });
  }

  /**
   * Staff see every student's progress. Students only see their own, and guardians
   * only the students linked to them; rows are keyed by email or user id.
   */
  async listProgress(user?: { userId?: string; role?: string }) {
    let where: { studentId: { in: string[] } } | undefined;

    if (user?.role === "STUDENT" || user?.role === "GUARDIAN") {
      const self = user.userId
        ? await this.prisma.user.findUnique({ where: { id: user.userId }, select: { id: true, email: true } })
        : null;
      if (!self) return [];

      if (user.role === "STUDENT") {
        where = { studentId: { in: [self.email, self.id] } };
      } else {
        const links = await this.prisma.guardianStudentLink.findMany({
          where: { OR: [{ guardianId: self.id }, { guardianEmail: self.email.toLowerCase() }] },
        });
        where = {
          studentId: { in: links.flatMap((link) => [link.studentEmail, link.studentId]) },
        };
      }
    }

    return this.prisma.studentProgress.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
  }

  createProgress(body: CreateProgressDto) {
    return this.prisma.studentProgress.create({
      data: {
        studentId: body.studentId,
        guardianName: body.guardianName,
        currentCourseId: body.currentCourseId,
        currentLectureId: body.currentLectureId,
        avgScore: body.avgScore ?? 0,
        weakTopics: body.weakTopics as Prisma.InputJsonValue | undefined,
        streakDays: body.streakDays ?? 0,
        lastActivityAt: body.lastActivityAt ? new Date(body.lastActivityAt) : undefined,
        completedCheckpoints: body.completedCheckpoints ?? 0,
        lockedCheckpoints: body.lockedCheckpoints ?? 0,
        progressPercentage: body.progressPercentage ?? 0,
        completedLectures: body.completedLectures ?? 0,
        failedQuizzes: body.failedQuizzes ?? 0,
      },
    });
  }

  updateProgress(id: string, body: Record<string, unknown>) {
    const payload = body as Record<string, any>;
    return this.prisma.studentProgress.update({
      where: { id },
      data: {
        studentId: payload.studentId,
        guardianName: payload.guardianName,
        currentCourseId: payload.currentCourseId,
        currentLectureId: payload.currentLectureId,
        avgScore: payload.avgScore,
        weakTopics: payload.weakTopics as Prisma.InputJsonValue | undefined,
        streakDays: payload.streakDays,
        lastActivityAt: payload.lastActivityAt ? new Date(payload.lastActivityAt) : undefined,
        completedCheckpoints: payload.completedCheckpoints,
        lockedCheckpoints: payload.lockedCheckpoints,
        progressPercentage: payload.progressPercentage,
        completedLectures: payload.completedLectures,
        failedQuizzes: payload.failedQuizzes,
      },
    });
  }

  deleteProgress(id: string) {
    return this.prisma.studentProgress.delete({ where: { id } });
  }
}
