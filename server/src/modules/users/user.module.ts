import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "../auth/email.service";
import { R2StorageService } from "../storage/r2-storage.service";
import { GuardianModule } from "../guardian/guardian.module";

@Module({
  imports: [GuardianModule],
  controllers: [UserController, MeController],
  providers: [UserService, PrismaService, EmailService, R2StorageService],
})
export class UsersModule {}
