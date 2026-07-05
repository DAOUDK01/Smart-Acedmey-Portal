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
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma.service");
const crypto_1 = require("crypto");
let UserService = class UserService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    hashPassword(password) {
        return (0, crypto_1.createHash)("sha256").update(password).digest("hex");
    }
    listUsers() {
        return this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    }
    getUser(id) {
        return this.prisma.user.findUnique({ where: { id } });
    }
    async createUser(body) {
        const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (existing)
            throw new common_1.ConflictException("User already exists");
        return this.prisma.user.create({
            data: {
                email: body.email,
                name: body.name,
                role: body.role,
                passwordHash: this.hashPassword(body.password),
                phoneNumber: body.phoneNumber,
                avatarUrl: body.avatarUrl,
                isActive: body.role === "ADMIN",
            },
        });
    }
    getUserByEmail(email) {
        return this.prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: {
                id: true,
                role: true,
                name: true,
                email: true,
                isActive: true,
            },
        });
    }
    async updateUser(id, body) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException("User not found");
        return this.prisma.user.update({
            where: { id },
            data: body,
        });
    }
    async deleteUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException("User not found");
        return this.prisma.user.delete({ where: { id } });
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserService);
