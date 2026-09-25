"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sceneMermaid } from "@/lib/diagram-client";

type Props = {
  content: string;
  disabled: boolean;
  /** Redraw from source; resolves to an error message, or null on success. */
  onApply: (mermaid: string) => Promise<string | null>;
  onClose: () => void;
};

/** View and edit the Mermaid a diagram was drawn from (G8). Applying redraws it as a new version. */
export function MermaidSourcePanel({ content, disabled, onApply, onClose }: Props) {
  const [source, setSource] = useState(() => sceneMermaid(content));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <aside
      aria-label="Mermaid source"
      className="absolute top-3 right-3 bottom-3 z-20 flex w-[340px] flex-col gap-2 rounded-xl border bg-popover p-3 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Mermaid source</h3>
        <Button variant="ghost" size="icon-sm" aria-label="Close source" onClick={onClose}>
          <X />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Applying redraws the diagram from this source as a new version. Manual changes since then are replaced; earlier
        versions stay in the history.
      </p>
      <textarea
        data-testid="mermaid-source"
        aria-label="Mermaid source code"
        value={source}
        spellCheck={false}
        placeholder={"flowchart LR\n  A[Start] --> B[Next]"}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className="min-h-0 flex-1 resize-none rounded-md border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        data-testid="mermaid-apply"
        disabled={disabled || busy || !source.trim()}
        onClick={async () => {
          setBusy(true);
          setError(await onApply(source));
          setBusy(false);
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Apply
      </Button>
    </aside>
  );
}
