"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/components/app-state";
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
  const { conversationsChanged } = useAppState();
  const { messages, sendMessage, status, stop, error } = useChat({
    id,
    messages: initialMessages,
    transport,
    onFinish: () => conversationsChanged(),
  });
  const busy = status === "submitted" || status === "streaming";
  const persisted = useRef(conversationId !== null);

  function send(text: string) {
    sendMessage({ text });
    if (!persisted.current) {
      // The server creates the conversation on this first message; give it a URL without remounting.
      persisted.current = true;
      window.history.replaceState(null, "", `/c/${id}`);
      announce.current = true;
    }
  }

  // The conversation row exists once the reply starts streaming: show it in the sidebar.
  const announce = useRef(false);
  useEffect(() => {
    if (announce.current && status === "streaming") {
      announce.current = false;
      conversationsChanged();
    }
  }, [status, conversationsChanged]);

  function changeModel(next: string) {
    setModel(next);
    if (persisted.current) {
      fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: next }),
      }).catch(() => {
        // The next message sends the model anyway and the server stores it.
      });
    }
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <ModelPicker value={model} options={allowedModels} onChange={changeModel} disabled={busy} />
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
        <Composer busy={busy} onSend={send} onStop={stop} />
      </div>
    </div>
  );
}
