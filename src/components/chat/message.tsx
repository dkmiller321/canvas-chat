"use client";

import type { UIMessage } from "ai";
import { Markdown } from "./markdown";

export function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <div className="flex justify-end">
      <div
        data-testid="message-user"
        className="max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-sm whitespace-pre-wrap text-secondary-foreground"
      >
        {text}
      </div>
    </div>
  );
}

export function AssistantMessage({ message }: { message: UIMessage }) {
  return (
    <div data-testid="message-assistant" className="text-sm leading-relaxed">
      {message.parts.map((part, i) => {
        if (part.type === "text") return <Markdown key={i} text={part.text} />;
        return null;
      })}
    </div>
  );
}
