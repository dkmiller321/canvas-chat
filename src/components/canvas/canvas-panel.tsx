"use client";

import { Download, FileDiff, History, Loader2, PenLine, Shapes, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUICK_ACTIONS, quickActionInstruction } from "@/lib/llm/rewrite-prompt";
import { cn, slugify } from "@/lib/utils";
import { Markdown } from "@/components/chat/markdown";
import { DiffView } from "./diff-view";
import { DocumentEditor, type DocumentEditorHandle } from "./document-editor";
import type { DiagramEditorHandle } from "./diagram-editor";
import type { Canvas } from "./use-canvas";

// Excalidraw is large and browser-only: load it when a diagram opens (PRD risk: bundle size).
const DiagramEditor = dynamic(() => import("./diagram-editor").then((m) => m.DiagramEditor), {
  ssr: false,
  loading: () => <CenteredSpinner label="Loading diagram editor" />,
});

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">
      <Loader2 className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

type Props = { canvas: Canvas; chatBusy: boolean; model: string };

export function CanvasPanel({ canvas, chatBusy, model }: Props) {
  const { artifacts, doc, preview, openId, error, rewriting } = canvas;
  const docEditor = useRef<DocumentEditorHandle>(null);
  const diagramEditor = useRef<DiagramEditorHandle>(null);
  const [showDiff, setShowDiff] = useState(false);

  const artifact = doc?.artifact;
  const current = artifact?.currentVersion;
  const viewing = doc?.viewing ?? null;
  const shownNo = viewing ?? current?.versionNo ?? 0;
  const editable = Boolean(doc) && viewing === null && !chatBusy && !rewriting;
  const previous = doc?.versions.find((v) => v.versionNo === shownNo - 1);
  const title = artifact?.title ?? preview?.title ?? artifacts.find((a) => a.id === openId)?.title ?? "";

  async function exportAs(format: "md" | "pdf" | "docx" | "png" | "svg" | "excalidraw") {
    if (!artifact) return;
    const base = slugify(artifact.title);
    if (format === "md" || format === "pdf" || format === "docx") {
      await canvas.flush();
      downloadUrl(`/api/artifacts/${artifact.id}/export?format=${format}`);
      return;
    }
    const editor = diagramEditor.current;
    if (!editor) return;
    if (format === "png") saveBlob(await editor.exportPng(), `${base}.png`);
    if (format === "svg") saveBlob(new Blob([await editor.exportSvg()], { type: "image/svg+xml" }), `${base}.svg`);
    if (format === "excalidraw") {
      saveBlob(new Blob([editor.exportJson()], { type: "application/json" }), `${base}.excalidraw`);
    }
  }

  function quickAction(id: (typeof QUICK_ACTIONS)[number]["id"]) {
    canvas.rewrite({
      instruction: quickActionInstruction(id),
      selectedText: docEditor.current?.selectionMarkdown() ?? null,
      mode: "quick",
      model,
    });
  }

  return (
    <section
      data-testid="canvas-panel"
      aria-label="Canvas"
      className="flex h-full min-w-0 flex-1 flex-col border-l bg-background"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <div data-testid="artifact-switcher" role="tablist" aria-label="Artifacts" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {artifacts.map((a) => (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={a.id === openId}
              onClick={() => canvas.openArtifact(a.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                a.id === openId ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {a.kind === "document" ? <PenLine className="size-3.5" /> : <Shapes className="size-3.5" />}
              {a.title}
            </button>
          ))}
        </div>
        <Button data-testid="canvas-close" variant="ghost" size="icon-sm" aria-label="Close canvas" onClick={canvas.closePanel}>
          <X />
        </Button>
      </div>

      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <h2 data-testid="doc-title" className="mr-auto truncate text-base font-semibold">
          {title}
        </h2>
        {doc && (
          <>
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              <History className="size-4" aria-hidden />
              <span className="sr-only">Version</span>
              <select
                data-testid="version-switcher"
                value={String(shownNo)}
                onChange={(e) => canvas.viewVersion(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                {[...doc.versions].reverse().map((v) => (
                  <option key={v.versionNo} value={String(v.versionNo)} data-version-no={v.versionNo}>
                    v{v.versionNo} · {v.author === "ai" ? "AI" : "You"}
                    {v.versionNo === current?.versionNo ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {viewing !== null && (
              <Button data-testid="version-restore" size="sm" variant="secondary" onClick={() => canvas.restoreViewed()}>
                Restore this version
              </Button>
            )}
            {artifact?.kind === "document" && (
              <>
                <Button
                  size="sm"
                  variant={showDiff ? "secondary" : "ghost"}
                  aria-pressed={showDiff}
                  disabled={!previous}
                  onClick={() => setShowDiff((s) => !s)}
                  title="Show what changed from the previous version"
                >
                  <FileDiff /> Changes
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="quick-actions" size="sm" variant="ghost" disabled={!editable}>
                      <Sparkles /> Quick actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Applies to the selection, or the whole document</DropdownMenuLabel>
                    {QUICK_ACTIONS.map((a) => (
                      <DropdownMenuItem key={a.id} data-testid={`quick-action-${a.id}`} onSelect={() => quickAction(a.id)}>
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="export-menu" size="sm" variant="ghost">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {artifact?.kind === "document" ? (
                  <>
                    <DropdownMenuItem data-testid="export-md" onSelect={() => exportAs("md")}>
                      Markdown (.md)
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="export-pdf" onSelect={() => exportAs("pdf")}>
                      PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="export-docx" onSelect={() => exportAs("docx")}>
                      Word (.docx)
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem data-testid="export-png" onSelect={() => exportAs("png")}>
                      PNG image
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="export-svg" onSelect={() => exportAs("svg")}>
                      SVG image
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem data-testid="export-excalidraw" onSelect={() => exportAs("excalidraw")}>
                      Excalidraw (.excalidraw)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {(error || rewriting || viewing !== null) && (
        <div className="shrink-0 border-b px-4 py-2 text-sm" role={error ? "alert" : "status"}>
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : rewriting ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Rewriting…
            </span>
          ) : (
            <span className="text-muted-foreground">Viewing version {viewing} (read-only). Restore it to continue editing from here.</span>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {preview && !doc ? (
          <div className="h-full overflow-y-auto px-8 py-6" aria-busy="true">
            <Markdown text={preview.markdown} />
          </div>
        ) : !doc ? (
          <CenteredSpinner label="Loading" />
        ) : artifact?.kind === "document" ? (
          showDiff && previous ? (
            <DiffView before={previous.content} after={doc.content} />
          ) : (
            <DocumentEditor
              key={artifact.id}
              ref={docEditor}
              content={doc.content}
              contentKey={doc.contentKey}
              editable={editable}
              onUserChange={canvas.onUserChange}
              onAskAi={(selectedText, instruction) =>
                canvas.rewrite({ instruction, selectedText, mode: "ask", model })
              }
            />
          )
        ) : (
          <DiagramEditor
            key={artifact?.id}
            handleRef={diagramEditor}
            content={doc.content}
            contentKey={doc.contentKey}
            editable={editable}
            onUserChange={canvas.onUserChange}
          />
        )}
      </div>
    </section>
  );
}
