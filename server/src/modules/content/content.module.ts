import { Module } from "@nestjs/common";
import { ContentController, GuardianProgressController, TeacherContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { HlsProcessingService } from "./hls-processing.service";
import { TranscriptionService } from "./transcription.service";
import { PrismaService } from "../../prisma.service";

@Module({
  controllers: [ContentController, GuardianProgressController, TeacherContentController],
  providers: [ContentService, HlsProcessingService, TranscriptionService, PrismaService],
})
export class ContentModule {}
