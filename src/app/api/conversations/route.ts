import { listConversations } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listConversations());
}
