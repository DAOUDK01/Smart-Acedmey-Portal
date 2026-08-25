import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import {
  RecommendationsAdminController,
  StudentRecommendationsController,
} from "./recommendations.controller";
import { RecommendationsService } from "./recommendations.service";

@Module({
  controllers: [StudentRecommendationsController, RecommendationsAdminController],
  providers: [RecommendationsService, PrismaService],
})
export class RecommendationsModule {}