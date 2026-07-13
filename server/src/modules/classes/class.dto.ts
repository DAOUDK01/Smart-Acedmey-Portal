import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class CreateClassDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  academicYear: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClassDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() @IsString() @MinLength(1) academicYear?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateSectionDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsString() classTeacherId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;
}

export class UpdateSectionDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsString() classTeacherId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) capacity?: number;
}
