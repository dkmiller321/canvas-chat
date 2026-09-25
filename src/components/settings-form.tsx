"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/settings";

type Props = { initial: AppSettings; allowedModels: string[] };

export function SettingsForm({ initial, allowedModels }: Props) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  const field = (key: keyof AppSettings, label: string, hint: string, testId?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        data-testid={testId}
        value={values[key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          setStatus("idle");
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {allowedModels.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <form onSubmit={save} className="flex max-w-md flex-col gap-6">
      {field("defaultModel", "Default model", "Used for new conversations.", "settings-default-model")}
      {field("taskModel", "Task model", "A cheaper model for titles and quick actions.")}
      <div className="flex items-center gap-3">
        <Button data-testid="settings-save" type="submit" disabled={status === "saving"}>
          Save
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {status === "saved" ? "Saved." : status === "error" ? "Could not save settings." : ""}
        </span>
      </div>
    </form>
  );
}
