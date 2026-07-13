import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsEnum } from "class-validator";
import { UserRole } from "@prisma/client";

export class CreateCourseDto {
  @IsString()
  code: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(UserRole)
  @IsOptional()
  level?: string;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateCourseDto extends CreateCourseDto {}

export class CreateLectureDto {
  @IsString()
  courseId: string;

  @IsString()
  title: string;

  @IsString()
  videoUrl: string;

  @IsString()
  @IsOptional()
  transcript?: string;

  @IsInt()
  @IsOptional()
  durationMinutes?: number;

  @IsBoolean()
  @IsOptional()
  isCheckpointLocked?: boolean;

  @IsString()
  @IsOptional()
  publishedAt?: string;

  @IsInt()
  @IsOptional()
  lectureOrder?: number;

  @IsString()
  @IsOptional()
  videoProvider?: string;
}

export class UpdateLectureDto extends CreateLectureDto {}

export class CreateCheckpointDto {
  @IsString()
  lectureId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsInt()
  timestamp: number;

  @IsString()
  @IsOptional()
  requiredQuizId?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsNumber()
  @IsOptional()
  unlockScore?: number;

  @IsBoolean()
  @IsOptional()
  isBlocking?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class UpdateCheckpointDto extends CreateCheckpointDto {}

export class CreateProgressDto {
  @IsString()
  studentId: string;

  @IsString()
  @IsOptional()
  guardianName?: string;

  @IsString()
  @IsOptional()
  currentCourseId?: string;

  @IsString()
  @IsOptional()
  currentLectureId?: string;

  @IsNumber()
  @IsOptional()
  avgScore?: number;

  @IsOptional()
  weakTopics?: any;

  @IsInt()
  @IsOptional()
  streakDays?: number;

  @IsString()
  @IsOptional()
  lastActivityAt?: string;

  @IsInt()
  @IsOptional()
  completedCheckpoints?: number;

  @IsInt()
  @IsOptional()
  lockedCheckpoints?: number;

  @IsInt()
  @IsOptional()
  progressPercentage?: number;

  @IsInt()
  @IsOptional()
  completedLectures?: number;

  @IsInt()
  @IsOptional()
  failedQuizzes?: number;
}

export class UpdateProgressDto extends CreateProgressDto {}
