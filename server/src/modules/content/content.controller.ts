import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
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
import { ContentService } from "./content.service";

@Controller("admin")
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get("courses")
  listCourses() {
    return this.contentService.listCourses();
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

  @Get("lectures")
  listLectures() {
    return this.contentService.listLectures();
  }

  @Post("lectures")
  createLecture(@Body() body: CreateLectureDto) {
    return this.contentService.createLecture(body);
  }

  @Patch("lectures/:id")
  updateLecture(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.contentService.updateLecture(id, body);
  }

  @Delete("lectures/:id")
  deleteLecture(@Param("id") id: string) {
    return this.contentService.deleteLecture(id);
  }

  @Get("checkpoints")
  listCheckpoints() {
    return this.contentService.listCheckpoints();
  }

  @Post("checkpoints")
  createCheckpoint(@Body() body: CreateCheckpointDto) {
    return this.contentService.createCheckpoint(body);
  }

  @Patch("checkpoints/:id")
  updateCheckpoint(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.contentService.updateCheckpoint(id, body);
  }

  @Delete("checkpoints/:id")
  deleteCheckpoint(@Param("id") id: string) {
    return this.contentService.deleteCheckpoint(id);
  }
}

@Controller("guardian/progress")
export class GuardianProgressController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  listProgress() {
    return this.contentService.listProgress();
  }

  @Post()
  createProgress(@Body() body: CreateProgressDto) {
    return this.contentService.createProgress(body);
  }

  @Patch(":id")
  updateProgress(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.contentService.updateProgress(id, body);
  }

  @Delete(":id")
  deleteProgress(@Param("id") id: string) {
    return this.contentService.deleteProgress(id);
  }
}

@Controller("teacher")
export class TeacherContentController {
  constructor(private readonly contentService: ContentService) {}

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
          const originalName = file.originalname || "video.mp4";
          const extension = originalName.split(".").pop();
          const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
          const sanitizedBase = nameWithoutExt.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
          cb(null, `${Date.now()}-${sanitizedBase}.${extension}`);
        },
      }),
    }),
  )
  async transcribe(
    @Body() body: { title?: string; videoUrl?: string },
    @UploadedFile() file?: any,
  ) {
    const fallbackTitle = file?.originalname?.replace(/\.[^/.]+$/, "") || "Uploaded lecture";
    const title = body.title?.trim() || fallbackTitle;

    const uploadedUrl = file ? `/uploads/${file.filename}` : undefined;
    const videoUrl = body.videoUrl?.trim() || uploadedUrl || title;

    const transcript = await this.contentService.generateTranscriptForVideo(title, videoUrl);

    return { transcript, videoUrl };
  }
}
