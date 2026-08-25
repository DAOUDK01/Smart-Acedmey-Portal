import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";

export const DEFAULT_MAINTENANCE_MESSAGE =
  "The Smart Academy Portal is currently undergoing scheduled maintenance. Please check back soon.";

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getMaintenanceInfo(): Promise<{ enabled: boolean; message: string }> {
    try {
      const [mode, message] = await Promise.all([
        this.prisma.systemSetting.findUnique({ where: { key: "maintenance_mode" } }),
        this.prisma.systemSetting.findUnique({ where: { key: "maintenance_message" } }),
      ]);
      return {
        enabled: mode?.value === "true",
        message: message?.value || DEFAULT_MAINTENANCE_MESSAGE,
      };
    } catch {
      return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE };
    }
  }

  async setMaintenance(enabled: boolean, message?: string): Promise<{ enabled: boolean; message: string }> {
    await this.prisma.systemSetting.upsert({
      where: { key: "maintenance_mode" },
      update: { value: String(enabled) },
      create: { key: "maintenance_mode", value: String(enabled) },
    });
    const normalizedMessage = message?.trim() || DEFAULT_MAINTENANCE_MESSAGE;
    await this.prisma.systemSetting.upsert({
      where: { key: "maintenance_message" },
      update: { value: normalizedMessage },
      create: { key: "maintenance_message", value: normalizedMessage },
    });
    return { enabled, message: normalizedMessage };
  }
}