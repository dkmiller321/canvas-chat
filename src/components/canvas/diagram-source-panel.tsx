"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type DiagramSource, sceneSource } from "@/lib/diagram-client";
import { DIAGRAM_LANGUAGES, type DiagramLanguage, LANGUAGE_LABELS } from "@/lib/diagram-formats";

type Props = {
  content: string;
  disabled: boolean;
  /** Redraw from source; resolves to an error message, or null on success. */
  onApply: (source: DiagramSource) => Promise<string | null>;
  onClose: () => void;
};

const EXAMPLES: Record<DiagramLanguage, string> = {
  mermaid: "flowchart LR\n  A[Start] --> B[Next]",
  graph:
    '{\n  "nodes": [{ "id": "a", "label": "Start" }, { "id": "b", "label": "Next" }],\n  "edges": [{ "from": "a", "to": "b" }]\n}',
  dot: 'digraph {\n  rankdir=LR;\n  a [label="Start"];\n  a -> b;\n}',
  plantuml: "@startuml\n[Start] --> [Next]\n@enduml",
  d2: "a: Start\nb: Next\na -> b",
};

/** View and edit the source a diagram was drawn from, in any supported language (G8, G10). Applying redraws it. */
export function DiagramSourcePanel({ content, disabled, onApply, onClose }: Props) {
  const initial = sceneSource(content);
  const [language, setLanguage] = useState<DiagramLanguage>(initial?.language ?? "mermaid");
  const [code, setCode] = useState(initial?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <aside
      aria-label="Diagram source"
      className="absolute top-3 right-3 bottom-3 z-20 flex w-[360px] flex-col gap-2 rounded-xl border bg-popover p-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Diagram source</h3>
        <select
          data-testid="source-language"
          aria-label="Source language"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value as DiagramLanguage);
            setError(null);
          }}
          className="ml-auto h-7 rounded-md border bg-background px-2 text-xs"
        >
          {DIAGRAM_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
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
        aria-label={`${LANGUAGE_LABELS[language]} source code`}
        value={code}
        spellCheck={false}
        placeholder={EXAMPLES[language]}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className="min-h-0 flex-1 resize-none rounded-md border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="text-xs whitespace-pre-wrap text-destructive">
          {error}
        </p>
      )}
      <Button
        data-testid="mermaid-apply"
        disabled={disabled || busy || !code.trim()}
        onClick={async () => {
          setBusy(true);
          setError(await onApply({ language, code }));
          setBusy(false);
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Apply
      </Button>
    </aside>
  );
}
