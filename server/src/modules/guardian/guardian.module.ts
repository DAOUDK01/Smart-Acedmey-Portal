import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";
import { GuardianController } from "./guardian.controller";
import { GuardianService } from "./guardian.service";

@Module({
  controllers: [GuardianController],
  providers: [GuardianService, PrismaService, EmailService],
  exports: [GuardianService],
})
export class GuardianModule {}