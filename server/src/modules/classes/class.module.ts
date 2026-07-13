import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { ClassController } from "./class.controller";
import { ClassService } from "./class.service";

@Module({ controllers: [ClassController], providers: [ClassService, PrismaService] })
export class ClassesModule {}
