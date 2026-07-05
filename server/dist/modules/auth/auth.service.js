"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma.service");
const jwt_1 = require("@nestjs/jwt");
const email_service_1 = require("./email.service");
const crypto_1 = require("crypto");
const google_auth_library_1 = require("google-auth-library");
let AuthService = class AuthService {
    prisma;
    jwtService;
    emailService;
    constructor(prisma, jwtService, emailService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.emailService = emailService;
    }
    hashPassword(password) {
        return (0, crypto_1.createHash)("sha256").update(password).digest("hex");
    }
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    hashOtp(otp) {
        return (0, crypto_1.createHash)("sha256").update(otp).digest("hex");
    }
    async register(body) {
        const existingUser = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (existingUser) {
            throw new common_1.ConflictException("User already exists");
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
    async verifyEmailOtp(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
        const otpRecord = await this.prisma.otpCode.findFirst({
            where: {
                userId: user.id,
                purpose: "EMAIL_VERIFICATION",
                expiresAt: { gt: new Date() },
                consumedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!otpRecord)
            throw new common_1.BadRequestException("Invalid or expired OTP");
        if (otpRecord.codeHash !== this.hashOtp(body.otp))
            throw new common_1.BadRequestException("Invalid OTP");
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
    async requestLoginOtp(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
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
    async verifyLoginOtp(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
        const otpRecord = await this.prisma.otpCode.findFirst({
            where: {
                userId: user.id,
                purpose: "LOGIN_VERIFICATION",
                expiresAt: { gt: new Date() },
                consumedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!otpRecord)
            throw new common_1.BadRequestException("Invalid or expired OTP");
        if (otpRecord.codeHash !== this.hashOtp(body.otp))
            throw new common_1.BadRequestException("Invalid OTP");
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
    async forgotPassword(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
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
    async resetPassword(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new common_1.UnauthorizedException("User not found");
        const otpRecord = await this.prisma.otpCode.findFirst({
            where: {
                userId: user.id,
                purpose: "PASSWORD_RESET",
                expiresAt: { gt: new Date() },
                consumedAt: null,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!otpRecord)
            throw new common_1.BadRequestException("Invalid or expired OTP");
        if (otpRecord.codeHash !== this.hashOtp(body.otp))
            throw new common_1.BadRequestException("Invalid OTP");
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
    async googleSignin(body) {
        const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: body.idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email || !payload.email_verified) {
            throw new common_1.UnauthorizedException("Invalid Google ID token");
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
        }
        else {
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        email_service_1.EmailService])
], AuthService);
