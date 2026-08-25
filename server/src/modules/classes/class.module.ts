import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { ClassController, TeacherMeController } from "./class.controller";
import { ClassService } from "./class.service";

@Module({ controllers: [ClassController, TeacherMeController], providers: [ClassService, PrismaService] })
export class ClassesModule {}
