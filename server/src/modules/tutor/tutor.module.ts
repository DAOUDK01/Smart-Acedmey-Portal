import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { TutorController } from "./tutor.controller";
import { TutorService } from "./tutor.service";
import { TutorIngestionService } from "./tutor-ingestion.service";
import { TutorVectorStore } from "./tutor-vector-store.service";

@Module({
  controllers: [TutorController],
  providers: [
    TutorService,
    TutorIngestionService,
    TutorVectorStore,
    PrismaService,
  ],
})
export class TutorModule {}
