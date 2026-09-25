"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "./markdown";
import { ToolPartView } from "./tool-part";

const textOf = (message: UIMessage) => message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

type UserProps = { message: UIMessage; disabled: boolean; onEdit: (text: string) => void };

export function UserMessage({ message, disabled, onEdit }: UserProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const text = textOf(message);

  if (editing) {
    return (
      <form
        className="ml-auto flex w-full max-w-[80%] flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setEditing(false);
          onEdit(draft.trim());
        }}
      >
        <textarea
          aria-label="Edit message"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-20 rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Save and send
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex items-start justify-end gap-1">
      {!disabled && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Edit message"
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={() => {
            setDraft(text);
            setEditing(true);
          }}
        >
          <Pencil />
        </Button>
      )}
      <div
        data-testid="message-user"
        className="max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-sm whitespace-pre-wrap text-secondary-foreground"
      >
        {text}
      </div>
    </div>
  );
}

type AssistantProps = { message: UIMessage; onRegenerate?: () => void };

export function AssistantMessage({ message, onRegenerate }: AssistantProps) {
  return (
    <div className="group flex flex-col gap-1">
      <div data-testid="message-assistant" className="text-sm leading-relaxed">
        {message.parts.map((part, i) => {
          if (part.type === "text") return <Markdown key={i} text={part.text} />;
          if (isToolUIPart(part)) return <ToolPartView key={part.toolCallId} part={part} />;
          return null;
        })}
      </div>
      {onRegenerate && (
        <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button size="icon-sm" variant="ghost" aria-label="Regenerate" title="Regenerate" onClick={onRegenerate}>
            <RefreshCw />
          </Button>
        </div>
      )}
    </div>
  );
}
