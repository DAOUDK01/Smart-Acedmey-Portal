import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { Public } from "../auth/public.decorator";
import { SystemService } from "./system.service";

type AuthenticatedRequest = Request & {
  user?: { userId?: string; role?: string };
};

@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get("maintenance")
  getMaintenance() {
    return this.systemService.getMaintenanceInfo();
  }

  @Post("admin/maintenance")
  async setMaintenance(
    @Req() req: AuthenticatedRequest,
    @Body() body: { enabled?: boolean; message?: string },
  ) {
    if (req.user?.role !== "ADMIN") {
      throw new ForbiddenException("Admin access required");
    }
    const enabled = Boolean(body.enabled);
    return this.systemService.setMaintenance(enabled, body.message);
  }
}