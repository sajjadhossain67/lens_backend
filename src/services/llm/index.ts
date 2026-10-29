import { config } from "../../config.js";
import { LLMProvider } from "./provider.js";
import { MockLLMProvider } from "./mock.js";
import { AnthropicLLMProvider } from "./anthropic.js";
import { logger } from "../../lib/logger.js";

let providerInstance: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (providerInstance) {
    return providerInstance;
  }

  if (config.LLM_PROVIDER === "anthropic" && config.ANTHROPIC_API_KEY) {
    logger.info({ model: config.LLM_MODEL }, "Initializing Anthropic LLM Provider");
    providerInstance = new AnthropicLLMProvider(config.ANTHROPIC_API_KEY, config.LLM_MODEL);
  } else {
    logger.info("Initializing Mock LLM Provider (offline/fixture mode)");
    providerInstance = new MockLLMProvider();
  }

  return providerInstance;
}

export function setLLMProvider(customProvider: LLMProvider): void {
  providerInstance = customProvider;
}

