import { Module } from "@nestjs/common";
import {
  StudentMockExamController,
  TeacherMockExamController,
} from "./mock-exam.controller";
import { MockExamService } from "./mock-exam.service";
import { PrismaService } from "../../prisma.service";

@Module({
  controllers: [TeacherMockExamController, StudentMockExamController],
  providers: [MockExamService, PrismaService],
})
export class MockExamModule {}