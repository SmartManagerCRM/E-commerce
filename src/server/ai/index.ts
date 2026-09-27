import "server-only";

import { aiConfigured as anthropicConfigured, anthropicProvider } from "./anthropic";
import { geminiConfigured, geminiProvider } from "./gemini";
import type { AIProvider } from "./provider";

export type * from "./provider";

/** Whether the platform has any AI provider configured at all. */
export function aiConfigured(): boolean {
  return geminiConfigured() || anthropicConfigured();
}

/**
 * The provider currently wired up. Gemini (Google AI Studio) is preferred
 * when configured — it's the free-tier option — falling back to Anthropic;
 * this is the only place that decides between them, everything else in the
 * codebase just calls `aiProvider` through the shared `AIProvider` interface.
 */
export const aiProvider: AIProvider = {
  chat: (input) => (geminiConfigured() ? geminiProvider : anthropicProvider).chat(input),
  generateStructuredOutput: (input) => (geminiConfigured() ? geminiProvider : anthropicProvider).generateStructuredOutput(input),
};
