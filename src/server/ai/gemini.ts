import "server-only";

import { serverEnv } from "@/server/env";

import type { AIProvider, AIProviderResult, ChatInput, ChatResult, ContentBlock, StructuredOutputInput } from "./provider";

/** Whether the platform's Gemini (Google AI Studio) account is configured. */
export function geminiConfigured(): boolean {
  return Boolean(serverEnv().GEMINI_API_KEY);
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: string; error?: boolean } } };

type GeminiContent = { role: "user" | "model" | "function"; parts: GeminiPart[] };

type GeminiCandidate = { content?: GeminiContent; finishReason?: string };

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message: string };
};

/**
 * Our `tool_use` blocks carry an opaque `id` that a `tool_result` echoes back
 * via `toolUseId` — that's how Anthropic's wire format matches a result to
 * its call. Gemini's `functionCall`/`functionResponse` match by function
 * *name* instead and have no id of their own, so this provider encodes the
 * name into the id it hands out (`g_<index>_<name>`) and decodes it back out
 * when building the functionResponse — a detail entirely internal to this
 * file; callers never parse the id themselves.
 */
function encodeToolUseId(index: number, name: string): string {
  return `g_${index}_${name}`;
}

function decodeToolName(toolUseId: string): string {
  const match = /^g_\d+_(.+)$/.exec(toolUseId);
  return match ? match[1] : toolUseId;
}

export function toGeminiContents(messages: ChatInput["messages"]): GeminiContent[] {
  return messages.map((m): GeminiContent => {
    if (m.role === "user" && m.content.every((b) => b.type === "tool_result")) {
      return {
        role: "function",
        parts: m.content.map((b): GeminiPart => {
          const block = b as Extract<ContentBlock, { type: "tool_result" }>;
          return {
            functionResponse: {
              name: decodeToolName(block.toolUseId),
              response: { content: block.content, error: block.isError },
            },
          };
        }),
      };
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: m.content.map((b): GeminiPart => {
        if (b.type === "text") return { text: b.text };
        if (b.type === "tool_use") return { functionCall: { name: b.name, args: b.input } };
        return { functionResponse: { name: decodeToolName(b.toolUseId), response: { content: b.content, error: b.isError } } };
      }),
    };
  });
}

export function fromGeminiParts(parts: GeminiPart[]): ContentBlock[] {
  return parts.map((p, i): ContentBlock => {
    if ("text" in p) return { type: "text", text: p.text };
    if ("functionCall" in p) {
      return { type: "tool_use", id: encodeToolUseId(i, p.functionCall.name), name: p.functionCall.name, input: p.functionCall.args };
    }
    return { type: "tool_result", toolUseId: p.functionResponse.name, content: p.functionResponse.response.content, isError: p.functionResponse.response.error };
  });
}

function stopReasonOf(parts: GeminiPart[], finishReason: string | undefined): ChatResult["stopReason"] {
  if (parts.some((p) => "functionCall" in p)) return "tool_use";
  if (finishReason === "STOP" || finishReason === undefined) return "end_turn";
  if (finishReason === "MAX_TOKENS") return "max_tokens";
  return "other";
}

async function callGemini(model: string, body: Record<string, unknown>): Promise<AIProviderResult<GeminiResponse>> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok || !data) return { ok: false, error: data?.error?.message ?? `Gemini error ${res.status}` };
    return { ok: true, value: data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

/** Google AI Studio (Gemini) implementation of `AIProvider` — a free-tier alternative to Anthropic behind the same interface. */
export const geminiProvider: AIProvider = {
  async chat(input: ChatInput): Promise<AIProviderResult<ChatResult>> {
    const model = serverEnv().GEMINI_MODEL;
    const result = await callGemini(model, {
      system_instruction: { parts: [{ text: input.system }] },
      contents: toGeminiContents(input.messages),
      tools: input.tools?.length
        ? [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
        : undefined,
      generationConfig: { maxOutputTokens: input.maxTokens ?? 1024 },
    });
    if (!result.ok) return result;

    const candidate = result.value.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    return {
      ok: true,
      value: {
        content: fromGeminiParts(parts),
        stopReason: stopReasonOf(parts, candidate?.finishReason),
        usage: {
          inputTokens: result.value.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: result.value.usageMetadata?.candidatesTokenCount ?? 0,
        },
      },
    };
  },

  async generateStructuredOutput<T>(input: StructuredOutputInput) {
    const model = serverEnv().GEMINI_MODEL;
    const result = await callGemini(model, {
      system_instruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      tools: [{ functionDeclarations: [{ name: "respond", description: "Return the structured response.", parameters: input.schema }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["respond"] } },
      generationConfig: { maxOutputTokens: input.maxTokens ?? 1024 },
    });
    if (!result.ok) return result;

    const parts = result.value.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p);
    if (!call) return { ok: false, error: "no_structured_response" };

    return {
      ok: true,
      value: {
        data: call.functionCall.args as T,
        usage: {
          inputTokens: result.value.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: result.value.usageMetadata?.candidatesTokenCount ?? 0,
        },
      },
    };
  },
};
