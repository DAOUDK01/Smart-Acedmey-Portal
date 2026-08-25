import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import {
  RecordInteractionDto,
  RecommendationQueryDto,
} from "./recommendations.dto";
import { RecommendationsService } from "./recommendations.service";
import { JwtPayload } from "./recommendations.types";

function requireRole(user: JwtPayload, allowedRoles: string[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException(
      "You do not have permission to use the recommendation service",
    );
  }
  return user;
}

@Controller("student/recommendations")
export class StudentRecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  async getRecommendation(
    @Query() query: RecommendationQueryDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const user = requireRole(req.user!, ["STUDENT"]);
    const resourceId =
      query.resourceId ??
      (await this.recommendationsService.currentResourceFor(user.userId));
    if (!resourceId) {
      return {
        userId: user.userId,
        currentResource: null,
        recommendation: null,
        rewatchProbability: 0,
        recommendedResource: null,
        recommendedLecture: null,
        alternatives: [],
        alternativeLectures: [],
      };
    }
    return this.recommendationsService.getRecommendationForUser(
      user.userId,
      resourceId,
    );
  }

  @Post("interact")
  async recordInteractionAndRecommend(
    @Body() body: RecordInteractionDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const user = requireRole(req.user!, ["STUDENT"]);
    await this.recommendationsService.recordInteraction(
      user.userId,
      body.lectureId,
      body.watchPercent,
    );
    return this.recommendationsService.getRecommendationForUser(
      user.userId,
      body.lectureId,
    );
  }
}

@Controller("recommendations")
export class RecommendationsAdminController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post("rebuild")
  async rebuild(@Req() req: Request & { user?: JwtPayload }) {
    requireRole(req.user!, ["ADMIN"]);
    await this.recommendationsService.rebuildTransitions();
    return {
      message: "Resource transitions rebuilt successfully",
    };
  }
}