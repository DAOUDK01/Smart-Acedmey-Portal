import { Module } from "@nestjs/common";
import { QuizController, StudentQuizController, TeacherQuizController } from "./quiz.controller";
import { QuizService } from "./quiz.service";
import { PrismaService } from "../../prisma.service";

@Module({
  controllers: [QuizController, StudentQuizController, TeacherQuizController],
  providers: [QuizService, PrismaService],
})
export class QuizModule {}
