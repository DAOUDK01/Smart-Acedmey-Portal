import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaService } from "../../prisma.service";
import { SystemService } from "./system.service";
import { SystemController } from "./system.controller";
import { MaintenanceInterceptor } from "./maintenance.interceptor";

@Module({
  controllers: [SystemController],
  providers: [
    SystemService,
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: MaintenanceInterceptor },
  ],
  exports: [SystemService],
})
export class SystemModule {}