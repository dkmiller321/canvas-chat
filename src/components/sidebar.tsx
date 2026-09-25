"use client";

import { MessageSquare, Pencil, Plus, Search, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/app-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { ConversationListItem } from "@/lib/conversations";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { startNewChat, conversationsVersion, conversationsChanged } = useAppState();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ConversationListItem[]>) : []))
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        // Keep the current list; the next change retries.
      });
    return () => {
      cancelled = true;
    };
  }, [conversationsVersion, pathname]);

  const activeId = pathname.match(/^\/c\/([^/]+)/)?.[1];
  const visible = items.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));

  async function rename(id: string) {
    const title = draft.trim();
    setRenaming(null);
    if (!title) return;
    setItems((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    conversationsChanged();
  }

  async function remove(id: string) {
    setItems((list) => list.filter((c) => c.id !== id));
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (id === activeId) startNewChat();
    conversationsChanged();
  }

  return (
    <aside aria-label="Conversations" className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex flex-col gap-2 p-3">
        <Button data-testid="new-chat" variant="outline" className="justify-start" onClick={startNewChat}>
          <Plus /> New chat
        </Button>
        <label className="relative">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <input
            data-testid="sidebar-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <ul className="flex flex-col gap-0.5">
          {visible.map((c) => (
            <li
              key={c.id}
              data-testid="sidebar-item"
              data-conversation-id={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1 text-sm",
                c.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              {renaming === c.id ? (
                <input
                  aria-label="Conversation title"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => rename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(c.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="m-1 h-7 min-w-0 flex-1 rounded border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => router.push(`/c/${c.id}`)}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{c.title}</span>
                </button>
              )}
              {renaming !== c.id && (
                <span className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    data-testid="rename-chat"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${c.title}`}
                    onClick={() => {
                      setDraft(c.title);
                      setRenaming(c.id);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    data-testid="delete-chat"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {items.length > 0 && visible.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">No chats match “{query}”.</p>
        )}
      </nav>

      <div className="flex items-center gap-1 border-t p-2">
        <Button asChild variant="ghost" size="sm" className="flex-1 justify-start">
          <Link href="/settings" data-testid="settings-link">
            <Settings /> Settings
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
