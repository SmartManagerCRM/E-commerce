import "server-only";

/**
 * Provider-agnostic AI interface (spec §27). Nothing else in the codebase
 * should import a specific vendor SDK or call a model API directly — every
 * caller goes through this shape, the same way `PaymentProvider` decouples
 * the app from Moyasar specifically.
 *
 * Content is block-based (text / tool_use / tool_result) rather than plain
 * strings, because that's what a real tool-calling turn needs to express —
 * any provider that supports tool calling can produce/consume these same
 * three block shapes.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type AITurnMessage = { role: "user" | "assistant"; content: ContentBlock[] };

export type AIToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
};

export type AIUsage = { inputTokens: number; outputTokens: number };

export type ChatInput = {
  system: string;
  messages: AITurnMessage[];
  tools?: AIToolDefinition[];
  maxTokens?: number;
};

export type ChatResult = {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage: AIUsage;
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
  /** One model turn. May return text, a tool call, or both. */
  chat(input: ChatInput): Promise<AIProviderResult<ChatResult>>;
  /** A single structured (JSON-schema-constrained) generation, no conversation or tools. */
  generateStructuredOutput<T>(input: StructuredOutputInput): Promise<AIProviderResult<{ data: T; usage: AIUsage }>>;
};
