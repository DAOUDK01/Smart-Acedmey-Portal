import { Body, Controller, Get, Patch, Post, Request } from "@nestjs/common";
import { ChangePasswordDto, UpdateMeDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller("me")
export class MeController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getProfile(@Request() req: { user: { userId: string } }) {
    return this.userService.getCurrentUser(req.user.userId);
  }

  @Patch()
  updateProfile(
    @Request() req: { user: { userId: string } },
    @Body() body: UpdateMeDto,
  ) {
    return this.userService.updateCurrentUser(req.user.userId, body);
  }

  @Post("change-password")
  changePassword(
    @Request() req: { user: { userId: string } },
    @Body() body: ChangePasswordDto,
  ) {
    return this.userService.changePassword(req.user.userId, body);
  }
}