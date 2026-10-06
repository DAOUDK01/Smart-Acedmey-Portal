import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync } from "fs";
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
import { Roles } from "../auth/roles.decorator";
import { Throttle } from "@nestjs/throttler";
import { ContentService } from "./content.service";

const MAX_LECTURE_UPLOAD_BYTES = 500 * 1024 * 1024;
const LECTURE_MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".mp3", ".wav", ".m4a", ".ogg"]);

// Reads are shared with students and guardians; writes are staff-only.
@Roles("ADMIN", "TEACHER")
@Controller("admin")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Roles("ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @Get("courses")
  listCourses(@Req() req: { user?: { role?: string } }) {
    return this.contentService.listCourses(req.user);
  }

  @Post("courses")
  createCourse(@Body() body: CreateCourseDto) {
    return this.contentService.createCourse(body);
  }

  @Patch("courses/:id")
  updateCourse(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.contentService.updateCourse(id, body);
  }

  @Delete("courses/:id")
  deleteCourse(@Param("id") id: string) {
    return this.contentService.deleteCourse(id);
  }

  @Roles("ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @Get("lectures")
  listLectures(@Req() req: { user?: { role?: string } }) {
    return this.contentService.listLectures(req.user);
  }

  @Post("lectures")
  createLecture(@Body() body: CreateLectureDto) {
    return this.contentService.createLecture(body);
  }

  @Patch("lectures/:id")
  updateLecture(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.contentService.updateLecture(id, body);
  }

  @Delete("lectures/:id")
  deleteLecture(@Param("id") id: string) {
    return this.contentService.deleteLecture(id);
  }

  @Get("lectures/processing")
  listProcessingLectures() {
    return this.contentService.listProcessingLectures();
  }

  @Post("lectures/:id/retry-processing")
  retryLectureProcessing(@Param("id") id: string) {
    return this.contentService.retryLectureProcessing(id);
  }

  @Roles("ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @Get("checkpoints")
  listCheckpoints() {
    return this.contentService.listCheckpoints();
  }

  @Post("checkpoints")
  createCheckpoint(@Body() body: CreateCheckpointDto) {
    return this.contentService.createCheckpoint(body);
  }

  @Patch("checkpoints/:id")
  updateCheckpoint(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.contentService.updateCheckpoint(id, body);
  }

  @Delete("checkpoints/:id")
  deleteCheckpoint(@Param("id") id: string) {
    return this.contentService.deleteCheckpoint(id);
  }
}

@Roles("ADMIN", "TEACHER")
@Controller("guardian/progress")
export class GuardianProgressController {
  constructor(private readonly contentService: ContentService) {}

  @Roles("ADMIN", "TEACHER", "STUDENT", "GUARDIAN")
  @Get()
  listProgress(@Req() req: { user?: { userId?: string; role?: string } }) {
    return this.contentService.listProgress(req.user);
  }

  @Post()
  createProgress(@Body() body: CreateProgressDto) {
    return this.contentService.createProgress(body);
  }

  @Patch(":id")
  updateProgress(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.contentService.updateProgress(id, body);
  }

  @Delete(":id")
  deleteProgress(@Param("id") id: string) {
    return this.contentService.deleteProgress(id);
  }
}

@Roles("TEACHER", "ADMIN")
@Controller("teacher")
export class TeacherContentController {
  constructor(private readonly contentService: ContentService) {}

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get("video-duration")
  async videoDuration(@Query("url") url?: string) {
    if (!url?.trim()) throw new BadRequestException("url is required");
    return { durationSeconds: await this.contentService.detectVideoDurationSeconds(url) };
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("transcribe")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadsPath = join(process.cwd(), "uploads");
          if (!existsSync(uploadsPath)) {
            mkdirSync(uploadsPath, { recursive: true });
          }
          cb(null, uploadsPath);
        },
        filename: (_req: any, file: any, cb: any) => {
          // Never trust the client's filename: the extension is allow-listed by fileFilter
          // and the base name is random, so uploads cannot overwrite or masquerade as other files.
          const extension = extname(file.originalname || "").toLowerCase();
          cb(null, `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`);
        },
      }),
      limits: { fileSize: MAX_LECTURE_UPLOAD_BYTES, files: 1 },
      fileFilter: (_req: any, file: any, cb: any) => {
        const extension = extname(file.originalname || "").toLowerCase();
        const mimeOk = /^(video|audio)\//.test(file.mimetype || "");
        if (!LECTURE_MEDIA_EXTENSIONS.has(extension) || !mimeOk) {
          cb(new BadRequestException("Only video or audio files (mp4, mov, webm, mkv, mp3, wav, m4a) are allowed"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async transcribe(
    @Body() body: { title?: string; videoUrl?: string },
    @UploadedFile() file?: any,
  ) {
    const fallbackTitle =
      file?.originalname?.replace(/\.[^/.]+$/, "") || "Uploaded lecture";
    const title = body.title?.trim() || fallbackTitle;

    const uploadedUrl = file ? `/uploads/${file.filename}` : undefined;
    const videoUrl = uploadedUrl || body.videoUrl?.trim() || title;

    const { transcript, durationSeconds } = await this.contentService.transcribeWithDuration(
      title,
      videoUrl,
      file?.path,
    );

    return { transcript, videoUrl, durationSeconds };
  }
}
