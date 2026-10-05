import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { AppRole, ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, targets);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: { role?: string } }>().user;
    if (!user?.role || !roles.includes(user.role as AppRole)) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }
    return true;
  }
}
