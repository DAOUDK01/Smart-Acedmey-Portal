import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "../../prisma.service";
import { studentKeyFor } from "../auth/identity";
import { TutorService } from "./tutor.service";
import { TutorIngestionService } from "./tutor-ingestion.service";
import { TutorVectorStore } from "./tutor-vector-store.service";
import { TutorChatMessage } from "./tutor.types";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 20;

type AuthenticatedRequest = Request & {
  user?: { userId?: string; role?: string };
};

// Every tutor call can trigger paid LLM usage.
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Controller("tutor")
export class TutorController {
  private readonly logger = new Logger(TutorController.name);

  constructor(
    private readonly tutorService: TutorService,
    private readonly ingestionService: TutorIngestionService,
    private readonly vectorStore: TutorVectorStore,
    private readonly prisma: PrismaService,
  ) {}

  @Post("chat")
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      message: string;
      lectureId?: string;
      history?: TutorChatMessage[];
    },
  ) {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new BadRequestException("Message is required");
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    }

    // Bound what is forwarded to the LLM so one request cannot run up cost.
    const history = Array.isArray(body.history)
      ? body.history.slice(-MAX_HISTORY_MESSAGES).map((entry) => ({
          ...entry,
          content: String(entry?.content ?? "").slice(0, MAX_MESSAGE_LENGTH),
        }))
      : undefined;

    // A student's context is always their own; it is never taken from the request body.
    const studentId =
      req.user?.role === "STUDENT" ? await studentKeyFor(this.prisma, req.user) : undefined;

    return this.tutorService.chat(message, {
      studentId,
      lectureId: body.lectureId,
      history,
    });
  }

  @Post("index/rebuild")
  async rebuildIndex(@Req() req: AuthenticatedRequest) {
    this.requireAdmin(req);
    try {
      return await this.ingestionService.rebuildIndex();
    } catch (error) {
      this.logger.error(`Index rebuild failed: ${error}`);
      return { indexed: false, error: "Index rebuild failed. See server logs for details." };
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
