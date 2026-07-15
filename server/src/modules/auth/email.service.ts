import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

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
        text,
      });

      this.logger.log(`Email accepted for ${to}; messageId=${info.messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP error";
      const smtpError = error as { code?: string; command?: string; responseCode?: number };
      this.logger.error(
        `Email delivery failed for ${to}: ${message}` +
          ` code=${smtpError.code || "unknown"}` +
          ` command=${smtpError.command || "unknown"}` +
          ` responseCode=${smtpError.responseCode || "unknown"}`,
      );
      throw new BadRequestException(`Failed to send email: ${message}`);
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose: string) {
    await this.sendEmail(
      to,
      `SmartAcademy ${purpose} code`,
      `<p>Your ${purpose} OTP is <strong>${otp}</strong>.</p><p>This code will expire soon.</p>`,
      `Your ${purpose} OTP is ${otp}.`,
    );
  }
}
