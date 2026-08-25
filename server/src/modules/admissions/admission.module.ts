import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";
import { SystemService } from "../system/system.service";
import { R2StorageService } from "../storage/r2-storage.service";
import { GuardianModule } from "../guardian/guardian.module";
import { AdmissionController, AdminAdmissionController } from "./admission.controller";
import { AdmissionService } from "./admission.service";

@Module({imports:[GuardianModule],controllers:[AdmissionController,AdminAdmissionController],providers:[AdmissionService,PrismaService,EmailService,R2StorageService,SystemService]})
export class AdmissionModule {}
