import { Controller, Get, Query } from "@nestjs/common";
import { GuardianService } from "./guardian.service";

@Controller("guardian")
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Get("dashboard")
  dashboard(@Query("email") email?: string) {
    return this.guardianService.dashboard(email ?? "");
  }
}
