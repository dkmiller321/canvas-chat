import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col border-r bg-sidebar p-3">
        <Button data-testid="new-chat" variant="outline">
          New chat
        </Button>
      </aside>
      <main className="flex flex-1 flex-col justify-end p-4">
        <textarea
          data-testid="chat-input"
          aria-label="Message"
          className="min-h-20 w-full resize-none rounded-lg border bg-background p-3"
          placeholder="Send a message"
        />
      </main>
    </div>
  );
}
