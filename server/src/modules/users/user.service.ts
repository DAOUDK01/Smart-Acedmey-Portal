import { Injectable, ConflictException, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { ChangePasswordDto, CompleteStaffRegistrationDto, CreateUserDto, InviteStaffDto, ReviewStaffInvitationDto, UpdateMeDto, UpdateUserDto } from "./user.dto";
import { createHash, randomBytes } from "crypto";
import { hashPassword, verifyPassword } from "../auth/password";
import { EmailService, escapeHtml, frontendBaseUrl } from "../auth/email.service";
import { GuardianService } from "../guardian/guardian.service";

type StaffInvitationRecord = {
  id: string;
  email: string;
  name: string;
  role: "TEACHER";
  status: "INVITED" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  phoneNumber?: string | null;
  educationDetails?: string | null;
  personalDetails?: string | null;
  documentLinks?: string[] | null;
  adminNotes?: string | null;
  expiresAt: Date;
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly guardianService: GuardianService,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private staffRegistrationUrl(token: string): string {
    return `${frontendBaseUrl() || "http://localhost:3000"}/staff/register/${encodeURIComponent(token)}`;
  }

  private async ensureStaffInvitationTable() {
    await this.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StaffInvitationStatus') THEN
          CREATE TYPE "StaffInvitationStatus" AS ENUM ('INVITED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');
        END IF;
      END
      $$;
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "StaffInvitation" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" "UserRole" NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "status" "StaffInvitationStatus" NOT NULL DEFAULT 'INVITED',
        "phoneNumber" TEXT,
        "educationDetails" TEXT,
        "personalDetails" TEXT,
        "documentLinks" JSONB,
        "adminNotes" TEXT,
        "submittedAt" TIMESTAMP(3),
        "reviewedAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
      );
    `);

    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvitation_email_key" ON "StaffInvitation"("email");`);
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StaffInvitation_status_createdAt_idx" ON "StaffInvitation"("status", "createdAt");`);
  }

  listUsers() {
    return this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  getUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(body: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictException("User already exists");

    return this.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        phoneNumber: body.phoneNumber,
        avatarUrl: body.avatarUrl,
        isActive: true,
      },
    });
  }

  async listStaffInvitations() {
    await this.ensureStaffInvitationTable();
    return this.prisma.$queryRaw<StaffInvitationRecord[]>`
      SELECT * FROM "StaffInvitation" ORDER BY "createdAt" DESC
    `;
  }

  async inviteStaff(body: InviteStaffDto) {
    await this.ensureStaffInvitationTable();

    if (body.role !== "TEACHER") {
      throw new BadRequestException("Staff role must be TEACHER");
    }

    const email = body.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException("A user with this email already exists");

    const token = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitationId = randomBytes(12).toString("hex");
    const existingInvitation = await this.prisma.$queryRaw<StaffInvitationRecord[]>`
      SELECT * FROM "StaffInvitation" WHERE "email" = ${email} LIMIT 1
    `;

    const invitation = existingInvitation[0]
      ? (
          await this.prisma.$queryRaw<StaffInvitationRecord[]>`
            UPDATE "StaffInvitation"
            SET "name" = ${body.name}, "role" = ${body.role}::"UserRole", "tokenHash" = ${tokenHash},
                "status" = 'INVITED'::"StaffInvitationStatus", "adminNotes" = NULL,
                "expiresAt" = ${expiresAt}, "updatedAt" = NOW()
            WHERE "email" = ${email}
            RETURNING *
          `
        )[0]
      : (
          await this.prisma.$queryRaw<StaffInvitationRecord[]>`
            INSERT INTO "StaffInvitation" ("id", "email", "name", "role", "tokenHash", "expiresAt", "updatedAt")
            VALUES (${invitationId}, ${email}, ${body.name}, ${body.role}::"UserRole", ${tokenHash}, ${expiresAt}, NOW())
            RETURNING *
          `
        )[0];

    const link = this.staffRegistrationUrl(token);
    const mail = await this.emailService.trySend(
      email,
      "Complete your SmartAcademy staff registration",
      `<p>Hello ${escapeHtml(body.name)},</p><p>You have been invited to join SmartAcademy as a teacher.</p><p><a href="${link}">Complete your registration</a></p><p>This link expires in 7 days.</p>`,
      `Hello ${body.name}, complete your SmartAcademy staff registration: ${link}`,
    );
    return {
      ...invitation,
      registrationLink: link,
      emailSent: mail.sent,
      ...(mail.sent ? {} : { emailError: mail.reason }),
    };
  }

  async deletePendingStaffInvitation(id: string) {
    await this.ensureStaffInvitationTable();

    const deleted = await this.prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "StaffInvitation"
      WHERE "id" = ${id}
        AND "status" IN (
          'INVITED'::"StaffInvitationStatus",
          'REVISION_REQUESTED'::"StaffInvitationStatus"
        )
      RETURNING "id"
    `;

    if (deleted.length === 0) {
      throw new BadRequestException(
        "Only pending or revision-requested staff invitations can be deleted",
      );
    }

    return { success: true };
  }

  async getStaffInvitationByToken(token: string) {
    await this.ensureStaffInvitationTable();

    const [invitation] = await this.prisma.$queryRaw<StaffInvitationRecord[]>`
      SELECT "id", "email", "name", "role", "status", "adminNotes", "expiresAt"
      FROM "StaffInvitation"
      WHERE "tokenHash" = ${this.hashToken(token)}
      LIMIT 1
    `;

    if (!invitation || invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation link is invalid or expired");
    }

    return invitation;
  }

  async completeStaffRegistration(body: CompleteStaffRegistrationDto) {
    await this.ensureStaffInvitationTable();

    const [invitation] = await this.prisma.$queryRaw<StaffInvitationRecord[]>`
      SELECT * FROM "StaffInvitation" WHERE "tokenHash" = ${this.hashToken(body.token)} LIMIT 1
    `;

    if (!invitation || invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation link is invalid or expired");
    }

    if (invitation.status === "APPROVED") {
      throw new BadRequestException("This staff registration has already been approved");
    }

    await this.prisma.user.upsert({
      where: { email: invitation.email },
      update: {
        name: invitation.name,
        role: invitation.role,
        phoneNumber: body.phoneNumber,
        passwordHash: await hashPassword(body.password),
        isActive: false,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        phoneNumber: body.phoneNumber,
        passwordHash: await hashPassword(body.password),
        isActive: false,
        emailVerifiedAt: new Date(),
      },
    });

    const submitted = (
      await this.prisma.$queryRaw<StaffInvitationRecord[]>`
        UPDATE "StaffInvitation"
        SET "educationDetails" = ${body.educationDetails}, "personalDetails" = ${body.personalDetails},
            "documentLinks" = ${JSON.stringify(body.documentLinks || [])}::jsonb,
            "status" = 'SUBMITTED'::"StaffInvitationStatus", "adminNotes" = NULL,
            "submittedAt" = NOW(), "updatedAt" = NOW()
        WHERE "id" = ${invitation.id}
        RETURNING *
      `
    )[0];

    const mail = await this.emailService.trySend(
      invitation.email,
      "SmartAcademy staff registration received",
      `<p>Hello ${escapeHtml(invitation.name)},</p><p>We have received your staff registration. An administrator will review it and email you the decision.</p><p>You will be able to sign in once it is approved.</p>`,
    );
    return { ...submitted, emailSent: mail.sent };
  }

  async reviewStaffInvitation(id: string, body: ReviewStaffInvitationDto) {
    await this.ensureStaffInvitationTable();

    const [invitation] = await this.prisma.$queryRaw<StaffInvitationRecord[]>`
      SELECT * FROM "StaffInvitation" WHERE "id" = ${id} LIMIT 1
    `;
    if (!invitation) throw new NotFoundException("Staff invitation not found");

    if (
      body.status !== "APPROVED" &&
      body.status !== "REJECTED" &&
      body.status !== "REVISION_REQUESTED"
    ) {
      throw new BadRequestException("Review status must be approved, rejected, or revision requested");
    }

    const nextToken = body.status === "REVISION_REQUESTED" ? randomBytes(32).toString("hex") : null;
    const nextTokenHash = nextToken ? this.hashToken(nextToken) : null;
    const nextExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = nextTokenHash
      ? (
          await this.prisma.$queryRaw<StaffInvitationRecord[]>`
            UPDATE "StaffInvitation"
            SET "status" = ${body.status}::"StaffInvitationStatus", "adminNotes" = ${body.adminNotes || null},
                "tokenHash" = ${nextTokenHash}, "expiresAt" = ${nextExpiresAt},
                "reviewedAt" = NOW(), "updatedAt" = NOW()
            WHERE "id" = ${id}
            RETURNING *
          `
        )[0]
      : (
          await this.prisma.$queryRaw<StaffInvitationRecord[]>`
            UPDATE "StaffInvitation"
            SET "status" = ${body.status}::"StaffInvitationStatus", "adminNotes" = ${body.adminNotes || null},
                "reviewedAt" = NOW(), "updatedAt" = NOW()
            WHERE "id" = ${id}
            RETURNING *
          `
        )[0];

    // The decision is saved by now. The email is best effort so a bounce cannot turn it into an
    // error the admin cannot retry; the result tells the admin whether the person was notified.
    const name = escapeHtml(invitation.name);
    const notes = body.adminNotes ? `<p>${escapeHtml(body.adminNotes)}</p>` : "";
    let subject: string;
    let html: string;
    if (body.status === "APPROVED") {
      await this.prisma.user.update({
        where: { email: invitation.email },
        data: { isActive: true },
      });
      const loginLink = `${frontendBaseUrl()}/login`;
      subject = "SmartAcademy staff application approved";
      html = `<p>Hello ${name},</p><p>Your staff application has been approved. You can now sign in to your portal:</p><p><a href="${loginLink}">${loginLink}</a></p>${notes}`;
    } else if (body.status === "REVISION_REQUESTED" && nextToken) {
      const link = this.staffRegistrationUrl(nextToken);
      subject = "SmartAcademy staff application needs revision";
      html = `<p>Hello ${name},</p><p>Your application needs revision.</p>${notes}<p><a href="${link}">Update your registration</a></p>`;
    } else {
      subject = "SmartAcademy staff application rejected";
      html = `<p>Hello ${name},</p><p>Your staff application was rejected.</p>${notes}`;
    }
    const mail = await this.emailService.trySend(invitation.email, subject, html);

    return { ...updated, emailSent: mail.sent, ...(mail.sent ? {} : { emailError: mail.reason }) };
  }

  getUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        isActive: true,
      },
    });
  }

  async getStaffAssignedCourses(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "TEACHER") throw new NotFoundException("Staff member not found");

    return this.prisma.$queryRaw<
      { id: string; courseId: string; courseTitle: string; courseCode: string | null; className: string; classCode: string; sectionName: string; isActive: boolean }[]
    >`
      SELECT assignment."id", assignment."courseId", course."title" AS "courseTitle", course."code" AS "courseCode",
        class."name" AS "className", class."code" AS "classCode", section."name" AS "sectionName", assignment."isActive"
      FROM "SectionCourseAssignment" assignment
      JOIN "Course" course ON course."id" = assignment."courseId"
      JOIN "ClassSection" section ON section."id" = assignment."sectionId"
      JOIN "AcademicClass" class ON class."id" = section."classId"
      WHERE assignment."teacherId" = ${userId}
      ORDER BY class."name", section."name", course."title"
    `;
  }

  async updateUser(id: string, body: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    const updated = await this.prisma.user.update({
      where: { id },
      data: body as any,
    });

    if (
      user.role === "STUDENT" &&
      !user.isActive &&
      updated.isActive &&
      body.isActive === true
    ) {
      await this.guardianService.issueCredentialsForStudent(user.email);
    }

    return updated;
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const { passwordHash, ...profile } = user;
    return profile;
  }

  async updateCurrentUser(userId: string, body: UpdateMeDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phoneNumber !== undefined ? { phoneNumber: body.phoneNumber } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
      select: { id: true, name: true, email: true, role: true, phoneNumber: true, avatarUrl: true, isActive: true },
    });
  }

  async changePassword(userId: string, body: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    if (!(await verifyPassword(body.currentPassword, user.passwordHash)).valid) {
      throw new BadRequestException("Current password is incorrect");
    }

    if (body.newPassword.length < 6) {
      throw new BadRequestException("New password must be at least 6 characters");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });

    return { message: "Password changed successfully" };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.delete({ where: { id } });
  }
}
