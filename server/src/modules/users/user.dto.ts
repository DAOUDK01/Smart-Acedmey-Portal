import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { UserRole } from "@prisma/client";

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class InviteStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsEnum(UserRole)
  role: UserRole;
}

export class CompleteStaffRegistrationDto {
  @IsString()
  token: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  educationDetails: string;

  @IsString()
  personalDetails: string;

  @IsArray()
  @IsOptional()
  documentLinks?: string[];
}

export class ReviewStaffInvitationDto {
  @IsString()
  status: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

  @IsString()
  @IsOptional()
  adminNotes?: string;
}
