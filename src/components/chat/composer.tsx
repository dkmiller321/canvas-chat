"use client";

import { ArrowUp, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = { busy: boolean; onSend: (text: string) => void; onStop: () => void };

export function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        data-testid="chat-input"
        aria-label="Message"
        value={text}
        disabled={busy}
        rows={1}
        placeholder="Send a message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-60 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none field-sizing-content disabled:opacity-60"
      />
      {busy ? (
        <Button
          type="button"
          data-testid="stop-button"
          size="icon"
          variant="secondary"
          onClick={onStop}
          aria-label="Stop"
        >
          <Square className="fill-current" />
        </Button>
      ) : (
        <Button type="submit" data-testid="send-button" size="icon" disabled={!text.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      )}
    </form>
  );
}
