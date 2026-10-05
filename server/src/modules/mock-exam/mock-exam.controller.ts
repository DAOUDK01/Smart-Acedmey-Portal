import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/identity";
import { Roles } from "../auth/roles.decorator";
import { MockExamService } from "./mock-exam.service";
import {
  AddMockExamQuestionsDto,
  CreateMockExamDto,
  SubmitMockExamDto,
  UpdateMockExamDto,
} from "./mock-exam.dto";

@Roles("TEACHER", "ADMIN")
@Controller("teacher/mock-exams")
export class TeacherMockExamController {
  constructor(private readonly mockExamService: MockExamService) {}

  @Get()
  listMockExams() {
    return this.mockExamService.listTeacherMockExams();
  }

  @Post()
  createMockExam(@Body() body: CreateMockExamDto) {
    return this.mockExamService.createMockExam(body);
  }

  @Patch(":id")
  updateMockExam(@Param("id") id: string, @Body() body: UpdateMockExamDto) {
    return this.mockExamService.updateMockExam(id, body);
  }

  @Delete(":id")
  deleteMockExam(@Param("id") id: string) {
    return this.mockExamService.deleteMockExam(id);
  }

  @Post(":id/questions")
  addQuestions(@Param("id") id: string, @Body() body: AddMockExamQuestionsDto) {
    return this.mockExamService.addQuestions(id, body);
  }

  @Delete(":id/questions/:questionId")
  removeQuestion(
    @Param("id") id: string,
    @Param("questionId") questionId: string,
  ) {
    return this.mockExamService.removeQuestion(id, questionId);
  }

  @Post(":id/publish")
  publishMockExam(@Param("id") id: string) {
    return this.mockExamService.publishMockExam(id);
  }
}

@Roles("STUDENT", "ADMIN")
@Controller("student/mock-exams")
export class StudentMockExamController {
  constructor(private readonly mockExamService: MockExamService) {}

  @Get()
  listMockExams(@Req() req: { user?: AuthenticatedUser }) {
    return this.mockExamService.listStudentMockExams(req.user);
  }

  @Post(":id/submit")
  submitMockExam(
    @Param("id") id: string,
    @Body() body: SubmitMockExamDto,
    @Req() req: { user?: AuthenticatedUser },
  ) {
    return this.mockExamService.submitMockExam(id, body, req.user);
  }
}