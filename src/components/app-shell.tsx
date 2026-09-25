"use client";

import { Plus } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { startNewChat } = useAppState();
  return (
    <div className="flex h-full">
      <aside aria-label="Conversations" className="flex w-64 shrink-0 flex-col border-r bg-sidebar p-3">
        <Button data-testid="new-chat" variant="outline" className="justify-start" onClick={startNewChat}>
          <Plus /> New chat
        </Button>
      </aside>
      <main className="flex min-w-0 flex-1">{children}</main>
    </div>
  );
}
