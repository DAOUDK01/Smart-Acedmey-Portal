import { IsArray, IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class RequestAdmissionDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() desiredClassId: string;
  @IsArray() @IsString({ each: true }) selectedCourseIds: string[];
}

export class CompleteAdmissionDto {
  @IsString() token: string;
  @IsString() @MinLength(6) password: string;
  @IsString() phoneNumber: string;
  @IsObject() personalDetails: Record<string, unknown>;
  @IsObject() guardianDetails: Record<string, unknown>;
  @IsObject() educationDetails: Record<string, unknown>;
  @IsArray() @IsOptional() documentLinks?: Record<string, unknown>[];
}

export class ReviewAdmissionDto {
  @IsString() @IsIn(["APPROVED", "REJECTED"]) status: "APPROVED" | "REJECTED";
  @IsOptional() @IsString() adminNotes?: string;
}
