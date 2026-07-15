import { Controller, Get } from "@nestjs/common";
import { Public } from "./modules/auth/public.decorator";

@Public()
@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: "SmartAcademy API",
      status: "ok",
    };
  }

  @Get("health")
  health() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
