import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";

@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async dashboard(guardianEmail: string) {
    const email = guardianEmail.trim().toLowerCase();
    const guardian = await this.prisma.user.findUnique({ where: { email } });
    if (!guardian || guardian.role !== "GUARDIAN") {
      throw new NotFoundException("Guardian account not found");
    }

    const links = await this.prisma.guardianStudentLink.findMany({
      where: { guardianEmail: email },
    });
    if (links.length === 0) {
      return {
        guardian: { id: guardian.id, name: guardian.name, email: guardian.email },
        student: null,
        progress: null,
        courses: [],
        lectures: [],
        attempts: [],
        weakTopics: [],
      };
    }

    const link = links[0];
    const student = await this.prisma.user.findUnique({
      where: { email: link.studentEmail },
    });
    const studentIds = [link.studentEmail, student?.id].filter(
      (value): value is string => Boolean(value),
    );

    const progress = await this.prisma.studentProgress.findFirst({
      where: { studentId: { in: studentIds } },
    });

    const weakTopics = this.parseWeakTopics(progress?.weakTopics);

    const [courses, lectures, quizzes, attempts] = await Promise.all([
      this.prisma.course.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, code: true, description: true },
      }),
      this.prisma.lecture.findMany({
        orderBy: [{ courseId: "asc" }, { lectureOrder: "asc" }],
      }),
      this.prisma.quizQuestion.findMany({
        where: { lectureId: { not: null } },
        select: { id: true, lectureId: true, topic: true },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId: { in: studentIds } },
        include: { quiz: true },
        orderBy: { submittedAt: "desc" },
        take: 100,
      }),
    ]);

    const quizzesByLecture = new Map<string, string[]>();
    for (const quiz of quizzes) {
      const lectureId = quiz.lectureId;
      if (!lectureId) continue;
      const ids = quizzesByLecture.get(lectureId) ?? [];
      ids.push(quiz.id);
      quizzesByLecture.set(lectureId, ids);
    }

    const courseIdsByLecture = new Map(lectures.map((l) => [l.id, l.courseId]));
    const attemptsByQuiz = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      const list = attemptsByQuiz.get(attempt.quizId) ?? [];
      list.push(attempt);
      attemptsByQuiz.set(attempt.quizId, list);
    }

    const lecturesWithRecommendations = lectures.map((lecture) => {
      const quizIds = quizzesByLecture.get(lecture.id) ?? [];
      const lectureAttempts = quizIds.flatMap((quizId) => attemptsByQuiz.get(quizId) ?? []);
      const attempted = lectureAttempts.length > 0;
      const avgScore = attempted
        ? Math.round(
            lectureAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
              lectureAttempts.length,
          )
        : 0;
      const failed = lectureAttempts.filter((attempt) => !attempt.passed).length;
      const topicMatchesWeakTopic = weakTopics.some((topic) =>
        lecture.title.toLowerCase().includes(topic.toLowerCase()),
      );

      let recommendation: string;
      if (!attempted) {
        recommendation = "Not started yet — watch this lecture and complete its checkpoint quiz.";
      } else if (avgScore < 50) {
        recommendation = "High risk — average checkpoint score is below 50%. Revisit the lecture and retake the quiz.";
      } else if (topicMatchesWeakTopic || failed > 0) {
        recommendation = "Review recommended — some checkpoint questions were missed. Read the transcript recap.";
      } else if (avgScore < 80) {
        recommendation = "Progressing well — a quick revision of the transcript will firm up weak points.";
      } else {
        recommendation = "On track — continue to the next lecture.";
      }

      return {
        id: lecture.id,
        title: lecture.title,
        courseId: lecture.courseId,
        lectureOrder: lecture.lectureOrder,
        durationMinutes: lecture.durationMinutes,
        videoUrl: lecture.videoUrl,
        transcript: lecture.transcript,
        publishedAt: lecture.publishedAt,
        attempted,
        avgScore,
        attemptCount: lectureAttempts.length,
        failed,
        recommendation,
      };
    });

    const coursesWithScores = courses.map((course) => {
      const courseLectureIds = lectures
        .filter((lecture) => lecture.courseId === course.id)
        .map((lecture) => lecture.id);
      const courseQuizIds = courseLectureIds.flatMap(
        (lectureId) => quizzesByLecture.get(lectureId) ?? [],
      );
      const courseAttempts = courseQuizIds.flatMap(
        (quizId) => attemptsByQuiz.get(quizId) ?? [],
      );
      const score =
        courseAttempts.length > 0
          ? Math.round(
              courseAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
                courseAttempts.length,
            )
          : 0;
      return {
        ...course,
        avgScore: score,
        quizCount: courseQuizIds.length,
        attemptCount: courseAttempts.length,
        passed: courseAttempts.filter((attempt) => attempt.passed).length,
        failed: courseAttempts.filter((attempt) => !attempt.passed).length,
        recommendation:
          score === 0
            ? "No checkpoint quizzes attempted yet in this subject."
            : score < 50
              ? "At risk — schedule a revision session and revisit the lecture transcripts."
              : score < 80
                ? "Building mastery — keep completing checkpoint quizzes to improve."
                : "Strong subject performance — maintain the current pace.",
      };
    });

    const attemptDetails = attempts.map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      question: attempt.quiz.question,
      topic: attempt.quiz.topic,
      difficulty: attempt.quiz.difficulty,
      lectureId: attempt.quiz.lectureId,
      courseId: attempt.quiz.lectureId ? courseIdsByLecture.get(attempt.quiz.lectureId) ?? null : null,
      score: attempt.score,
      passed: attempt.passed,
      responseTime: attempt.responseTime,
      attemptNumber: attempt.attemptNumber,
      submittedAt: attempt.submittedAt,
    }));

    return {
      guardian: { id: guardian.id, name: guardian.name, email: guardian.email },
      student: student
        ? { id: student.id, name: student.name, email: student.email }
        : null,
      progress: progress
        ? {
            ...progress,
            weakTopics: weakTopics,
          }
        : null,
      weakTopics,
      courses: coursesWithScores,
      lectures: lecturesWithRecommendations,
      attempts: attemptDetails,
    };
  }

  private parseWeakTopics(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : value ? [value] : [];
      } catch {
        return value ? [value] : [];
      }
    }
    return [];
  }

  /**
   * Creates (or refreshes) the GUARDIAN portal account from the guardian
   * details captured during student registration and links it to the
   * student. No password is issued and no email is sent here — login
   * credentials are generated and emailed when the admin approves the
   * student (see issueCredentialsForStudent).
   */
  async provisionStudentGuardian(
    studentEmail: string,
    studentName: string,
    details: Record<string, unknown>,
  ): Promise<{ email: string | null; name: string | null }> {
    const name = String(details.name || "").trim();
    const email = String(details.email || "").trim().toLowerCase();
    if (!email) return { email: null, name: null };

    const existing = await this.prisma.$queryRaw<{ role: string }[]>`SELECT "role" FROM "User" WHERE "email"=${email}`;
    if (existing[0] && existing[0].role !== "GUARDIAN") return { email: null, name: null };

    const guardianId = randomUUID();
    const guardianName = name || "Guardian";
    const studentId = studentEmail.trim().toLowerCase();

    await this.prisma.$executeRaw`
      INSERT INTO "User" ("id","role","name","email","passwordHash","phoneNumber","isActive","createdAt","updatedAt")
      VALUES (${guardianId},'GUARDIAN'::"UserRole",${guardianName},${email},NULL,${details.phone || null},true,NOW(),NOW())
      ON CONFLICT ("email") DO UPDATE SET "name"=EXCLUDED."name","phoneNumber"=EXCLUDED."phoneNumber","isActive"=true,"updatedAt"=NOW()
    `;

    const studentRow = await this.prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "email"=${studentId}`;
    await this.prisma.$executeRaw`
      INSERT INTO "GuardianStudentLink" ("id","guardianId","studentId","guardianEmail","studentEmail","createdAt")
      VALUES (${randomUUID()},${guardianId},${studentRow[0]?.id ?? studentId},${email},${studentId},NOW())
      ON CONFLICT ("guardianId","studentId") DO UPDATE SET "studentEmail"=EXCLUDED."studentEmail"
    `;

    return { email, name: guardianName };
  }

  /**
   * Generates a login password for the guardian of the given student,
   * applies it to the guardian account, and emails the credentials to the
   * guardian's address. Called when the admin approves the student.
   */
  async issueCredentialsForStudent(studentEmail: string): Promise<{
    guardianEmail: string | null;
    emailSent: boolean;
    emailError?: string;
  }> {
    const email = studentEmail.trim().toLowerCase();
    const link = await this.prisma.guardianStudentLink.findFirst({
      where: { studentEmail: email },
    });
    if (!link) return { guardianEmail: null, emailSent: false };

    const guardian = await this.prisma.user.findUnique({
      where: { email: link.guardianEmail },
    });
    if (!guardian || guardian.role !== "GUARDIAN") {
      return { guardianEmail: link.guardianEmail, emailSent: false };
    }

    const password = this.generateGuardianPassword();
    await this.prisma.user.update({
      where: { id: guardian.id },
      data: { passwordHash: this.hash(password), isActive: true },
    });

    const student = await this.prisma.user.findUnique({ where: { email } });
    const studentName = student?.name ?? studentEmail;
    const loginLink = `${process.env.FRONTEND_URL?.replace(/\/$/, "") || ""}/login`;
    try {
      await this.emailService.sendEmail(
        guardian.email,
        "Your SmartAcademy guardian account",
        `<p>Hello ${guardian.name},</p><p>Your guardian account for <strong>${studentName}</strong> is ready.</p><p>Sign in at <a href="${loginLink}">${loginLink}</a> with:</p><ul><li>Email: <strong>${guardian.email}</strong></li><li>Password: <strong>${password}</strong></li></ul><p>You can watch your child's progress, lecture recommendations, quiz attempts and subject details.</p>`,
        `Your SmartAcademy guardian account for ${studentName} is ready. Sign in at ${loginLink} with email ${guardian.email} and password ${password}.`,
      );
      return { guardianEmail: guardian.email, emailSent: true };
    } catch (error) {
      return {
        guardianEmail: guardian.email,
        emailSent: false,
        emailError: error instanceof Error ? error.message : "Email failed",
      };
    }
  }

  private generateGuardianPassword(): string {
    const charset = "abcdefghjkmnpqrstuvwxyz23456789";
    let value = "";
    for (let i = 0; i < 10; i += 1) value += charset[Math.floor(Math.random() * charset.length)];
    return value;
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
