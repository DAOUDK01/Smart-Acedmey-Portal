import { BadRequestException, Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private getTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");

    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      requireTLS: port === 587,
    });
  }

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    const transporter = this.getTransporter();

    if (!transporter) {
      console.log(`[EmailService] SMTP not configured. Email to ${to}: ${subject}`);
      return;
    }

    try {
      await transporter.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to,
        subject,
        html,
        text,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP error";
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
