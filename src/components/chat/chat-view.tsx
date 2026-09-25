"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Code2, PanelRightOpen, PenLine, Plus, Shapes } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/components/app-state";
import { CanvasPanel } from "@/components/canvas/canvas-panel";
import { useCanvas } from "@/components/canvas/use-canvas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArtifactDto, ArtifactKind, ArtifactSummary } from "@/lib/artifacts";
import { CanvasActionsContext } from "./canvas-actions";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./message";
import { ModelPicker } from "./model-picker";
import { SplitPane } from "./split-pane";

export type ChatViewProps = {
  conversationId: string | null;
  initialMessages: UIMessage[];
  initialArtifacts: ArtifactSummary[];
  initialModel: string;
  allowedModels: string[];
  /** MOCK_LLM only: expose editor APIs to specs (docs/E2E_TESTS.md §4.1). */
  testHooks: boolean;
};

export function ChatView({
  conversationId,
  initialMessages,
  initialArtifacts,
  initialModel,
  allowedModels,
  testHooks,
}: ChatViewProps) {
  const [id] = useState(() => conversationId ?? crypto.randomUUID());
  const [model, setModel] = useState(initialModel);
  const modelRef = useRef(model);
  modelRef.current = model;
  const openArtifactRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, messages, model: modelRef.current, openArtifactId: openArtifactRef.current },
        }),
      }),
    [],
  );
  const { conversationsChanged } = useAppState();
  const { messages, sendMessage, regenerate, status, stop, error } = useChat({
    id,
    messages: initialMessages,
    transport,
    onFinish: () => conversationsChanged(),
    // The auto-generated title arrives as a transient data part (C5).
    onData: (part) => {
      if (part.type === "data-title") conversationsChanged();
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const canvas = useCanvas({ initialArtifacts, messages });
  openArtifactRef.current = canvas.panelOpen ? canvas.openId : null;
  const persisted = useRef(conversationId !== null);

  async function send(text: string) {
    // Save pending manual edits first so the model sees them (PRD A5).
    await canvas.flush();
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

  /** Blank artifact without the AI (D12); creates the conversation if this is a new chat. */
  async function createBlank(kind: ArtifactKind) {
    await canvas.flush();
    const res = await fetch(`/api/conversations/${id}/artifacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, model: modelRef.current }),
    });
    if (!res.ok) return;
    if (!persisted.current) {
      persisted.current = true;
      window.history.replaceState(null, "", `/c/${id}`);
    }
    conversationsChanged();
    canvas.addArtifact((await res.json()) as ArtifactDto);
  }

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

  const canvasActions = useMemo(
    () => ({
      openArtifact: canvas.openArtifact,
      kinds: new Map(canvas.artifacts.map((a) => [a.id, a.kind])),
      versions: new Map(canvas.artifacts.map((a) => [a.id, a.version])),
    }),
    [canvas.openArtifact, canvas.artifacts],
  );

  const chat = (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <ModelPicker value={model} options={allowedModels} onChange={changeModel} disabled={busy} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="new-artifact" variant="ghost" size="sm" disabled={busy}>
              <Plus /> New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem data-testid="new-document" onSelect={() => void createBlank("document")}>
              <PenLine /> Document
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="new-diagram" onSelect={() => void createBlank("diagram")}>
              <Shapes /> Diagram
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="new-code" onSelect={() => void createBlank("code")}>
              <Code2 /> Code
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!canvas.panelOpen && canvas.artifacts.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              const last = canvas.artifacts.at(-1);
              if (last) canvas.openArtifact(canvas.openId ?? last.id);
            }}
          >
            <PanelRightOpen /> Open canvas
          </Button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage
                key={m.id}
                message={m}
                disabled={busy}
                onEdit={async (text) => {
                  await canvas.flush();
                  sendMessage({ text, messageId: m.id });
                }}
              />
            ) : (
              <AssistantMessage
                key={m.id}
                message={m}
                onRegenerate={!busy && i === messages.length - 1 ? () => regenerate() : undefined}
              />
            ),
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

  return (
    <CanvasActionsContext value={canvasActions}>
      <SplitPane
        left={chat}
        right={
          canvas.panelOpen ? <CanvasPanel canvas={canvas} chatBusy={busy} model={model} testHooks={testHooks} /> : null
        }
      />
    </CanvasActionsContext>
  );
}
