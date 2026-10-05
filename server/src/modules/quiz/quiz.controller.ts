import { BadRequestException, Controller, Get, Post, Patch, Delete, Param, Body, Query, Req } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/identity";
import { Roles } from "../auth/roles.decorator";
import { Throttle } from "@nestjs/throttler";
import { QuizService } from "./quiz.service";
import { CreateQuizQuestionDto, UpdateQuizQuestionDto, CreateQuizAttemptDto } from "./quiz.dto";
import { QuizStatus } from "@prisma/client";

@Roles("ADMIN", "TEACHER")
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

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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

@Roles("STUDENT", "ADMIN")
@Controller("student/quiz")
export class StudentQuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get("questions")
  listQuizQuestions() {
    return this.quizService.listQuizQuestionsByStatus(QuizStatus.APPROVED);
  }

  @Get("attempts/me")
  listMyAnsweredQuizIds(@Req() req: { user?: AuthenticatedUser }) {
    return this.quizService.listAnsweredQuizIds(req.user);
  }

  @Get("mock-exams")
  listApprovedMockExams() {
    return this.quizService.listApprovedMockExams();
  }

  @Get("questions/:id")
  getQuizQuestion(@Param("id") id: string) {
    return this.quizService.getQuizQuestion(id);
  }

  @Post("attempts")
  async createQuizAttempt(
    @Body() body: CreateQuizAttemptDto,
    @Req() req: { user?: AuthenticatedUser },
  ) {
    const studentId = await this.quizService.resolveStudentKey(req.user);
    const score = Math.min(100, Math.max(0, body.score));
    return this.quizService.createQuizAttempt({ ...body, studentId, score });
  }
}

@Roles("TEACHER", "ADMIN")
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

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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

  @Roles("STUDENT", "ADMIN")
  @Post(":id/attempt")
  async createQuizAttempt(
    @Param("id") quizId: string,
    @Body() body: { answer: string; responseTime: number },
    @Req() req: { user?: AuthenticatedUser },
  ) {
    const studentId = await this.quizService.resolveStudentKey(req.user);
    const quizQuestion = await this.quizService.getApprovedQuizForAttempt(quizId);
    if (!quizQuestion) {
      throw new BadRequestException("Quiz is not available for students");
    }
    const correctAnswer = quizQuestion?.correctAnswer;
    const passed = body.answer === correctAnswer;
    const score = passed ? 100 : 0;
    const attempt = await this.quizService.createQuizAttempt({
      quizId,
      studentId,
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

