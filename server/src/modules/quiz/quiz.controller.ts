import { BadRequestException, Controller, Get, Post, Patch, Delete, Param, Body, Query } from "@nestjs/common";
import { QuizService } from "./quiz.service";
import { CreateQuizQuestionDto, UpdateQuizQuestionDto, CreateQuizAttemptDto } from "./quiz.dto";
import { QuizStatus } from "@prisma/client";

@Controller("admin/quiz")
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get("questions")
  listQuizQuestions() {
    return this.quizService.listQuizQuestions();
  }

  @Get("questions/:id")
  getQuizQuestion(@Param("id") id: string) {
    return this.quizService.getQuizQuestion(id);
  }

  @Post("generate")
  generateQuizQuestions(
    @Body()
    body: {
      lectureId?: string;
      topic?: string;
      transcript?: string;
      questionCount?: number;
      durationSeconds?: number;
      segments?: Array<{
        label: string;
        text: string;
        timestamp: number;
        difficulty: "easy" | "medium" | "hard";
      }>;
    },
  ) {
    return this.quizService.generateQuizQuestions(
      body.lectureId,
      body.topic,
      body.transcript,
      body.questionCount,
      body.segments,
      body.durationSeconds,
    );
  }

  @Post("questions")
  createQuizQuestion(@Body() body: CreateQuizQuestionDto) {
    return this.quizService.createQuizQuestion(body);
  }

  @Patch("questions/:id")
  updateQuizQuestion(@Param("id") id: string, @Body() body: UpdateQuizQuestionDto) {
    return this.quizService.updateQuizQuestion(id, body);
  }

  @Delete("questions/:id")
  deleteQuizQuestion(@Param("id") id: string) {
    return this.quizService.deleteQuizQuestion(id);
  }

  @Get("attempts")
  listQuizAttempts(@Query("studentId") studentId?: string) {
    return this.quizService.listQuizAttempts(studentId);
  }
}

@Controller("student/quiz")
export class StudentQuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get("questions")
  listQuizQuestions() {
    return this.quizService.listQuizQuestionsByStatus(QuizStatus.APPROVED);
  }

  @Get("questions/:id")
  getQuizQuestion(@Param("id") id: string) {
    return this.quizService.getQuizQuestion(id);
  }

  @Post("attempts")
  createQuizAttempt(@Body() body: CreateQuizAttemptDto) {
    return this.quizService.createQuizAttempt(body);
  }
}

@Controller("teacher/quizzes")
export class TeacherQuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  listQuizQuestions() {
    return this.quizService.listQuizQuestions();
  }

  @Get("approved")
  listApprovedQuizQuestions() {
    return this.quizService.listQuizQuestionsByStatus(QuizStatus.APPROVED);
  }

  @Post("generate")
  generateQuizQuestions(
    @Body()
    body: {
      lectureId?: string;
      topic?: string;
      transcript?: string;
      questionCount?: number;
      durationSeconds?: number;
      segments?: Array<{
        label: string;
        text: string;
        timestamp: number;
        difficulty: "easy" | "medium" | "hard";
      }>;
    },
  ) {
    return this.quizService.generateQuizQuestions(
      body.lectureId,
      body.topic,
      body.transcript,
      body.questionCount,
      body.segments,
      body.durationSeconds,
    );
  }

  @Patch(":id")
  updateQuizQuestion(@Param("id") id: string, @Body() body: UpdateQuizQuestionDto) {
    return this.quizService.updateQuizQuestion(id, body);
  }

  @Post()
  createQuizQuestion(@Body() body: CreateQuizQuestionDto) {
    return this.quizService.createQuizQuestion(body);
  }

  @Post(":id/approve")
  approveQuizQuestion(
    @Param("id") id: string,
    @Body() body: { reviewedBy?: string },
  ) {
    return this.quizService.teacherApproveQuiz(id, body.reviewedBy);
  }

  @Post(":id/reject")
  rejectQuizQuestion(
    @Param("id") id: string,
    @Body() body: { reviewedBy?: string },
  ) {
    return this.quizService.rejectQuiz(id, body.reviewedBy);
  }

  @Post(":id/attempt")
  async createQuizAttempt(
    @Param("id") quizId: string,
    @Body() body: { studentId: string; answer: string; responseTime: number },
  ) {
    const quizQuestion = await this.quizService.getApprovedQuizForAttempt(quizId);
    if (!quizQuestion) {
      throw new BadRequestException("Quiz is not available for students");
    }
    const correctAnswer = quizQuestion?.correctAnswer;
    const passed = body.answer === correctAnswer;
    const score = passed ? 100 : 0;
    const attempt = await this.quizService.createQuizAttempt({
      quizId,
      studentId: body.studentId,
      score,
      responseTime: body.responseTime,
      passed,
    });
    return {
      ...attempt,
      correctAnswer,
      explanation: quizQuestion?.answerExplanation || quizQuestion?.topic || "",
    };
  }
}

@Controller("expert/quizzes")
export class ExpertQuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  listPendingExpertReview() {
    return this.quizService.listQuizQuestionsByStatus(QuizStatus.TEACHER_APPROVED);
  }

  @Post(":id/approve")
  approveQuizQuestion(
    @Param("id") id: string,
    @Body() body: { reviewedBy?: string },
  ) {
    return this.quizService.expertApproveQuiz(id, body.reviewedBy);
  }

  @Post(":id/reject")
  rejectQuizQuestion(
    @Param("id") id: string,
    @Body() body: { reviewedBy?: string },
  ) {
    return this.quizService.rejectQuiz(id, body.reviewedBy);
  }
}
