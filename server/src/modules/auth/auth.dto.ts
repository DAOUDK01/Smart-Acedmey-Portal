import { IsEmail, IsString, IsEnum, IsOptional } from "class-validator";
import { UserRole } from "@prisma/client";

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;
}

export class RequestLoginOtpDto {
  @IsEmail()
  email: string;
}

export class PasswordLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class VerifyLoginOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;

  @IsString()
  newPassword: string;
}

export class GoogleSigninDto {
  @IsString()
  idToken: string;
}
