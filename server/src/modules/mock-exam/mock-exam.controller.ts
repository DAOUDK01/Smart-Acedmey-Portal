import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { MockExamService } from "./mock-exam.service";
import {
  AddMockExamQuestionsDto,
  CreateMockExamDto,
  SubmitMockExamDto,
  UpdateMockExamDto,
} from "./mock-exam.dto";

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

@Controller("student/mock-exams")
export class StudentMockExamController {
  constructor(private readonly mockExamService: MockExamService) {}

  @Get()
  listMockExams(@Query("studentId") studentId?: string) {
    return this.mockExamService.listStudentMockExams(studentId);
  }

  @Post(":id/submit")
  submitMockExam(@Param("id") id: string, @Body() body: SubmitMockExamDto) {
    return this.mockExamService.submitMockExam(id, body);
  }
}