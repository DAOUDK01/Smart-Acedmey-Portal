import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";
import { R2StorageService } from "../storage/r2-storage.service";
import { AdmissionController, AdminAdmissionController } from "./admission.controller";
import { AdmissionService } from "./admission.service";

@Module({controllers:[AdmissionController,AdminAdmissionController],providers:[AdmissionService,PrismaService,EmailService,R2StorageService]})
export class AdmissionModule {}
