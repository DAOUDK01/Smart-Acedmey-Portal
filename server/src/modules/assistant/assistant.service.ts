import { ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { AssistantContextService } from "./assistant.context";
import { AssistantChatDto } from "./assistant.dto";
import { ROLE_GUIDES, isAssistantRole } from "./assistant.guide";
import { AssistantLlm, AssistantLlmError, LlmMessage } from "./assistant.llm";
import { ASSISTANT_NAME, buildSystemPrompt } from "./assistant.prompts";

const MAX_HISTORY = 10;
const MAX_HISTORY_CHARS = 2000;

type RequestUser = { userId?: string; role?: string } | undefined;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly context: AssistantContextService,
    private readonly llm: AssistantLlm,
  ) {}

  /** The role always comes from the verified token, never from the request body. */
  private resolve(user: RequestUser) {
    if (!user?.userId) throw new UnauthorizedException("Authentication required");
    if (!isAssistantRole(user.role)) throw new ForbiddenException("The assistant isn't available for this account");
    return { userId: user.userId, role: user.role };
  }

  async profile(user: RequestUser) {
    const { userId, role } = this.resolve(user);
    const name = await this.context.firstName(userId);
    const guide = ROLE_GUIDES[role];
    return {
      assistantName: ASSISTANT_NAME,
      name,
      role,
      portal: guide.portal,
      aiAvailable: this.llm.isConfigured(),
      suggestions: guide.suggestions,
      quickActions: guide.quickActions,
    };
  }

  async chat(user: RequestUser, dto: AssistantChatDto) {
    const { userId, role } = this.resolve(user);
    if (!this.llm.isConfigured()) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "AI_UNCONFIGURED",
        message:
          role === "ADMIN"
            ? "I'm not connected to an AI model yet. Set GROQ_API_KEY or OPENAI_API_KEY on the server to switch me on."
            : "I'm not connected to an AI model yet. Please ask your administrator to set it up.",
      });
    }

    const guide = ROLE_GUIDES[role];
    const currentTab = dto.tab && guide.features.some((f) => f.tab === dto.tab) ? dto.tab : null;
    const { name, data } = await this.context.build({ userId, role });

    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt({ role, name, data, currentTab }) },
      ...(dto.history ?? [])
        .filter((entry) => entry.content.trim())
        .slice(-MAX_HISTORY)
        .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_HISTORY_CHARS) })),
      { role: "user", content: dto.message.trim() },
    ];

    try {
      const reply = await this.llm.complete(messages);
      return { reply, usedPortalData: data !== null };
    } catch (error) {
      this.logger.warn(`Assistant reply failed for ${role}: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "AI_FAILED",
        message:
          error instanceof AssistantLlmError && error.rateLimited
            ? "Lots of questions are coming in right now — please try again in a few seconds."
            : "I couldn't reach my AI brain just now. Please try again in a moment.",
      });
    }
  }
}
