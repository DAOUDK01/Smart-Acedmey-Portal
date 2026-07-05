import { Module } from "@nestjs/common";
import { ContentController, GuardianProgressController, TeacherContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { PrismaService } from "../../prisma.service";

@Module({
  controllers: [ContentController, GuardianProgressController, TeacherContentController],
  providers: [ContentService, PrismaService],
})
export class ContentModule {}
