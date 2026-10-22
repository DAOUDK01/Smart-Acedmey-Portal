import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "../auth/identity";
import { Roles } from "../auth/roles.decorator";
import {
  CreateStudyPlanDto,
  CreateStudyTaskDto,
  RegenerateStudyPlanDto,
  RescheduleTaskDto,
  SkipTaskDto,
  TodayDto,
  UpdateStudyPlanDto,
} from "./study-planner.dto";
import { StudyPlannerService } from "./study-planner.service";

type AuthRequest = { user?: AuthenticatedUser };

/** Every route is scoped to the authenticated student; plan and task ids are always checked against them. */
@Roles("STUDENT")
@Controller("student/study-plans")
export class StudyPlannerController {
  constructor(private readonly planner: StudyPlannerService) {}

  @Get("context")
  getContext(@Req() req: AuthRequest, @Query() query: TodayDto) {
    return this.planner.getPlannerContext(req.user!.userId!, query.today);
  }

  @Get()
  listPlans(@Req() req: AuthRequest) {
    return this.planner.listPlans(req.user!.userId!);
  }

  @Get("active")
  getActivePlan(@Req() req: AuthRequest, @Query() query: TodayDto) {
    return this.planner.getActivePlan(req.user!.userId!, query.today);
  }

  @Get(":id")
  getPlan(@Req() req: AuthRequest, @Param("id") id: string, @Query() query: TodayDto) {
    return this.planner.getPlanDetail(req.user!.userId!, id, this.planner.resolveToday(query.today));
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  createPlan(@Req() req: AuthRequest, @Body() body: CreateStudyPlanDto) {
    return this.planner.createPlan(req.user!.userId!, body);
  }

  @Patch(":id")
  updatePlan(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: UpdateStudyPlanDto) {
    return this.planner.updatePlan(req.user!.userId!, id, body);
  }

  @Delete(":id")
  deletePlan(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.planner.deletePlan(req.user!.userId!, id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(":id/regenerate")
  regeneratePlan(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: RegenerateStudyPlanDto) {
    return this.planner.regeneratePlan(req.user!.userId!, id, body);
  }

  @Post(":id/reschedule-missed")
  rescheduleMissed(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: TodayDto) {
    return this.planner.rescheduleMissed(req.user!.userId!, id, body.today);
  }

  @Post(":id/tasks")
  addTask(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: CreateStudyTaskDto) {
    return this.planner.addTask(req.user!.userId!, id, body);
  }

  @Post(":id/tasks/:taskId/complete")
  completeTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: TodayDto,
  ) {
    return this.planner.completeTask(req.user!.userId!, id, taskId, body.today);
  }

  @Post(":id/tasks/:taskId/reopen")
  reopenTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: TodayDto,
  ) {
    return this.planner.reopenTask(req.user!.userId!, id, taskId, body.today);
  }

  @Post(":id/tasks/:taskId/skip")
  skipTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: SkipTaskDto,
  ) {
    return this.planner.skipTask(req.user!.userId!, id, taskId, body.reason, body.today);
  }

  @Patch(":id/tasks/:taskId/schedule")
  rescheduleTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() body: RescheduleTaskDto,
  ) {
    return this.planner.rescheduleTask(req.user!.userId!, id, taskId, body);
  }

  @Delete(":id/tasks/:taskId")
  deleteTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Query() query: TodayDto,
  ) {
    return this.planner.deleteTask(req.user!.userId!, id, taskId, query.today);
  }
}
