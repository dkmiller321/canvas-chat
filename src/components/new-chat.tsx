"use client";

import { useAppState } from "@/components/app-state";
import { ChatView, type ChatViewProps } from "@/components/chat/chat-view";

/** A fresh chat; remounts on every "New chat" click even when the URL is already "/". */
export function NewChat(props: Omit<ChatViewProps, "conversationId" | "initialMessages" | "initialArtifacts">) {
  const { newChatKey } = useAppState();
  return <ChatView key={newChatKey} conversationId={null} initialMessages={[]} initialArtifacts={[]} {...props} />;
}
