import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { CreateUserDto, UpdateUserDto } from "./user.dto";
import { createHash } from "crypto";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  listUsers() {
    return this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  getUser(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(body: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictException("User already exists");

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

  getUserByEmail(email: string) {
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

  async updateUser(id: string, body: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id },
      data: body as any,
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.delete({ where: { id } });
  }
}
