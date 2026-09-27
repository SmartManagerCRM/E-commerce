import "server-only";

/**
 * Provider-agnostic AI interface (spec §27). Nothing else in the codebase
 * should import a specific vendor SDK or call a model API directly — every
 * caller goes through this shape, the same way `PaymentProvider` decouples
 * the app from Moyasar specifically.
 */
export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export type AIToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
};

export type AIToolCall = { name: string; arguments: Record<string, unknown> };

export type AIUsage = { inputTokens: number; outputTokens: number };

export type ChatResult = {
  /** Present when the model replied in plain text (no tool call). */
  text: string | null;
  /** Present when the model chose to call a tool instead of replying directly. */
  toolCall: AIToolCall | null;
  usage: AIUsage;
};

export type ChatInput = {
  system: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  maxTokens?: number;
};

export type StructuredOutputInput = {
  system: string;
  prompt: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
  maxTokens?: number;
};

export type AIProviderResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AIProvider = {
  /** One request/response turn. Used for both the ordering assistant and the business copilot. */
  chat(input: ChatInput): Promise<AIProviderResult<ChatResult>>;
  /** A single structured (JSON-schema-constrained) generation, no conversation or tools. */
  generateStructuredOutput<T>(input: StructuredOutputInput): Promise<AIProviderResult<{ data: T; usage: AIUsage }>>;
};
