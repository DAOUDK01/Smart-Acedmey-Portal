import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { GuardianModule } from "../guardian/guardian.module";
import { StatsModule } from "../stats/stats.module";
import { StudyPlannerModule } from "../study-planner/study-planner.module";
import { AssistantContextService } from "./assistant.context";
import { AssistantController } from "./assistant.controller";
import { AssistantLlm } from "./assistant.llm";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [GuardianModule, StatsModule, StudyPlannerModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantContextService, AssistantLlm, PrismaService],
})
export class AssistantModule {}
