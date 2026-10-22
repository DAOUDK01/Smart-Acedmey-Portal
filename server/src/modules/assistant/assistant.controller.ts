import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "../auth/identity";
import { Roles } from "../auth/roles.decorator";
import { AssistantChatDto } from "./assistant.dto";
import { AssistantService } from "./assistant.service";

@Roles("STUDENT", "TEACHER", "GUARDIAN", "ADMIN")
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get("profile")
  profile(@Req() req: { user?: AuthenticatedUser }) {
    return this.assistant.profile(req.user);
  }

  // Every message can trigger paid LLM usage.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post("chat")
  chat(@Req() req: { user?: AuthenticatedUser }, @Body() body: AssistantChatDto) {
    return this.assistant.chat(req.user, body);
  }
}
