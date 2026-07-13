import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../prisma.service";
import { EmailService } from "./email.service";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET?.trim();
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY?.trim();
if (!accessTokenSecret || !accessTokenExpiry) {
  throw new Error("ACCESS_TOKEN_SECRET and ACCESS_TOKEN_EXPIRY must be configured");
}

@Module({
  imports: [
    JwtModule.register({
      secret: accessTokenSecret,
      signOptions: { expiresIn: accessTokenExpiry as any },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaService,
    EmailService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
