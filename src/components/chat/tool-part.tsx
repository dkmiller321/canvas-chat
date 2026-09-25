"use client";

import { getToolName, type UIMessage } from "ai";
import { AlertCircle, Check, Loader2, PenLine, Shapes } from "lucide-react";
import type { CreateDiagramOutput, CreateDocumentOutput } from "@/lib/tools";
import { useCanvasActions } from "./canvas-actions";

type ToolPart = Extract<UIMessage["parts"][number], { toolCallId: string }>;

const LABELS: Record<string, { running: string; done: string; failed: string }> = {
  create_document: { running: "Writing document…", done: "Document created", failed: "Creating the document failed" },
  edit_document: { running: "Editing document…", done: "Document updated", failed: "Editing the document failed" },
  create_diagram: { running: "Drawing diagram…", done: "Diagram created", failed: "Creating the diagram failed" },
  update_diagram: { running: "Updating diagram…", done: "Diagram updated", failed: "Updating the diagram failed" },
};

/** Inline tool activity (C7) plus, for created artifacts, a card that reopens the canvas (A4). */
export function ToolPartView({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const labels = LABELS[name] ?? { running: `Running ${name}…`, done: `${name} done`, failed: `${name} failed` };
  const state = part.state;
  const failed = state === "output-error";
  const done = state === "output-available";

  return (
    <div className="my-2 flex flex-col gap-2">
      <div
        data-testid="tool-status"
        role="status"
        className={failed ? "flex items-start gap-2 text-sm text-destructive" : "flex items-center gap-2 text-sm text-muted-foreground"}
      >
        {failed ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
        ) : done ? (
          <Check className="size-4 shrink-0" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        )}
        <span>
          {failed ? labels.failed : done ? labels.done : labels.running}
          {failed && "errorText" in part && part.errorText && (
            <span className="block text-xs opacity-80">{part.errorText}</span>
          )}
        </span>
      </div>
      {done && (name === "create_document" || name === "create_diagram") && (
        <ArtifactCard
          output={part.output as CreateDocumentOutput | CreateDiagramOutput}
          kind={name === "create_document" ? "document" : "diagram"}
        />
      )}
    </div>
  );
}

function ArtifactCard({ output, kind }: { output: { artifactId: string; title: string }; kind: "document" | "diagram" }) {
  const { openArtifact } = useCanvasActions();
  const Icon = kind === "document" ? PenLine : Shapes;
  return (
    <button
      type="button"
      data-testid="artifact-card"
      data-artifact-id={output.artifactId}
      onClick={() => openArtifact(output.artifactId)}
      className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{output.title}</span>
        <span className="block text-xs text-muted-foreground">{kind === "document" ? "Document" : "Diagram"} · click to open</span>
      </span>
    </button>
  );
}
