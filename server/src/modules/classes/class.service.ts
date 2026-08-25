import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma.service";
import { AssignClassCourseDto, CreateClassDto, CreateSectionDto, UpdateClassCourseDto, UpdateClassDto, UpdateSectionDto } from "./class.dto";

const STARTER_ASSIGNMENT_COUNT = 2;

type ClassRow = {
  id: string; name: string; code: string; academicYear: string; description: string | null;
  isActive: boolean; createdAt: Date; updatedAt: Date;
};
type SectionRow = {
  id: string; classId: string; name: string; capacity: number;
  isActive: boolean; createdAt: Date; updatedAt: Date;
};
type CourseAssignmentRow = {
  id: string; sectionId: string; courseId: string; teacherId: string; isActive: boolean;
  createdAt: Date; updatedAt: Date; courseTitle: string; courseCode: string | null;
  teacherName: string; teacherEmail: string;
  className?: string; classCode?: string; sectionName?: string;
};

@Injectable()
export class ClassService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses() {
    const classes = await this.prisma.$queryRaw<ClassRow[]>`
      SELECT * FROM "AcademicClass" ORDER BY "academicYear" DESC, "name" ASC
    `;
    const sections = await this.prisma.$queryRaw<SectionRow[]>`
      SELECT * FROM "ClassSection" ORDER BY "name" ASC
    `;
    const assignments = await this.getCourseAssignments();
    return classes.map((item) => ({ ...item, sections: sections
      .filter((section) => section.classId === item.id)
      .map((section) => ({ ...section, courseAssignments: assignments.filter((assignment) => assignment.sectionId === section.id) })),
    }));
  }

  async createClass(body: CreateClassDto) {
    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "AcademicClass" ("id", "name", "code", "academicYear", "description", "isActive", "updatedAt")
        VALUES (${id}, ${body.name.trim()}, ${body.code.trim().toUpperCase()}, ${body.academicYear.trim()}, ${body.description?.trim() || null}, ${body.isActive ?? true}, NOW())
      `;
      return this.getClass(id);
    } catch (error: any) {
      if (error?.meta?.code === "23505" || error?.code === "P2010") throw new ConflictException("A class with this code already exists");
      throw error;
    }
  }

  async updateClass(id: string, body: UpdateClassDto) {
    const current = await this.getClassRow(id);
    try {
      await this.prisma.$executeRaw`
        UPDATE "AcademicClass" SET
          "name" = ${body.name?.trim() ?? current.name},
          "code" = ${body.code?.trim().toUpperCase() ?? current.code},
          "academicYear" = ${body.academicYear?.trim() ?? current.academicYear},
          "description" = ${body.description !== undefined ? body.description.trim() || null : current.description},
          "isActive" = ${body.isActive ?? current.isActive}, "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      return this.getClass(id);
    } catch (error: any) {
      if (error?.meta?.code === "23505" || error?.code === "P2010") throw new ConflictException("A class with this code already exists");
      throw error;
    }
  }

  async deleteClass(id: string) {
    await this.getClassRow(id);
    await this.prisma.$executeRaw`DELETE FROM "AcademicClass" WHERE "id" = ${id}`;
    return { success: true };
  }

  async createSection(classId: string, body: CreateSectionDto) {
    await this.getClassRow(classId);
    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "ClassSection" ("id", "classId", "name", "capacity", "isActive", "updatedAt")
        VALUES (${id}, ${classId}, ${body.name.trim()}, ${body.capacity ?? 30}, ${body.isActive ?? true}, NOW())
      `;
      return this.getSection(id);
    } catch (error: any) {
      if (error?.meta?.code === "23505" || error?.code === "P2010") throw new ConflictException("This section already exists in the class");
      throw error;
    }
  }

  async updateSection(id: string, body: UpdateSectionDto) {
    const current = await this.getSection(id);
    await this.prisma.$executeRaw`
      UPDATE "ClassSection" SET
        "name" = ${body.name?.trim() ?? current.name},
        "capacity" = ${body.capacity ?? current.capacity},
        "isActive" = ${body.isActive ?? current.isActive}, "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
    return this.getSection(id);
  }

  async deleteSection(id: string) {
    await this.getSection(id);
    await this.prisma.$executeRaw`DELETE FROM "ClassSection" WHERE "id" = ${id}`;
    return { success: true };
  }

  async assignCourse(sectionId: string, body: AssignClassCourseDto) {
    await this.getSection(sectionId);
    await this.validateCourseAndTeacher(body.courseId, body.teacherId);
    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "SectionCourseAssignment" ("id", "sectionId", "courseId", "teacherId", "isActive", "updatedAt")
        VALUES (${id}, ${sectionId}, ${body.courseId}, ${body.teacherId}, ${body.isActive ?? true}, NOW())
      `;
      return this.getCourseAssignment(id);
    } catch (error: any) {
      if (error?.meta?.code === "23505") throw new ConflictException("This course is already assigned to the class");
      throw error;
    }
  }

  async updateCourseAssignment(id: string, body: UpdateClassCourseDto) {
    const current = await this.getCourseAssignment(id);
    const teacherId = body.teacherId ?? current.teacherId;
    await this.validateCourseAndTeacher(current.courseId, teacherId);
    await this.prisma.$executeRaw`
      UPDATE "SectionCourseAssignment" SET "teacherId" = ${teacherId},
        "isActive" = ${body.isActive ?? current.isActive}, "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
    return this.getCourseAssignment(id);
  }

  async removeCourseAssignment(id: string) {
    await this.getCourseAssignment(id);
    await this.prisma.$executeRaw`DELETE FROM "SectionCourseAssignment" WHERE "id" = ${id}`;
    return { success: true };
  }

  private async getClass(id: string) {
    const item = await this.getClassRow(id);
    const sections = await this.prisma.$queryRaw<SectionRow[]>`SELECT * FROM "ClassSection" WHERE "classId" = ${id} ORDER BY "name" ASC`;
    const assignments = await this.getCourseAssignments();
    return { ...item, sections: sections.map((section) => ({ ...section, courseAssignments: assignments.filter((assignment) => assignment.sectionId === section.id) })) };
  }

  private async getClassRow(id: string) {
    const rows = await this.prisma.$queryRaw<ClassRow[]>`SELECT * FROM "AcademicClass" WHERE "id" = ${id} LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Class not found");
    return rows[0];
  }

  private async getSection(id: string) {
    const rows = await this.prisma.$queryRaw<SectionRow[]>`SELECT * FROM "ClassSection" WHERE "id" = ${id} LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("Section not found");
    return rows[0];
  }

  private getCourseAssignments() {
    return this.prisma.$queryRaw<CourseAssignmentRow[]>`
      SELECT assignment.*, course."title" AS "courseTitle", course."code" AS "courseCode",
        teacher."name" AS "teacherName", teacher."email" AS "teacherEmail"
      FROM "SectionCourseAssignment" assignment
      JOIN "Course" course ON course."id" = assignment."courseId"
      JOIN "User" teacher ON teacher."id" = assignment."teacherId"
      ORDER BY course."title" ASC
    `;
  }

  private async getCourseAssignment(id: string) {
    const rows = await this.prisma.$queryRaw<CourseAssignmentRow[]>`
      SELECT assignment.*, course."title" AS "courseTitle", course."code" AS "courseCode",
        teacher."name" AS "teacherName", teacher."email" AS "teacherEmail"
      FROM "SectionCourseAssignment" assignment
      JOIN "Course" course ON course."id" = assignment."courseId"
      JOIN "User" teacher ON teacher."id" = assignment."teacherId"
      WHERE assignment."id" = ${id} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException("Class course assignment not found");
    return rows[0];
  }

  async getTeacherAssignments(teacherId: string) {
    const teachers = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${teacherId} AND "role" = 'TEACHER'::"UserRole" AND "isActive" = true LIMIT 1
    `;
    if (!teachers[0]) throw new NotFoundException("Active teacher not found");
    return this.listAssignmentsForTeacher(teacherId);
  }

  private listAssignmentsForTeacher(teacherId: string) {
    return this.prisma.$queryRaw<CourseAssignmentRow[]>`
      SELECT assignment.*, course."title" AS "courseTitle", course."code" AS "courseCode",
        teacher."name" AS "teacherName", teacher."email" AS "teacherEmail",
        class."name" AS "className", class."code" AS "classCode", section."name" AS "sectionName"
      FROM "SectionCourseAssignment" assignment
      JOIN "Course" course ON course."id" = assignment."courseId"
      JOIN "User" teacher ON teacher."id" = assignment."teacherId"
      JOIN "ClassSection" section ON section."id" = assignment."sectionId"
      JOIN "AcademicClass" class ON class."id" = section."classId"
      WHERE assignment."teacherId" = ${teacherId} AND assignment."isActive" = true
      ORDER BY class."name" ASC, section."name" ASC, course."title" ASC
    `;
  }

  async ensureStarterAssignments(teacherId: string) {
    const teachers = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${teacherId} AND "role" = 'TEACHER'::"UserRole" AND "isActive" = true LIMIT 1
    `;
    if (!teachers[0]) throw new NotFoundException("Active teacher not found");

    const existing = await this.listAssignmentsForTeacher(teacherId);
    if (existing.length >= STARTER_ASSIGNMENT_COUNT) {
      return { assignments: existing, created: 0, alreadyAssigned: true };
    }

    const need = STARTER_ASSIGNMENT_COUNT - existing.length;
    const usedCourseIds = new Set(existing.map((assignment) => assignment.courseId));

    const sections = await this.prisma.$queryRaw<
      { id: string; classId: string; name: string; className: string }[]
    >`
      SELECT section."id", section."classId", section."name",
        class."name" AS "className"
      FROM "ClassSection" section
      JOIN "AcademicClass" class ON class."id" = section."classId"
      WHERE section."isActive" = true AND class."isActive" = true
      ORDER BY class."name" ASC, section."name" ASC
    `;

    const courses = await this.prisma.$queryRaw<{ id: string; title: string }[]>`
      SELECT "id", "title" FROM "Course" WHERE "isPublished" = true ORDER BY "sortOrder" ASC, "title" ASC
    `;

    const created = [];
    for (const section of sections) {
      if (created.length >= need) break;
      const course = courses.find(
        (item) =>
          !usedCourseIds.has(item.id) &&
          !existing.some(
            (assignment) => assignment.sectionId === section.id && assignment.courseId === item.id,
          ),
      );
      if (!course) continue;

      const id = randomUUID();
      try {
        await this.prisma.$executeRaw`
          INSERT INTO "SectionCourseAssignment" ("id", "sectionId", "courseId", "teacherId", "isActive", "updatedAt")
          VALUES (${id}, ${section.id}, ${course.id}, ${teacherId}, true, NOW())
        `;
        usedCourseIds.add(course.id);
        created.push({ section, course });
      } catch (error: any) {
        if (error?.meta?.code === "23505") continue;
        throw error;
      }
    }

    return {
      assignments: await this.listAssignmentsForTeacher(teacherId),
      created: created.length,
      alreadyAssigned: existing.length > 0,
    };
  }

  private async validateCourseAndTeacher(courseId: string, teacherId: string) {
    const courses = await this.prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Course" WHERE "id" = ${courseId} LIMIT 1`;
    if (!courses[0]) throw new NotFoundException("Course not found");
    const teachers = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${teacherId} AND "role" = 'TEACHER'::"UserRole" AND "isActive" = true LIMIT 1
    `;
    if (!teachers[0]) throw new NotFoundException("Active teacher not found");
  }
}
