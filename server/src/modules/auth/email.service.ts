import { Injectable } from "@nestjs/common";

@Injectable()
export class EmailService {
  async sendOtpEmail(to: string, otp: string, purpose: string) {
    console.log(`[EmailService] Sending ${purpose} OTP to ${to}: ${otp}`);
    // In production, integrate with Resend or nodemailer here
  }
}
