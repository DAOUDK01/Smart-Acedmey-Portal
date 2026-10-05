import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export type EmailResult = { sent: boolean; reason?: string };

/** Thrown when delivery fails. `reason` is safe to show to an administrator. */
export class EmailDeliveryError extends ServiceUnavailableException {
  constructor(public readonly reason: string) {
    super("We could not send the email right now. Please try again shortly.");
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

/** Public web address used in links inside emails (FRONTEND_URL, or the first FRONTEND_URLS entry). */
export function frontendBaseUrl(): string {
  const configured =
    process.env.FRONTEND_URL?.trim() || process.env.FRONTEND_URLS?.split(",")[0]?.trim() || "";
  return configured.replace(/\/+$/, "");
}

function htmlToText(html: string) {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_match, href: string, label: string) => (label === href ? href : `${label} (${href})`))
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  // Provided by several Nest modules, so there are several instances; report once.
  private static startupChecked = false;

  /** Reports misconfiguration at startup instead of the first time someone signs up. */
  async onModuleInit() {
    if (EmailService.startupChecked) return;
    EmailService.startupChecked = true;
    let transporter: nodemailer.Transporter;
    try {
      transporter = this.getTransporter();
    } catch (error) {
      this.logger.warn(
        `Email is NOT configured, so no emails will be sent (${error instanceof Error ? error.message : "unknown error"}).`,
      );
      return;
    }
    // Not awaited: a slow mail server must never delay startup.
    transporter
      .verify()
      .then(() => this.logger.log(`Email ready: connected to ${process.env.SMTP_HOST} as ${process.env.SMTP_USER}.`))
      .catch((error) =>
        this.logger.error(`Email is configured but the mail server check FAILED: ${this.describeFailure(error)} (${error?.message ?? error})`),
      );
  }

  private getTransporter() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : port === 465;

    const missing = [
      !host && "SMTP_HOST",
      !user && "SMTP_USER",
      !pass && "SMTP_PASS",
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(`Missing email configuration: ${missing.join(", ")}`);
    }

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error("SMTP_PORT must be a valid port number");
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      requireTLS: !secure,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  /** Short, administrator-safe explanation of a delivery failure (no credentials or hostnames). */
  describeFailure(error: unknown): string {
    const err = error as { code?: string; responseCode?: number; message?: string };
    if (err?.message?.startsWith("Missing email configuration")) return "Email is not configured on the server";
    if (err?.message?.includes("SMTP_PORT")) return "Email is not configured correctly on the server";
    if (err?.code === "EAUTH" || err?.responseCode === 535) return "The mail server rejected the sign-in (check the SMTP username and app password)";
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ENOTFOUND", "EDNS"].includes(err?.code ?? "")) return "The mail server could not be reached";
    if (err?.code === "EENVELOPE" || (err?.responseCode && err.responseCode >= 550 && err.responseCode < 560)) return "The recipient address was rejected by the mail server";
    if (err?.responseCode === 421 || err?.responseCode === 450 || err?.responseCode === 452) return "The mail server is temporarily limiting sending (try again later)";
    return "Email delivery failed";
  }

  /** Sends or throws. Use for flows where the user must know it failed (e.g. one-time codes). */
  async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      const transporter = this.getTransporter();
      const fromAddress = process.env.FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim();
      const fromName = process.env.FROM_NAME?.trim() || "SmartAcademy Portal";
      const info = await transporter.sendMail({
        from: { name: fromName, address: fromAddress! },
        replyTo: process.env.REPLY_TO_EMAIL?.trim() || fromAddress,
        to,
        subject,
        html,
        text: text ?? htmlToText(html),
      });

      this.logger.log(`Email accepted for ${to}; subject="${subject}"; messageId=${info.messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP error";
      const smtpError = error as { code?: string; command?: string; responseCode?: number };
      this.logger.error(
        `Email delivery failed for ${to}; subject="${subject}": ${message}` +
          ` code=${smtpError.code || "unknown"}` +
          ` command=${smtpError.command || "unknown"}` +
          ` responseCode=${smtpError.responseCode || "unknown"}`,
      );
      // Details stay in the server log; callers get a reason that is safe to show an admin.
      throw new EmailDeliveryError(this.describeFailure(error));
    }
  }

  /**
   * Best-effort send for notifications that must never break the action that triggered
   * them (an approval is still an approval if the confirmation email bounces).
   */
  async trySend(to: string, subject: string, html: string, text?: string): Promise<EmailResult> {
    try {
      await this.sendEmail(to, subject, html, text);
      return { sent: true };
    } catch (error) {
      return { sent: false, reason: error instanceof EmailDeliveryError ? error.reason : "Email delivery failed" };
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose: string) {
    await this.sendEmail(
      to,
      `SmartAcademy ${purpose} code`,
      `<p>Your ${escapeHtml(purpose)} OTP is <strong>${escapeHtml(otp)}</strong>.</p><p>This code will expire soon.</p>`,
      `Your ${purpose} OTP is ${otp}.`,
    );
  }
}
