import { NewChat } from "@/components/new-chat";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getSettings();
  return <NewChat initialModel={settings.defaultModel} allowedModels={env().allowedModels} />;
}
