import { Controller, Get, Query, Req } from "@nestjs/common";
import { AuthenticatedUser, studentKeyFor } from "../auth/identity";
import { PrismaService } from "../../prisma.service";
import { Roles } from "../auth/roles.decorator";
import { GuardianService } from "./guardian.service";

@Roles("GUARDIAN", "ADMIN")
@Controller("guardian")
export class GuardianController {
  constructor(
    private readonly guardianService: GuardianService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("dashboard")
  async dashboard(@Query("email") email: string | undefined, @Req() req: { user?: AuthenticatedUser }) {
    // Guardians only ever see their own dashboard; admins may look one up by email.
    const target = req.user?.role === "ADMIN" ? email ?? "" : await studentKeyFor(this.prisma, req.user);
    return this.guardianService.dashboard(target);
  }
}
