import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { QuizStatus, MockExamStatus } from "@prisma/client";
import {
  CreateMockExamDto,
  UpdateMockExamDto,
  AddMockExamQuestionsDto,
  SubmitMockExamDto,
} from "./mock-exam.dto";
import { serializeMockExam, serializeMockExams } from "./mock-exam.serializer";

@Injectable()
export class MockExamService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly questionInclude = {
    questions: {
      orderBy: { sortOrder: "asc" as const },
      include: { question: true },
    },
  };

  private async findExamOrThrow(id: string) {
    const exam = await this.prisma.mockExam.findUnique({
      where: { id },
      include: this.questionInclude,
    });
    if (!exam) {
      throw new BadRequestException("Mock exam not found");
    }
    return exam;
  }

  listTeacherMockExams() {
    return this.prisma.mockExam
      .findMany({
        include: this.questionInclude,
        orderBy: { createdAt: "desc" },
      })
      .then(serializeMockExams);
  }

  async createMockExam(dto: CreateMockExamDto) {
    const questionIds = dto.questionIds ?? [];
    const questions = questionIds.length
      ? await this.prisma.quizQuestion.findMany({
          where: { id: { in: questionIds } },
          select: { id: true },
        })
      : [];
    const foundIds = new Set(questions.map((question) => question.id));
    const missing = questionIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Some questions were not found: ${missing.join(", ")}`,
      );
    }

    const exam = await this.prisma.mockExam.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        courseId: dto.courseId ?? null,
        durationSeconds: dto.durationSeconds ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        questions: {
          create: questionIds.map((questionId, index) => ({
            questionId,
            sortOrder: index + 1,
          })),
        },
      },
      include: this.questionInclude,
    });
    return serializeMockExam(exam);
  }

  async updateMockExam(id: string, dto: UpdateMockExamDto) {
    await this.findExamOrThrow(id);

    const data: Record<string, unknown> = {
      title: dto.title,
      description: dto.description ?? undefined,
      courseId: dto.courseId ?? undefined,
      durationSeconds: dto.durationSeconds ?? undefined,
      startsAt:
        dto.startsAt !== undefined
          ? dto.startsAt
            ? new Date(dto.startsAt)
            : null
          : undefined,
      endsAt:
        dto.endsAt !== undefined
          ? dto.endsAt
            ? new Date(dto.endsAt)
            : null
          : undefined,
    };

    if (dto.questionIds) {
      const questions = dto.questionIds.length
        ? await this.prisma.quizQuestion.findMany({
            where: { id: { in: dto.questionIds } },
            select: { id: true },
          })
        : [];
      const foundIds = new Set(questions.map((question) => question.id));
      const missing = dto.questionIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Some questions were not found: ${missing.join(", ")}`,
        );
      }
      data.questions = {
        deleteMany: {},
        create: dto.questionIds.map((questionId, index) => ({
          questionId,
          sortOrder: index + 1,
        })),
      };
    }

    const exam = await this.prisma.mockExam.update({
      where: { id },
      data,
      include: this.questionInclude,
    });
    return serializeMockExam(exam);
  }

  async addQuestions(id: string, dto: AddMockExamQuestionsDto) {
    await this.findExamOrThrow(id);

    const questions = dto.questionIds.length
      ? await this.prisma.quizQuestion.findMany({
          where: { id: { in: dto.questionIds } },
          select: { id: true },
        })
      : [];
    const foundIds = new Set(questions.map((question) => question.id));
    const missing = dto.questionIds.filter((questionId) => !foundIds.has(questionId));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Some questions were not found: ${missing.join(", ")}`,
      );
    }

    const existing = await this.prisma.mockExamQuestion.findMany({
      where: { examId: id, questionId: { in: dto.questionIds } },
      select: { questionId: true },
    });
    const existingIds = new Set(existing.map((entry) => entry.questionId));
    const nextSortOrder = await this.prisma.mockExamQuestion.count({
      where: { examId: id },
    });

    await this.prisma.mockExamQuestion.createMany({
      data: dto.questionIds
        .filter((questionId) => !existingIds.has(questionId))
        .map((questionId, index) => ({
          examId: id,
          questionId,
          sortOrder: nextSortOrder + index + 1,
        })),
    });

    return serializeMockExam(await this.findExamOrThrow(id));
  }

  async removeQuestion(id: string, questionId: string) {
    await this.prisma.mockExamQuestion.deleteMany({
      where: { examId: id, questionId },
    });
    return serializeMockExam(await this.findExamOrThrow(id));
  }

  async publishMockExam(id: string) {
    const exam = await this.prisma.mockExam.findUnique({
      where: { id },
      include: {
        questions: { select: { question: { select: { status: true } } } },
      },
    });
    if (!exam) {
      throw new BadRequestException("Mock exam not found");
    }
    if (exam.status === MockExamStatus.ARCHIVED) {
      throw new BadRequestException("Archived mock exams cannot be published");
    }
    if (exam.questions.length === 0) {
      throw new BadRequestException(
        "Add at least one question to the exam before publishing.",
      );
    }
    const notApproved = exam.questions.filter(
      (entry) => entry.question.status !== QuizStatus.APPROVED,
    );
    if (notApproved.length > 0) {
      throw new BadRequestException(
        `${notApproved.length} question${notApproved.length > 1 ? "s are" : " is"} not approved yet. Approve all questions before publishing.`,
      );
    }

    const updated = await this.prisma.mockExam.update({
      where: { id },
      data: { status: MockExamStatus.PUBLISHED, publishedAt: new Date() },
      include: this.questionInclude,
    });
    return serializeMockExam(updated);
  }

  deleteMockExam(id: string) {
    return this.prisma.mockExam.delete({ where: { id } });
  }

  async listStudentMockExams(studentId?: string) {
    const now = new Date();
    const exams = await this.prisma.mockExam.findMany({
      where: {
        status: MockExamStatus.PUBLISHED,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ...(studentId ? [{ attempts: { none: { studentId } } }] : []),
        ],
        questions: {
          some: { question: { status: QuizStatus.APPROVED } },
        },
      },
      include: this.questionInclude,
      orderBy: { createdAt: "desc" },
    });

    const examsWithApprovedOnly = exams
      .map((exam) => ({
        ...exam,
        questions: exam.questions.filter(
          (entry) => entry.question.status === QuizStatus.APPROVED,
        ),
      }))
      .filter((exam) => exam.questions.length > 0);

    return serializeMockExams(examsWithApprovedOnly);
  }

  async submitMockExam(id: string, body: SubmitMockExamDto) {
    const exam = await this.prisma.mockExam.findUnique({ where: { id } });
    if (!exam) {
      throw new BadRequestException("Mock exam not found");
    }
    if (exam.status !== MockExamStatus.PUBLISHED) {
      throw new BadRequestException("This mock exam is not available");
    }
    const now = new Date();
    if (exam.startsAt && exam.startsAt > now) {
      throw new BadRequestException("This mock exam has not started yet");
    }
    if (exam.endsAt && exam.endsAt < now) {
      throw new BadRequestException("This mock exam has expired");
    }
    const existing = await this.prisma.mockExamAttempt.findFirst({
      where: { examId: id, studentId: body.studentId },
    });
    if (existing) {
      throw new BadRequestException("You have already submitted this mock exam");
    }

    const passed =
      body.totalQuestions > 0 && body.score / body.totalQuestions >= 0.6;
    return this.prisma.mockExamAttempt.create({
      data: {
        examId: id,
        studentId: body.studentId,
        score: body.score,
        totalQuestions: body.totalQuestions,
        passed,
      },
    });
  }
}