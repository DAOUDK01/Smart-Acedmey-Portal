import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class RecordInteractionDto {
  @IsString()
  lectureId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  watchPercent?: number;
}

export class RecommendationQueryDto {
  @IsString()
  @IsOptional()
  resourceId?: string;
}
