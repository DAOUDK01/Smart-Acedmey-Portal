import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateMockExamDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsInt()
  @IsOptional()
  durationSeconds?: number;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  questionIds?: string[];
}

export class UpdateMockExamDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsInt()
  @IsOptional()
  durationSeconds?: number;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  questionIds?: string[];
}

export class AddMockExamQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  questionIds: string[];
}

export class SubmitMockExamDto {
  /** Selected option per question id. The server grades these; clients never report a score. */
  @IsObject()
  answers: Record<string, string>;
}