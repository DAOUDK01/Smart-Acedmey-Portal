import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { createHash } from "crypto";

/**
 * Counts requests per client IP *and* per account, so one student mistyping a password
 * cannot lock out a whole classroom that shares a school network address.
 *
 * Credential routes carry an email (login, OTP, reset) or a refresh token; other
 * routes fall back to the IP alone.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = (req.ips?.length ? req.ips[0] : req.ip) ?? "unknown";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email) return `${ip}|${email}`;

    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (refreshToken) {
      return `${ip}|${createHash("sha256").update(refreshToken).digest("hex").slice(0, 16)}`;
    }
    return ip;
  }
}
