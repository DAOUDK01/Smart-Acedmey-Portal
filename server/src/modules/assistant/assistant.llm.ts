import { Injectable } from "@nestjs/common";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { resolveChatModel, resolveChatProvider } from "../tutor/tutor.provider";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export class AssistantLlmError extends Error {
  constructor(
    message: string,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 25_000;

/** The portal's configured chat model (Groq preferred, OpenAI fallback) — the same setup as the AI Tutor. */
@Injectable()
export class AssistantLlm {
  isConfigured(): boolean {
    return resolveChatProvider() !== null;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    const provider = resolveChatProvider();
    if (!provider) throw new AssistantLlmError("No AI provider configured");
    const model =
      provider === "groq"
        ? new ChatGroq({ apiKey: process.env.GROQ_API_KEY, model: resolveChatModel() as string, temperature: 0.5 } as any)
        : new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: resolveChatModel(), temperature: 0.5 });

    const timeoutMs = Number(process.env.ASSISTANT_AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    let response: { content: unknown };
    try {
      response = await model.invoke(messages, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const name = (error as Error)?.name;
      const detail = String((error as Error)?.message ?? "");
      const rateLimited = (error as { status?: number })?.status === 429 || /429|rate limit/i.test(detail);
      throw new AssistantLlmError(
        name === "TimeoutError" || name === "AbortError" ? "AI request timed out" : `AI request failed: ${detail}`,
        rateLimited,
      );
    }
    const content = response.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("")
          : "";
    if (!text.trim()) throw new AssistantLlmError("AI returned an empty reply");
    return text.trim();
  }
}
