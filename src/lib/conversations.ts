import type { UIMessage } from "ai";
import { asc, desc, eq, notInArray, and } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { listArtifactSummaries, type ArtifactSummary } from "@/lib/artifacts";
import { DEFAULT_TITLE } from "@/lib/llm/title";

export type ConversationListItem = { id: string; title: string; model: string; updatedAt: string };
export type ConversationDto = ConversationListItem & { messages: UIMessage[]; artifacts: ArtifactSummary[] };

export async function listConversations(): Promise<ConversationListItem[]> {
  const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  return rows.map((r) => ({ id: r.id, title: r.title, model: r.model, updatedAt: r.updatedAt.toISOString() }));
}

export async function getConversationRow(id: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  return row ?? null;
}

export async function getConversation(id: string): Promise<ConversationDto | null> {
  const row = await getConversationRow(id);
  if (!row) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.seq));
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    updatedAt: row.updatedAt.toISOString(),
    messages: msgs.map((m) => ({ id: m.id, role: m.role, parts: m.parts as UIMessage["parts"] })),
    artifacts: await listArtifactSummaries(id),
  };
}

/** Create the conversation on its first message; afterwards keep its model current. */
export async function upsertConversation(id: string, model: string) {
  const [row] = await db
    .insert(conversations)
    .values({ id, model, title: DEFAULT_TITLE })
    .onConflictDoUpdate({ target: conversations.id, set: { model, updatedAt: new Date() } })
    .returning();
  if (!row) throw new Error("conversation upsert returned nothing");
  return row;
}

/**
 * Make the stored history match the client's message list: messages the client
 * dropped (regenerate, edit-and-resend) are deleted, the rest are upserted in order.
 */
export async function syncMessages(conversationId: string, list: UIMessage[]) {
  await db.transaction(async (tx) => {
    const ids = list.map((m) => m.id);
    await tx
      .delete(messages)
      .where(
        ids.length > 0
          ? and(eq(messages.conversationId, conversationId), notInArray(messages.id, ids))
          : eq(messages.conversationId, conversationId),
      );
    for (const m of list) {
      await tx
        .insert(messages)
        .values({ id: m.id, conversationId, role: m.role, parts: m.parts })
        .onConflictDoUpdate({
          target: messages.id,
          set: { parts: m.parts },
          setWhere: eq(messages.conversationId, conversationId),
        });
    }
  });
}

export async function saveMessage(conversationId: string, message: UIMessage) {
  await db
    .insert(messages)
    .values({ id: message.id, conversationId, role: message.role, parts: message.parts })
    // Only ever update a message in its own conversation.
    .onConflictDoUpdate({
      target: messages.id,
      set: { parts: message.parts },
      setWhere: eq(messages.conversationId, conversationId),
    });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function updateConversation(id: string, patch: { title?: string; model?: string }) {
  const [row] = await db.update(conversations).set(patch).where(eq(conversations.id, id)).returning();
  return row ?? null;
}

/** Set a generated title unless the user renamed the conversation first. Returns the title now shown. */
export async function setGeneratedTitle(id: string, title: string): Promise<string | null> {
  const [row] = await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.id, id), eq(conversations.title, DEFAULT_TITLE)))
    .returning();
  return row?.title ?? null;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const rows = await db.delete(conversations).where(eq(conversations.id, id)).returning({ id: conversations.id });
  return rows.length > 0;
}
