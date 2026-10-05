import { Controller, Get } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Roles("ADMIN")
  @Get("admin")
  getAdminStats() {
    return this.statsService.getAdminStats();
  }

  @Roles("TEACHER", "ADMIN")
  @Get("teacher")
  getTeacherStats() {
    return this.statsService.getTeacherStats();
  }
}
