import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma.service";
import { CreateClassDto, CreateSectionDto, UpdateClassDto, UpdateSectionDto } from "./class.dto";

type ClassRow = {
  id: string; name: string; code: string; academicYear: string; description: string | null;
  isActive: boolean; createdAt: Date; updatedAt: Date;
};
type SectionRow = {
  id: string; classId: string; name: string; room: string | null; capacity: number;
  classTeacherId: string | null; isActive: boolean; createdAt: Date; updatedAt: Date;
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
    return classes.map((item) => ({ ...item, sections: sections.filter((section) => section.classId === item.id) }));
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
        INSERT INTO "ClassSection" ("id", "classId", "name", "room", "capacity", "classTeacherId", "isActive", "updatedAt")
        VALUES (${id}, ${classId}, ${body.name.trim()}, ${body.room?.trim() || null}, ${body.capacity ?? 30}, ${body.classTeacherId?.trim() || null}, ${body.isActive ?? true}, NOW())
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
        "room" = ${body.room !== undefined ? body.room.trim() || null : current.room},
        "capacity" = ${body.capacity ?? current.capacity},
        "classTeacherId" = ${body.classTeacherId !== undefined ? body.classTeacherId.trim() || null : current.classTeacherId},
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

  private async getClass(id: string) {
    const item = await this.getClassRow(id);
    const sections = await this.prisma.$queryRaw<SectionRow[]>`SELECT * FROM "ClassSection" WHERE "classId" = ${id} ORDER BY "name" ASC`;
    return { ...item, sections };
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
}
