import { AppShell } from "@/components/app-shell";
import { AppStateProvider } from "@/components/app-state";

/** The chat app: sidebar and shared client state. Render-only routes (e.g. /render) sit outside it. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
