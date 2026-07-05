import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { JwtService } from "@nestjs/jwt";
import { EmailService } from "./email.service";
import { createHash, randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  RegisterDto,
  VerifyEmailOtpDto,
  RequestLoginOtpDto,
  VerifyLoginOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  GoogleSigninDto,
} from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashOtp(otp: string): string {
    return createHash("sha256").update(otp).digest("hex");
  }

  async register(body: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      throw new ConflictException("User already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: this.hashPassword(body.password),
        isActive: body.role === "ADMIN",
      },
    });

    const otp = this.generateOtp();
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        codeHash: this.hashOtp(otp),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.emailService.sendOtpEmail(user.email, otp, "email verification");
    return { message: "OTP sent to email" };
  }

  async verifyEmailOtp(body: VerifyEmailOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) throw new BadRequestException("Invalid or expired OTP");
    if (otpRecord.codeHash !== this.hashOtp(body.otp)) throw new BadRequestException("Invalid OTP");

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    const token = this.jwtService.sign({ userId: user.id, role: user.role });
    return { token, user };
  }

  async requestLoginOtp(body: RequestLoginOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");

    const otp = this.generateOtp();
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: "LOGIN_VERIFICATION",
        codeHash: this.hashOtp(otp),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.emailService.sendOtpEmail(user.email, otp, "login");
    return { message: "OTP sent to email" };
  }

  async verifyLoginOtp(body: VerifyLoginOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        purpose: "LOGIN_VERIFICATION",
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) throw new BadRequestException("Invalid or expired OTP");
    if (otpRecord.codeHash !== this.hashOtp(body.otp)) throw new BadRequestException("Invalid OTP");

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.jwtService.sign({ userId: user.id, role: user.role });
    return { token, user };
  }

  async forgotPassword(body: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");

    const otp = this.generateOtp();
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        codeHash: this.hashOtp(otp),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await this.emailService.sendOtpEmail(user.email, otp, "password reset");
    return { message: "OTP sent to email" };
  }

  async resetPassword(body: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) throw new BadRequestException("Invalid or expired OTP");
    if (otpRecord.codeHash !== this.hashOtp(body.otp)) throw new BadRequestException("Invalid OTP");

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: this.hashPassword(body.newPassword) },
    });

    return { message: "Password reset successfully" };
  }

  async googleSignin(body: GoogleSigninDto) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: body.idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    let user = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      // Create a new user if they don't exist
      // Default role to STUDENT; frontend can let user choose role later if needed
      user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name || payload.email.split("@")[0],
          role: "STUDENT",
          avatarUrl: payload.picture,
          emailVerifiedAt: new Date(),
          passwordHash: null,
          isActive: false,
        },
      });
    } else {
      // Update last login time for existing user
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const token = this.jwtService.sign({ userId: user.id, role: user.role });
    return {
      accessToken: token,
      token,
      user,
      role: user.role,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
    };
  }
}
