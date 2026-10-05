import { Injectable, UnauthorizedException, BadRequestException, ConflictException, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { JwtService } from "@nestjs/jwt";
import { EmailService } from "./email.service";
import { SystemService } from "../system/system.service";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { hashPassword, verifyPassword } from "./password";
import {
  RegisterDto,
  VerifyEmailOtpDto,
  RequestLoginOtpDto,
  VerifyLoginOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  PasswordLoginDto,
} from "./auth.dto";

const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly systemService: SystemService,
  ) {}

  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD?.trim();
    const name = process.env.ADMIN_NAME?.trim() || "System Administrator";
    if (!email || !password) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured");
    }

    await this.prisma.user.upsert({
      where: { email },
      update: {
        name,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      create: {
        email,
        name,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private hashOtp(otp: string): string {
    const key = process.env.ACCESS_TOKEN_SECRET?.trim() ?? "";
    return createHmac("sha256", key).update(otp).digest("hex");
  }

  /** Verifies an OTP; wrong guesses are counted and the code is burned after too many. */
  private async assertOtp(record: { id: string; codeHash: string; attempts: number }, otp: string) {
    const expected = Buffer.from(record.codeHash);
    const actual = Buffer.from(this.hashOtp(otp));
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return;

    const attempts = record.attempts + 1;
    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts, ...(attempts >= MAX_OTP_ATTEMPTS ? { consumedAt: new Date() } : {}) },
    });
    throw new BadRequestException(
      attempts >= MAX_OTP_ATTEMPTS ? "Too many incorrect attempts. Request a new code." : "Invalid OTP",
    );
  }

  private issueTokens(user: { id: string; role: string }) {
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET?.trim();
    const refreshExpiry = process.env.REFRESH_TOKEN_EXPIRY?.trim();
    if (!refreshSecret || !refreshExpiry) {
      throw new Error("REFRESH_TOKEN_SECRET and REFRESH_TOKEN_EXPIRY must be configured");
    }

    return {
      accessToken: this.jwtService.sign({
        userId: user.id,
        role: user.role,
        tokenType: "access",
      }),
      refreshToken: this.jwtService.sign({
        userId: user.id,
        role: user.role,
        tokenType: "refresh",
      }, {
        secret: refreshSecret,
        expiresIn: refreshExpiry as any,
      }),
    };
  }

  async refresh(refreshToken: string) {
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET?.trim();
    if (!refreshSecret) throw new UnauthorizedException("Refresh token is not configured");

    try {
      const payload = await this.jwtService.verifyAsync<{
        userId: string;
        role: string;
        tokenType: string;
      }>(refreshToken, { secret: refreshSecret });
      if (payload.tokenType !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }
      const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || user.role !== payload.role) {
        throw new UnauthorizedException("Invalid refresh token");
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async login(body: PasswordLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    const check = await verifyPassword(body.password, user?.passwordHash);
    if (!user || !check.valid || user.role === "ADMIN") {
      throw new UnauthorizedException("Invalid email or password");
    }

    const { enabled, message } = await this.systemService.getMaintenanceInfo();
    if (enabled) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        message,
        maintenance: true,
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(check.upgrade ? { passwordHash: check.upgrade } : {}) },
    });
    const tokens = this.issueTokens(user);

    const { passwordHash: _passwordHash, ...safeUser } = updatedUser;
    return { ...tokens, token: tokens.accessToken, user: safeUser };
  }

  async adminLogin(body: PasswordLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    const check = await verifyPassword(body.password, user?.passwordHash);
    if (!user || !check.valid || user.role !== "ADMIN") {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(check.upgrade ? { passwordHash: check.upgrade } : {}) },
    });
    const tokens = this.issueTokens(user);
    const { passwordHash: _passwordHash, ...safeUser } = updatedUser;
    return { ...tokens, token: tokens.accessToken, user: safeUser };
  }

  async register(body: RegisterDto) {
    if (body.role === "ADMIN") {
      throw new BadRequestException("Admin accounts cannot be registered publicly");
    }
    if (body.role === "STUDENT") {
      throw new BadRequestException("Students must submit an admission request before registration");
    }
    const existingUser = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      throw new ConflictException("User already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        isActive: false,
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
    if (!user) throw new BadRequestException("Invalid or expired OTP");

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
    await this.assertOtp(otpRecord, body.otp);

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    const tokens = this.issueTokens(user);
    return { ...tokens, token: tokens.accessToken, user };
  }

  async requestLoginOtp(body: RequestLoginOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    // Same response whether or not the account exists, so this cannot be used to probe for emails.
    if (!user || user.role === "ADMIN") return { message: "OTP sent to email" };

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
    if (!user) throw new BadRequestException("Invalid or expired OTP");
    if (user.role === "ADMIN") throw new UnauthorizedException("Use the admin login portal");

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
    await this.assertOtp(otpRecord, body.otp);

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = this.issueTokens(user);
    return { ...tokens, token: tokens.accessToken, user };
  }

  async forgotPassword(body: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return { message: "OTP sent to email" };

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
    if (!user) throw new BadRequestException("Invalid or expired OTP");

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
    await this.assertOtp(otpRecord, body.otp);

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });

    return { message: "Password reset successfully" };
  }
}
