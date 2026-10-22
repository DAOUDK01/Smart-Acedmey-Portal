import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";

export class AssistantHistoryMessageDto {
  @IsIn(["user", "assistant"])
  role: "user" | "assistant";

  @IsString()
  @MaxLength(4000)
  content: string;
}

export class AssistantChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantHistoryMessageDto)
  history?: AssistantHistoryMessageDto[];

  /** The portal tab the user is on; only used as a hint and checked against their own portal. */
  @IsOptional()
  @Matches(/^[a-z-]{1,40}$/)
  tab?: string;
}
