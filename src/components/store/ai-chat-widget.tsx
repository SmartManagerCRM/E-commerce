"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { sendChatMessage } from "@/app/store/[tenant]/[locale]/ai/actions";
import { cn } from "@/lib/cn";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

export type AiChatWidgetLabels = {
  openLabel: string;
  closeLabel: string;
  title: string;
  placeholder: string;
  send: string;
  thinking: string;
  endedNotice: string;
  errorGeneric: string;
  rateLimited: string;
};

/**
 * The storefront AI ordering assistant (spec §51, floating mode). Talks only
 * to `sendChatMessage`, which resolves the tenant, cart, and conversation
 * state server-side — this component holds no commerce logic of its own,
 * only the chat transcript.
 */
export function AiChatWidget({ assistantName, greeting, labels }: { assistantName: string; greeting: string | null; labels: AiChatWidgetLabels }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(greeting ? [{ id: "greeting", role: "assistant", text: greeting }] : []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const titleId = useId();
  const searchParams = useSearchParams();
  const tableLabel = searchParams.get("table");
  const consumedTable = useRef(false);

  async function sendText(text: string) {
    if (!text || busy || ended) return;
    setError(null);
    setMessages((all) => [...all, { id: crypto.randomUUID(), role: "user", text }]);
    setBusy(true);
    const result = await sendChatMessage({ message: text, conversationId: conversationId.current });
    setBusy(false);
    if (result.status === "error") {
      setError(result.error === "rateLimited" ? labels.rateLimited : labels.errorGeneric);
      return;
    }
    conversationId.current = result.conversationId;
    setMessages((all) => [...all, { id: crypto.randomUUID(), role: "assistant", text: result.reply }]);
    if (result.ended) setEnded(true);
  }

  // QR/table entry point (spec §6 Method B/C): opening the store with
  // ?table=<label> starts the chat and tells the assistant where the
  // customer is sitting — it must still confirm this out loud before acting
  // on it (the assistant's own system prompt/tooling handles that).
  useEffect(() => {
    if (tableLabel && !consumedTable.current) {
      consumedTable.current = true;
      setOpen(true);
      void sendText(`I'm dining in at table ${tableLabel}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableLabel]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  }

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="flex h-[min(32rem,70dvh)] w-[min(24rem,90vw)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-overlay"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id={titleId} className="text-sm font-semibold">
              {assistantName}
            </h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={labels.closeLabel} className="text-muted hover:text-fg">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user" ? "ms-auto bg-primary text-primary-fg" : "bg-muted/10 text-fg",
                )}
              >
                {m.text}
              </div>
            ))}
            {busy && <div className="max-w-[85%] rounded-lg bg-muted/10 px-3 py-2 text-sm text-muted">{labels.thinking}</div>}
            {ended && <p className="rounded-md bg-muted/10 px-3 py-2 text-xs text-muted">{labels.endedNotice}</p>}
            {error && (
              <p role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={labels.placeholder}
              disabled={busy || ended}
              maxLength={1000}
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || ended || !input.trim()}
              aria-label={labels.send}
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? labels.closeLabel : labels.openLabel}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-overlay"
      >
        {open ? <X className="size-6" aria-hidden="true" /> : <MessageCircle className="size-6" aria-hidden="true" />}
      </button>
    </div>
  );
}
