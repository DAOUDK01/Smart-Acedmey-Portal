import { Module } from "@nestjs/common";
import { QuizController, StudentQuizController, TeacherQuizController, ExpertQuizController } from "./quiz.controller";
import { QuizService } from "./quiz.service";
import { PrismaService } from "../../prisma.service";

@Module({
  controllers: [QuizController, StudentQuizController, TeacherQuizController, ExpertQuizController],
  providers: [QuizService, PrismaService],
})
export class QuizModule {}
