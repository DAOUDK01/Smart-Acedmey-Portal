import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  VerifyEmailOtpDto,
  RequestLoginOtpDto,
  VerifyLoginOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  GoogleSigninDto,
} from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post("verify-email-otp")
  async verifyEmailOtp(@Body() body: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(body);
  }

  @Post("login/request-otp")
  async requestLoginOtp(@Body() body: RequestLoginOtpDto) {
    return this.authService.requestLoginOtp(body);
  }

  @Post("login/verify-otp")
  async verifyLoginOtp(@Body() body: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(body);
  }

  @Post("password/forgot")
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post("password/reset")
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Post("google/signin")
  async googleSignin(@Body() body: GoogleSigninDto) {
    return this.authService.googleSignin(body);
  }
}
