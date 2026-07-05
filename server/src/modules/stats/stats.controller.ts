import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("admin")
  getAdminStats() {
    return this.statsService.getAdminStats();
  }

  @Get("teacher")
  getTeacherStats() {
    return this.statsService.getTeacherStats();
  }

  @Get("expert")
  getExpertStats() {
    return this.statsService.getExpertStats();
  }
}
