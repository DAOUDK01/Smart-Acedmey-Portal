import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PRIORITIES, TASK_TYPES } from "./study-planner.types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_MESSAGE = "must be a date in YYYY-MM-DD format";
const CLOCK_MESSAGE = "must be a time in HH:MM format";

export class StudyTopicDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  courseId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  confidence?: number;
}

/** Fields shared by creating and regenerating a plan. */
class StudyAvailabilityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => StudyTopicDto)
  topics?: StudyTopicDto[];

  @IsOptional()
  @Matches(ISO_DATE, { message: `examDate ${DATE_MESSAGE}` })
  examDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  targetScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  goal?: string;

  /** The student's local date, so "today" matches their calendar. */
  @IsOptional()
  @Matches(ISO_DATE, { message: `today ${DATE_MESSAGE}` })
  today?: string;
}

export class CreateStudyPlanDto extends StudyAvailabilityDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  courseIds: string[];

  @IsInt()
  @Min(15)
  @Max(480)
  dailyMinutes: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDays: number[];

  @Matches(CLOCK, { message: `startTime ${CLOCK_MESSAGE}` })
  startTime: string;

  /** Must be true to archive an existing active plan and replace it. */
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class RegenerateStudyPlanDto extends StudyAvailabilityDto {
  /** Regenerating replaces pending tasks, so the client must confirm explicitly. */
  @Equals(true, { message: "confirm must be true to regenerate a plan" })
  confirm: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  courseIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  dailyMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  studyDays?: number[];

  @IsOptional()
  @Matches(CLOCK, { message: `startTime ${CLOCK_MESSAGE}` })
  startTime?: string;

  /** Explicitly clear the exam date. */
  @IsOptional()
  @IsBoolean()
  clearExamDate?: boolean;
}

export class UpdateStudyPlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  goal?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  targetScore?: number;
}

export class TodayDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: `today ${DATE_MESSAGE}` })
  today?: string;
}

export class SkipTaskDto extends TodayDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RescheduleTaskDto extends TodayDto {
  @Matches(ISO_DATE, { message: `scheduledDate ${DATE_MESSAGE}` })
  scheduledDate: string;

  @IsOptional()
  @Matches(CLOCK, { message: `startTime ${CLOCK_MESSAGE}` })
  startTime?: string;
}

export class CreateStudyTaskDto extends TodayDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  courseId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  topic: string;

  @IsIn(TASK_TYPES as unknown as string[])
  type: (typeof TASK_TYPES)[number];

  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes: number;

  @Matches(ISO_DATE, { message: `scheduledDate ${DATE_MESSAGE}` })
  scheduledDate: string;

  @IsOptional()
  @Matches(CLOCK, { message: `startTime ${CLOCK_MESSAGE}` })
  startTime?: string;

  @IsOptional()
  @IsIn(PRIORITIES as unknown as string[])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lectureId?: string;
}
