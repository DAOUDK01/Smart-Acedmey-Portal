import { IsString, IsOptional, IsInt, IsArray, IsEnum, IsBoolean } from "class-validator";
import { QuizStatus } from "@prisma/client";

export class CreateQuizQuestionDto {
  @IsString()
  lectureId?: string;

  @IsString()
  sourceTopic?: string;

  @IsString()
  sourceTranscript?: string;

  @IsString()
  question: string;

  @IsArray()
  options: string[];

  @IsString()
  correctAnswer: string;

  @IsString()
  difficulty: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @IsString()
  @IsOptional()
  reviewedBy?: string;

  @IsString()
  @IsOptional()
  reviewComment?: string;

  @IsString()
  @IsOptional()
  aiPrompt?: string;
}

export class UpdateQuizQuestionDto {
  @IsString()
  @IsOptional()
  lectureId?: string;

  @IsString()
  @IsOptional()
  sourceTopic?: string;

  @IsString()
  @IsOptional()
  sourceTranscript?: string;

  @IsString()
  @IsOptional()
  question?: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsString()
  @IsOptional()
  correctAnswer?: string;

  @IsString()
  @IsOptional()
  difficulty?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsEnum(QuizStatus)
  @IsOptional()
  status?: QuizStatus;

  @IsString()
  @IsOptional()
  reviewedBy?: string;

  @IsString()
  @IsOptional()
  reviewComment?: string;

  @IsString()
  @IsOptional()
  aiPrompt?: string;

  @IsInt()
  @IsOptional()
  timestamp?: number;
}

export class CreateQuizAttemptDto {
  @IsString()
  studentId: string;

  @IsString()
  quizId: string;

  @IsInt()
  score: number;

  @IsInt()
  responseTime: number;

  @IsBoolean()
  @IsOptional()
  passed?: boolean;
}
