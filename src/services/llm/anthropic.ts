import Anthropic from "@anthropic-ai/sdk";
import { LLMProvider } from "./provider.js";
import {
  AnalysisResult,
  AnalysisResultSchema,
  PerspectivesResult,
  PerspectivesResultSchema,
} from "./schemas.js";
import {
  SHARED_SYSTEM_PREAMBLE,
  getAnalysisPrompt,
  getPerspectivesPrompt,
} from "./prompts.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

export class AnthropicLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for AnthropicLLMProvider");
    }
    this.client = new Anthropic({ apiKey, timeout: 60000 });
    this.model = model;
  }

  getModelName(): string {
    return this.model;
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const status = err?.status;
        const isRateLimitOr5xx = status === 429 || (status >= 500 && status < 600);
        if (isRateLimitOr5xx && attempt <= maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ attempt, delay, status }, "Anthropic API temporary error, retrying...");
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        logger.error({ err }, "Anthropic API request failed");
        throw new AppError("LLM_FAILED", `LLM processing error: ${err?.message || "Unknown error"}`, 502);
      }
    }
  }

  async analyze(articleText: string, retryFeedback?: string): Promise<AnalysisResult> {
    const userPrompt = getAnalysisPrompt(articleText, retryFeedback);

    const tool = {
      name: "submit_article_analysis",
      description: "Submit the 3 neutral summary bullet points and 6-10 extracted article claims.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "array",
            items: { type: "string" },
            description: "Exactly 3 neutral summary bullets in your own words.",
          },
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string", description: "Claim in your own words, <= 200 chars." },
                sourceQuote: {
                  type: "string",
                  description: "Verbatim quote copied directly from the article, <= 25 words.",
                },
              },
              required: ["text", "sourceQuote"],
            },
            description: "6 to 10 claims with verbatim source quotes.",
          },
        },
        required: ["summary", "claims"],
      },
    };

    const res = await this.executeWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: SHARED_SYSTEM_PREAMBLE,
        tools: [tool],
        tool_choice: { type: "tool", name: "submit_article_analysis" },
        messages: [{ role: "user", content: userPrompt }],
      })
    );

    const toolUseBlock = res.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new AppError("LLM_FAILED", "Anthropic did not call submit_article_analysis tool", 502);
    }

    const parsed = AnalysisResultSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.format() }, "Analysis output failed Zod validation");
      throw new AppError("LLM_FAILED", "LLM output did not conform to analysis schema", 502);
    }

    return parsed.data;
  }

  async generatePerspectives(
    summary: string[],
    claims: Array<{ id: string; text: string; sourceQuote: string }>,
    retryFeedback?: string
  ): Promise<PerspectivesResult> {
    const userPrompt = getPerspectivesPrompt(summary, claims, retryFeedback);

    const tool = {
      name: "submit_perspectives",
      description: "Submit 4 to 5 balanced, distinct perspectives on the analyzed article.",
      input_schema: {
        type: "object" as const,
        properties: {
          perspectives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slug: { type: "string" },
                label: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["ideological", "stakeholder", "skeptic", "local", "historical"],
                },
                stance: { type: "string" },
                thought: { type: "string" },
                claimIds: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["slug", "label", "kind", "stance", "thought", "claimIds"],
            },
          },
        },
        required: ["perspectives"],
      },
    };

    const res = await this.executeWithRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: 2500,
        system: SHARED_SYSTEM_PREAMBLE,
        tools: [tool],
        tool_choice: { type: "tool", name: "submit_perspectives" },
        messages: [{ role: "user", content: userPrompt }],
      })
    );

    const toolUseBlock = res.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new AppError("LLM_FAILED", "Anthropic did not call submit_perspectives tool", 502);
    }

    const parsed = PerspectivesResultSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.format() }, "Perspectives output failed Zod validation");
      throw new AppError("LLM_FAILED", "LLM output did not conform to perspectives schema", 502);
    }

    return parsed.data;
  }

  async streamArgue(
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    onToken: (token: string) => void
  ): Promise<string> {
    let fullResponse = "";

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 300,
      system: systemPrompt,
      messages: history.map((h) => ({ role: h.role, content: h.content })),
    });

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        const text = chunk.delta.text;
        fullResponse += text;
        onToken(text);
      }
    }

    return fullResponse;
  }
}

