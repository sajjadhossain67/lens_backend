import { AnalysisResult, PerspectivesResult } from "./schemas.js";

export interface LLMProvider {
  getModelName(): string;
  analyze(articleText: string, retryFeedback?: string): Promise<AnalysisResult>;
  generatePerspectives(
    summary: string[],
    claims: Array<{ id: string; text: string; sourceQuote: string }>,
    retryFeedback?: string
  ): Promise<PerspectivesResult>;
  streamArgue(
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    onToken: (token: string) => void
  ): Promise<string>;
}

