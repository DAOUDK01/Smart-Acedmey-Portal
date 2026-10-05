import { UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";

export type AuthenticatedUser = { userId?: string; role?: string };

/**
 * Student-owned rows (quiz attempts, mock-exam attempts, progress) are keyed by the
 * student's email. Resolve it from the authenticated user so clients cannot act as
 * another student by sending a different identifier.
 */
export async function studentKeyFor(prisma: PrismaService, user?: AuthenticatedUser) {
  if (!user?.userId) throw new UnauthorizedException("Authentication required");
  const record = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { email: true },
  });
  if (!record) throw new UnauthorizedException("Authentication required");
  return record.email;
}
