import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { TutorService } from "./tutor.service";
import { TutorIngestionService } from "./tutor-ingestion.service";
import { TutorVectorStore } from "./tutor-vector-store.service";
import { TutorChatMessage } from "./tutor.types";

type AuthenticatedRequest = Request & {
  user?: { userId?: string; role?: string };
};

@Controller("tutor")
export class TutorController {
  private readonly logger = new Logger(TutorController.name);

  constructor(
    private readonly tutorService: TutorService,
    private readonly ingestionService: TutorIngestionService,
    private readonly vectorStore: TutorVectorStore,
  ) {}

  @Post("chat")
  chat(
    @Body()
    body: {
      message: string;
      studentId?: string;
      lectureId?: string;
      history?: TutorChatMessage[];
    },
  ) {
    return this.tutorService.chat(body.message, {
      studentId: body.studentId,
      lectureId: body.lectureId,
      history: body.history,
    });
  }

  @Post("index/rebuild")
  async rebuildIndex(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    try {
      return await this.ingestionService.rebuildIndex();
    } catch (error) {
      this.logger.error(`Index rebuild failed: ${error}`);
      return { indexed: false, error: String(error) };
    }
  }

  @Get("index/status")
  async indexStatus(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    const enabled = this.vectorStore.enabled;
    if (!enabled) {
      return { enabled, indexed: false, totalDocuments: 0 };
    }
    try {
      const totalDocuments = await this.vectorStore.count();
      return { enabled, indexed: true, totalDocuments };
    } catch {
      return { enabled, indexed: false, totalDocuments: 0 };
    }
  }

  private requireAdmin(req: AuthenticatedRequest) {
    if (req.user?.role !== "ADMIN") {
      throw new ForbiddenException("Admin access required");
    }
  }
}
