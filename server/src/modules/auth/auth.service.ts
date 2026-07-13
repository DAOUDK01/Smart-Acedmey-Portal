import { Injectable, UnauthorizedException, BadRequestException, ConflictException, OnModuleInit } from "@nestjs/common";
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
  PasswordLoginDto,
} from "./auth.dto";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
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
        passwordHash: this.hashPassword(password),
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      create: {
        email,
        name,
        role: "ADMIN",
        passwordHash: this.hashPassword(password),
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  private hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashOtp(otp: string): string {
    return createHash("sha256").update(otp).digest("hex");
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

    if (
      !user?.passwordHash ||
      user.role === "ADMIN" ||
      user.passwordHash !== this.hashPassword(body.password)
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = this.issueTokens(user);

    const { passwordHash: _passwordHash, ...safeUser } = updatedUser;
    return { ...tokens, token: tokens.accessToken, user: safeUser };
  }

  async adminLogin(body: PasswordLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (
      !user?.passwordHash ||
      user.role !== "ADMIN" ||
      user.passwordHash !== this.hashPassword(body.password)
    ) {
      throw new UnauthorizedException("Invalid admin credentials");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = this.issueTokens(user);
    const { passwordHash: _passwordHash, ...safeUser } = updatedUser;
    return { ...tokens, token: tokens.accessToken, user: safeUser };
  }

  async register(body: RegisterDto) {
    if (body.role === "ADMIN") {
      throw new BadRequestException("Admin accounts cannot be registered publicly");
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
        passwordHash: this.hashPassword(body.password),
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

    const tokens = this.issueTokens(user);
    return { ...tokens, token: tokens.accessToken, user };
  }

  async requestLoginOtp(body: RequestLoginOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException("User not found");
    if (user.role === "ADMIN") throw new UnauthorizedException("Use the admin login portal");

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
    if (otpRecord.codeHash !== this.hashOtp(body.otp)) throw new BadRequestException("Invalid OTP");

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

    if (user?.role === "ADMIN") {
      throw new UnauthorizedException("Use the admin login portal");
    }

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

    const tokens = this.issueTokens(user);
    return {
      ...tokens,
      token: tokens.accessToken,
      user,
      role: user.role,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
    };
  }
}
