import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatView } from "@/components/chat/chat-view";
import { getConversation } from "@/lib/conversations";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const conversation = id.success ? await getConversation(id.data) : null;
  if (!conversation) notFound();
  const allowed = env().allowedModels;
  return (
    <ChatView
      key={conversation.id}
      conversationId={conversation.id}
      initialMessages={conversation.messages}
      initialArtifacts={conversation.artifacts}
      initialModel={allowed.includes(conversation.model) ? conversation.model : (allowed[0] ?? conversation.model)}
      allowedModels={allowed}
    />
  );
}
