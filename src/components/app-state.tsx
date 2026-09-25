"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type AppState = {
  /** Changes on every "New chat" so the chat view remounts even when the URL is already "/". */
  newChatKey: string;
  startNewChat: () => void;
  /** Bumped whenever the conversation list may have changed (new chat, title, rename, delete). */
  conversationsVersion: number;
  conversationsChanged: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [newChatKey, setNewChatKey] = useState(() => crypto.randomUUID());
  const [conversationsVersion, setConversationsVersion] = useState(0);

  const startNewChat = useCallback(() => {
    setNewChatKey(crypto.randomUUID());
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  const conversationsChanged = useCallback(() => setConversationsVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ newChatKey, startNewChat, conversationsVersion, conversationsChanged }),
    [newChatKey, startNewChat, conversationsVersion, conversationsChanged],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState outside AppStateProvider");
  return ctx;
}
