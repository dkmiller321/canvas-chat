import { SettingsForm } from "@/components/settings-form";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <h1 className="mb-1 text-xl font-semibold">Settings</h1>
      <p className="mb-8 text-sm text-muted-foreground">Models come from ALLOWED_MODELS in the server environment.</p>
      <SettingsForm initial={await getSettings()} allowedModels={env().allowedModels} />
    </div>
  );
}
