import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "crypto";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";
import { CompleteAdmissionDto, RequestAdmissionDto, ReviewAdmissionDto } from "./admission.dto";

type Admission = { id: string; name: string; email: string; desiredClassId: string; assignedSectionId: string | null; selectedCourseIds: string[]; status: string; tokenHash: string | null; expiresAt: Date | null };

@Injectable()
export class AdmissionService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  async catalog() {
    return this.prisma.$queryRaw<any[]>`
      SELECT class."id", class."name", class."code", class."academicYear",
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', course."id", 'title', course."title", 'code', course."code")) FILTER (WHERE course."id" IS NOT NULL), '[]'::jsonb) AS courses
      FROM "AcademicClass" class
      LEFT JOIN "ClassSection" section ON section."classId" = class."id" AND section."isActive" = true
      LEFT JOIN "SectionCourseAssignment" assignment ON assignment."sectionId" = section."id" AND assignment."isActive" = true
      LEFT JOIN "Course" course ON course."id" = assignment."courseId"
      WHERE class."isActive" = true
      GROUP BY class."id" ORDER BY class."name"
    `;
  }

  async request(body: RequestAdmissionDto) {
    const email = body.email.trim().toLowerCase();
    if (!body.selectedCourseIds.length) throw new BadRequestException("Select at least one course");
    const classes = await this.prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AcademicClass" WHERE "id"=${body.desiredClassId} AND "isActive"=true`;
    if (!classes[0]) throw new NotFoundException("Class not found");
    const existingUser = await this.prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "email"=${email}`;
    if (existingUser[0]) throw new ConflictException("An account already exists with this email");
    const validCourses = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT assignment."courseId" AS id FROM "SectionCourseAssignment" assignment
      JOIN "ClassSection" section ON section."id"=assignment."sectionId"
      WHERE section."classId"=${body.desiredClassId} AND assignment."courseId"=ANY(${body.selectedCourseIds}::text[])
    `;
    if (validCourses.length !== new Set(body.selectedCourseIds).size) throw new BadRequestException("One or more courses are not available for this class");
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "StudentAdmission" ("id","name","email","desiredClassId","selectedCourseIds","updatedAt")
      VALUES (${id},${body.name.trim()},${email},${body.desiredClassId},${JSON.stringify([...new Set(body.selectedCourseIds)])}::jsonb,NOW())
      ON CONFLICT ("email") DO UPDATE SET "name"=EXCLUDED."name", "desiredClassId"=EXCLUDED."desiredClassId", "selectedCourseIds"=EXCLUDED."selectedCourseIds", "status"='REQUESTED'::"StudentAdmissionStatus", "updatedAt"=NOW()
    `;
    return { success: true, message: "Admission request submitted" };
  }

  list() {
    return this.prisma.$queryRaw<any[]>`
      SELECT admission.*, class."name" AS "className", class."code" AS "classCode", section."name" AS "sectionName",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', course."id", 'title', course."title", 'code', course."code")) FROM "Course" course WHERE course."id" IN (SELECT jsonb_array_elements_text(admission."selectedCourseIds"))), '[]'::jsonb) AS courses
      FROM "StudentAdmission" admission JOIN "AcademicClass" class ON class."id"=admission."desiredClassId"
      LEFT JOIN "ClassSection" section ON section."id"=admission."assignedSectionId" ORDER BY admission."createdAt" DESC
    `;
  }

  async proceed(id: string) {
    const admission = await this.get(id);
    if (admission.status !== "REQUESTED") throw new BadRequestException("Only new requests can be processed");
    const sections = await this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT section."id", section."name" FROM "ClassSection" section
      WHERE section."classId"=${admission.desiredClassId} AND section."isActive"=true
        AND (SELECT COUNT(*) FROM "StudentAdmission" enrolled WHERE enrolled."assignedSectionId"=section."id"
          AND (enrolled."status" IN ('SUBMITTED','APPROVED') OR (enrolled."status"='INVITED' AND enrolled."expiresAt">NOW()))) < section."capacity"
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(admission.selectedCourseIds)}::jsonb) requested(course_id)
          WHERE NOT EXISTS (SELECT 1 FROM "SectionCourseAssignment" assignment WHERE assignment."sectionId"=section."id" AND assignment."courseId"=requested.course_id AND assignment."isActive"=true))
      ORDER BY section."name" LIMIT 1
    `;
    if (!sections[0]) throw new BadRequestException("No section has an available slot with all requested courses");
    const token = randomBytes(32).toString("hex"); const tokenHash = this.hash(token); const expiresAt = new Date(Date.now()+7*86400000);
    await this.prisma.$executeRaw`UPDATE "StudentAdmission" SET "assignedSectionId"=${sections[0].id},"tokenHash"=${tokenHash},"expiresAt"=${expiresAt},"status"='INVITED'::"StudentAdmissionStatus","updatedAt"=NOW() WHERE "id"=${id}`;
    const link = `${process.env.FRONTEND_URL?.replace(/\/$/, "")}/student/register/${token}`;
    try { await this.email.sendEmail(admission.email,"Complete your SmartAcademy admission",`<p>Hello ${admission.name},</p><p>Your admission request can proceed. You have been allocated Section ${sections[0].name}.</p><p><a href="${link}">Complete registration</a></p><p>This link expires in 7 days.</p>`); return { success:true,emailSent:true,registrationLink:link }; }
    catch (error) { return { success:true,emailSent:false,registrationLink:link,emailError:error instanceof Error?error.message:"Email failed" }; }
  }

  async byToken(token: string) {
    const rows = await this.prisma.$queryRaw<any[]>`SELECT admission."id",admission."name",admission."email",admission."status",admission."expiresAt",class."name" AS "className",section."name" AS "sectionName" FROM "StudentAdmission" admission JOIN "AcademicClass" class ON class."id"=admission."desiredClassId" LEFT JOIN "ClassSection" section ON section."id"=admission."assignedSectionId" WHERE admission."tokenHash"=${this.hash(token)} LIMIT 1`;
    if (!rows[0] || !rows[0].expiresAt || rows[0].expiresAt < new Date()) throw new NotFoundException("Registration link is invalid or expired");
    return rows[0];
  }

  async complete(body: CompleteAdmissionDto) {
    const found = await this.prisma.$queryRaw<Admission[]>`SELECT * FROM "StudentAdmission" WHERE "tokenHash"=${this.hash(body.token)} LIMIT 1`;
    const admission=found[0]; if(!admission || !admission.expiresAt || admission.expiresAt<new Date()) throw new NotFoundException("Registration link is invalid or expired");
    const passwordHash=createHash("sha256").update(body.password).digest("hex");
    await this.prisma.$executeRaw`INSERT INTO "User" ("id","role","name","email","passwordHash","phoneNumber","isActive","emailVerifiedAt","createdAt","updatedAt") VALUES (${randomUUID()},'STUDENT'::"UserRole",${admission.name},${admission.email},${passwordHash},${body.phoneNumber},false,NOW(),NOW(),NOW()) ON CONFLICT ("email") DO UPDATE SET "passwordHash"=${passwordHash},"phoneNumber"=${body.phoneNumber},"isActive"=false,"updatedAt"=NOW()`;
    await this.prisma.$executeRaw`UPDATE "StudentAdmission" SET "phoneNumber"=${body.phoneNumber},"personalDetails"=${JSON.stringify(body.personalDetails)}::jsonb,"guardianDetails"=${JSON.stringify(body.guardianDetails)}::jsonb,"educationDetails"=${JSON.stringify(body.educationDetails)}::jsonb,"documentLinks"=${JSON.stringify(body.documentLinks||[])}::jsonb,"status"='SUBMITTED'::"StudentAdmissionStatus","submittedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${admission.id}`;
    return { success:true };
  }

  async review(id:string,body:ReviewAdmissionDto){ const admission=await this.get(id); if(admission.status!=="SUBMITTED") throw new BadRequestException("Only submitted forms can be reviewed"); await this.prisma.$executeRaw`UPDATE "StudentAdmission" SET "status"=${body.status}::"StudentAdmissionStatus","adminNotes"=${body.adminNotes||null},"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${id}`; if(body.status==="APPROVED") await this.prisma.$executeRaw`UPDATE "User" SET "isActive"=true,"updatedAt"=NOW() WHERE "email"=${admission.email}`; await this.email.sendEmail(admission.email,`Admission ${body.status.toLowerCase()}`,`<p>Hello ${admission.name},</p><p>Your admission has been ${body.status.toLowerCase()}.</p><p>${body.adminNotes||""}</p>`); return {success:true}; }
  private async get(id:string){const rows=await this.prisma.$queryRaw<Admission[]>`SELECT * FROM "StudentAdmission" WHERE "id"=${id} LIMIT 1`;if(!rows[0])throw new NotFoundException("Admission request not found");return rows[0];}
  private hash(value:string){return createHash("sha256").update(value).digest("hex");}
}
