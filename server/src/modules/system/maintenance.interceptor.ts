import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";
import { SystemService } from "./system.service";

type AuthenticatedRequest = Request & {
  user?: { userId?: string; role?: string };
};

@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly systemService: SystemService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return next.handle();
    }

    const { enabled, message } = await this.systemService.getMaintenanceInfo();
    if (!enabled) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role === "ADMIN") {
      return next.handle();
    }

    throw new ServiceUnavailableException({
      statusCode: 503,
      error: "Service Unavailable",
      message,
      maintenance: true,
    });
  }
}