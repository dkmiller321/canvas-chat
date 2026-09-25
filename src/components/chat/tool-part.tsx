"use client";

import { getToolName, type UIMessage } from "ai";
import { AlertCircle, Check, Code2, Loader2, PenLine, Shapes } from "lucide-react";
import type { CreateDiagramOutput, CreateDocumentOutput } from "@/lib/tools";
import { useCanvasActions } from "./canvas-actions";

type ToolPart = Extract<UIMessage["parts"][number], { toolCallId: string }>;

const LABELS: Record<string, { running: string; done: string; failed: string }> = {
  create_document: { running: "Writing document…", done: "Document created", failed: "Creating the document failed" },
  create_code: { running: "Writing code…", done: "Code created", failed: "Creating the code failed" },
  edit_document: { running: "Editing document…", done: "Document updated", failed: "Editing the document failed" },
  create_diagram: { running: "Drawing diagram…", done: "Diagram created", failed: "Creating the diagram failed" },
  update_diagram: { running: "Updating diagram…", done: "Diagram updated", failed: "Updating the diagram failed" },
};

/** Inline tool activity (C7) plus, for created artifacts, a card that reopens the canvas (A4). */
const CODE_EDIT = { running: "Editing code…", done: "Code updated", failed: "Editing the code failed" };

export function ToolPartView({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const { kinds } = useCanvasActions();
  const target = (part.input as { artifact_id?: string } | undefined)?.artifact_id;
  const labels =
    name === "edit_document" && target && kinds.get(target) === "code"
      ? CODE_EDIT
      : (LABELS[name] ?? { running: `Running ${name}…`, done: `${name} done`, failed: `${name} failed` });
  const state = part.state;
  const failed = state === "output-error";
  const done = state === "output-available";

  return (
    <div className="my-2 flex flex-col gap-2">
      <div
        data-testid="tool-status"
        role="status"
        className={
          failed
            ? "flex items-start gap-2 text-sm text-destructive"
            : "flex items-center gap-2 text-sm text-muted-foreground"
        }
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
      {done && (name === "create_document" || name === "create_diagram" || name === "create_code") && (
        <ArtifactCard
          output={part.output as CreateDocumentOutput | CreateDiagramOutput}
          kind={name === "create_document" ? "document" : name === "create_code" ? "code" : "diagram"}
        />
      )}
    </div>
  );
}

function ArtifactCard({
  output,
  kind,
}: {
  output: { artifactId: string; title: string };
  kind: "document" | "diagram" | "code";
}) {
  const { openArtifact, kinds } = useCanvasActions();
  const Icon = kind === "document" ? PenLine : kind === "code" ? Code2 : Shapes;
  const deleted = !kinds.has(output.artifactId);
  const label = kind === "document" ? "Document" : kind === "code" ? "Code" : "Diagram";
  return (
    <button
      type="button"
      data-testid="artifact-card"
      data-artifact-id={output.artifactId}
      disabled={deleted}
      onClick={() => openArtifact(output.artifactId)}
      className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-60 disabled:hover:bg-card"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{output.title}</span>
        <span className="block text-xs text-muted-foreground">
          {label} · {deleted ? "deleted" : "click to open"}
        </span>
      </span>
    </button>
  );
}
