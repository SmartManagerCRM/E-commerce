import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fromGeminiParts, toGeminiContents } from "@/server/ai/gemini";
import type { AITurnMessage } from "@/server/ai/provider";

describe("Gemini provider content mapping", () => {
  it("round-trips a tool_use call into a matching tool_result", () => {
    // The model calls one tool...
    const modelTurn = fromGeminiParts([{ functionCall: { name: "search_products", args: { query: "latte" } } }]);
    expect(modelTurn).toEqual([
      { type: "tool_use", id: "g_0_search_products", name: "search_products", input: { query: "latte" } },
    ]);

    // ...our tool layer executes it and the orchestration loop echoes the
    // result back keyed by the tool_use block's own id, same as ordering-agent.ts does.
    const toolUseId = (modelTurn[0] as { id: string }).id;
    const toolResultTurn: AITurnMessage = {
      role: "user",
      content: [{ type: "tool_result", toolUseId, content: '{"total":0}' }],
    };

    // Converting that back to Gemini's wire format must recover the original
    // function name from the id, since Gemini matches by name, not id.
    const [content] = toGeminiContents([toolResultTurn]);
    expect(content).toEqual({
      role: "function",
      parts: [{ functionResponse: { name: "search_products", response: { content: '{"total":0}', error: undefined } } }],
    });
  });

  it("maps assistant text and user text to model/user roles", () => {
    const messages: AITurnMessage[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    expect(toGeminiContents(messages)).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "hello" }] },
    ]);
  });

  it("gives every functionCall in one turn a distinct id", () => {
    const blocks = fromGeminiParts([
      { functionCall: { name: "view_cart", args: {} } },
      { functionCall: { name: "view_cart", args: {} } },
    ]);
    const ids = blocks.map((b) => (b as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
  });
});
