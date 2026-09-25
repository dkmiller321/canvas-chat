"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./message";
import { ModelPicker } from "./model-picker";

export type ChatViewProps = {
  conversationId: string | null;
  initialMessages: UIMessage[];
  initialModel: string;
  allowedModels: string[];
};

export function ChatView({ conversationId, initialMessages, initialModel, allowedModels }: ChatViewProps) {
  const [id] = useState(() => conversationId ?? crypto.randomUUID());
  const [model, setModel] = useState(initialModel);
  const modelRef = useRef(model);
  modelRef.current = model;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, messages, model: modelRef.current } }),
      }),
    [],
  );
  const { messages, sendMessage, status, stop, error } = useChat({ id, messages: initialMessages, transport });
  const busy = status === "submitted" || status === "streaming";

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <ModelPicker value={model} options={allowedModels} onChange={setModel} disabled={busy} />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((m) =>
            m.role === "user" ? <UserMessage key={m.id} message={m} /> : <AssistantMessage key={m.id} message={m} />,
          )}
          {status === "submitted" && (
            <div aria-label="Waiting for reply" className="flex gap-1 py-2">
              <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
              <span className="size-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
              <span className="size-2 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong: {error.message}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4">
        <Composer busy={busy} onSend={(text) => sendMessage({ text })} onStop={stop} />
      </div>
    </div>
  );
}
