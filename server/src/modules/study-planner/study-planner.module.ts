import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { StudyPlannerAiClient } from "./study-planner.ai";
import { StudyPlannerController } from "./study-planner.controller";
import { StudyPlannerService } from "./study-planner.service";

@Module({
  controllers: [StudyPlannerController],
  providers: [StudyPlannerService, StudyPlannerAiClient, PrismaService],
  exports: [StudyPlannerService],
})
export class StudyPlannerModule {}
