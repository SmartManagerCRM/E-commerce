import "server-only";

import { serverEnv } from "@/server/env";

import type { AIProvider, AIProviderResult, ChatInput, ChatResult, ContentBlock, StructuredOutputInput } from "./provider";

/** Whether the platform's own Anthropic account is configured. */
export function aiConfigured(): boolean {
  return Boolean(serverEnv().ANTHROPIC_API_KEY);
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicBlock[] };

type AnthropicResponse = {
  content: AnthropicBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
  error?: { message: string };
};

function toAnthropicMessages(messages: ChatInput["messages"]): AnthropicMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b): AnthropicBlock => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
    }),
  }));
}

function fromAnthropicBlocks(blocks: AnthropicBlock[]): ContentBlock[] {
  return blocks.map((b): ContentBlock => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    return { type: "tool_result", toolUseId: b.tool_use_id, content: b.content, isError: b.is_error };
  });
}

function stopReasonOf(reason: string): ChatResult["stopReason"] {
  if (reason === "end_turn" || reason === "stop_sequence") return "end_turn";
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "max_tokens";
  return "other";
}

async function callAnthropic(body: Record<string, unknown>): Promise<AIProviderResult<AnthropicResponse>> {
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL, ...body }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as AnthropicResponse | null;
    if (!res.ok || !data) return { ok: false, error: data?.error?.message ?? `Anthropic error ${res.status}` };
    return { ok: true, value: data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

/** The platform's default AI provider (spec §27's `AIProvider` interface, this is one implementation of it). */
export const anthropicProvider: AIProvider = {
  async chat(input: ChatInput): Promise<AIProviderResult<ChatResult>> {
    const result = await callAnthropic({
      system: input.system,
      messages: toAnthropicMessages(input.messages),
      max_tokens: input.maxTokens ?? 1024,
      tools: input.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    });
    if (!result.ok) return result;

    return {
      ok: true,
      value: {
        content: fromAnthropicBlocks(result.value.content),
        stopReason: stopReasonOf(result.value.stop_reason),
        usage: { inputTokens: result.value.usage.input_tokens, outputTokens: result.value.usage.output_tokens },
      },
    };
  },

  async generateStructuredOutput<T>(input: StructuredOutputInput) {
    const result = await callAnthropic({
      system: input.system,
      messages: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
      max_tokens: input.maxTokens ?? 1024,
      tools: [{ name: "respond", description: "Return the structured response.", input_schema: input.schema }],
      tool_choice: { type: "tool", name: "respond" },
    });
    if (!result.ok) return result;

    const toolUse = result.value.content.find((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (!toolUse) return { ok: false, error: "no_structured_response" };

    return {
      ok: true,
      value: {
        data: toolUse.input as T,
        usage: { inputTokens: result.value.usage.input_tokens, outputTokens: result.value.usage.output_tokens },
      },
    };
  },
};
