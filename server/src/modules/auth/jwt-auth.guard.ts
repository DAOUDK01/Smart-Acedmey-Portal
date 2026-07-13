import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException("Authentication required");
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ tokenType?: string }>(token);
      if (payload.tokenType !== "access") {
        throw new UnauthorizedException("Invalid access token");
      }
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
