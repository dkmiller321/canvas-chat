"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Code2,
  Copy,
  Download,
  FileCode,
  FileDiff,
  GitBranch,
  LayoutDashboard,
  Palette,
  ListTree,
  Loader2,
  Pencil,
  PenLine,
  RotateCcw,
  Shapes,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CODE_LANGUAGES } from "@/lib/code-languages";
import {
  CODE_QUICK_ACTIONS,
  QUICK_ACTIONS,
  quickActionInstruction,
  type QuickActionId,
} from "@/lib/llm/rewrite-prompt";
import { cn, slugify } from "@/lib/utils";
import { Markdown } from "@/components/chat/markdown";
import { DiffView } from "./diff-view";
import { DocumentEditor, type DocumentEditorHandle } from "./document-editor";
import type { DiagramEditorHandle } from "./diagram-editor";
import type { Canvas } from "./use-canvas";

// CodeMirror and its language packs load only when a code artifact opens.
const CodeEditor = dynamic(() => import("./code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <CenteredSpinner label="Loading code editor" />,
});

// Excalidraw is large and browser-only: load it when a diagram opens (PRD risk: bundle size).
const DiagramEditor = dynamic(() => import("./diagram-editor").then((m) => m.DiagramEditor), {
  ssr: false,
  loading: () => <CenteredSpinner label="Loading diagram editor" />,
});

const STYLE_PRESETS = [
  { id: "colorful", label: "Colourful", hint: "Pastel fills, hand-drawn" },
  { id: "monochrome", label: "Monochrome", hint: "Black ink, no fills" },
  { id: "clean", label: "Clean", hint: "Flat, precise, sans-serif" },
  { id: "sketchy", label: "Sketchy", hint: "Rough lines, cross-hatch" },
] as const;

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

type Props = { canvas: Canvas; chatBusy: boolean; model: string; testHooks: boolean };

export function CanvasPanel({ canvas, chatBusy, model, testHooks }: Props) {
  const { artifacts, doc, preview, openId, error, rewriting, saveState } = canvas;
  const docEditor = useRef<DocumentEditorHandle>(null);
  const diagramEditor = useRef<DiagramEditorHandle>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [copied, setCopied] = useState(false);
  /** Raw-Markdown view (D12): the text being edited, or null when the rich editor is shown. */
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [outline, setOutline] = useState<"auto" | "show" | "hide">("auto");
  const [words, setWords] = useState(0);

  // Leaving an artifact leaves its source view and any open rename.
  const artifactId = doc?.artifact.id;
  useEffect(() => {
    setSourceText(null);
    setRenaming(false);
  }, [artifactId]);

  async function toggleSource() {
    if (sourceText === null) {
      setShowDiff(false);
      setSourceText(await canvas.currentText());
      return;
    }
    await canvas.reloadOpen();
    setSourceText(null);
  }

  const artifact = doc?.artifact;
  const current = artifact?.currentVersion;
  const versions = doc?.versions ?? [];
  const viewing = doc?.viewing ?? null;
  const shownNo = viewing ?? current?.versionNo ?? 0;
  const latestNo = current?.versionNo ?? 0;
  const editable = Boolean(doc) && viewing === null && !chatBusy && !rewriting;
  const previous = versions.find((v) => v.versionNo === shownNo - 1);
  const shown = versions.find((v) => v.versionNo === shownNo);
  const title = artifact?.title ?? preview?.title ?? artifacts.find((a) => a.id === openId)?.title ?? "";
  const isDocument = (artifact?.kind ?? (preview ? "document" : undefined)) === "document";

  async function exportAs(format: "md" | "pdf" | "docx" | "code" | "png" | "svg" | "excalidraw") {
    if (!artifact) return;
    const base = slugify(artifact.title);
    if (format === "md" || format === "pdf" || format === "docx" || format === "code") {
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

  function quickAction(id: QuickActionId) {
    canvas.rewrite({
      instruction: quickActionInstruction(id),
      selectedText: docEditor.current?.selectionMarkdown() ?? null,
      mode: "quick",
      model,
    });
  }

  const status = !doc
    ? preview
      ? { icon: <Loader2 className="size-3 animate-spin" />, text: "Writing…" }
      : null
    : rewriting
      ? { icon: <Loader2 className="size-3 animate-spin" />, text: "Rewriting…" }
      : chatBusy
        ? { icon: <Loader2 className="size-3 animate-spin" />, text: "AI is working — editing paused" }
        : viewing !== null
          ? { icon: <RotateCcw className="size-3" />, text: `Viewing version ${viewing} (read-only)` }
          : saveState === "saving"
            ? { icon: <Loader2 className="size-3 animate-spin" />, text: "Saving…" }
            : saveState === "unsaved"
              ? { icon: <span className="size-1.5 rounded-full bg-amber-500" />, text: "Unsaved changes" }
              : {
                  icon: <Check className="size-3" />,
                  text: `Saved · ${shown?.author === "ai" ? "AI" : "You"}${shown ? `, ${new Date(shown.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`,
                };

  return (
    <section
      data-testid="canvas-panel"
      aria-label="Canvas"
      className="relative flex h-full min-w-0 flex-1 flex-col bg-background"
    >
      {/* Tabs for every artifact in the conversation, plus close. */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b bg-muted/30 px-2">
        <div
          data-testid="artifact-switcher"
          role="tablist"
          aria-label="Artifacts"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {artifacts.map((a) => (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={a.id === openId}
              data-artifact-id={a.id}
              onClick={() => canvas.openArtifact(a.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                a.id === openId
                  ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              {a.kind === "document" ? (
                <PenLine className="size-3.5" />
              ) : a.kind === "code" ? (
                <Code2 className="size-3.5" />
              ) : (
                <Shapes className="size-3.5" />
              )}
              {a.title}
            </button>
          ))}
        </div>
        <Button
          data-testid="canvas-close"
          variant="ghost"
          size="icon-sm"
          aria-label="Close canvas"
          onClick={canvas.closePanel}
        >
          <X />
        </Button>
      </div>

      {/* Title, save status, version navigation (Open Canvas layout). */}
      <header className="flex shrink-0 items-start gap-4 px-6 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setRenaming(false);
                void canvas.renameOpen(titleDraft);
              }}
            >
              <input
                data-testid="artifact-title-input"
                aria-label="Title"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setRenaming(false);
                  if (titleDraft.trim() && titleDraft.trim() !== title) void canvas.renameOpen(titleDraft);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full rounded-md border bg-background px-2 py-0.5 text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </form>
          ) : (
            <div className="group/title flex min-w-0 items-center gap-1">
              <h2 data-testid="doc-title" className="truncate text-xl font-semibold tracking-tight">
                {title}
              </h2>
              {doc && (
                <Button
                  data-testid="artifact-rename"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rename"
                  title="Rename"
                  className="opacity-40 group-hover/title:opacity-100 focus-visible:opacity-100"
                  onClick={() => {
                    setTitleDraft(title);
                    setRenaming(true);
                  }}
                >
                  <Pencil />
                </Button>
              )}
            </div>
          )}
          {status && (
            <p
              className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-muted-foreground"
              role="status"
            >
              {status.icon}
              {status.text}
              {isDocument && doc && (
                <span data-testid="doc-stats">
                  · {words} {words === 1 ? "word" : "words"} · {Math.max(1, Math.round(words / 220))} min read
                </span>
              )}
            </p>
          )}
        </div>

        {doc && (
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            {artifact?.kind === "code" && (
              <label className="mr-1">
                <span className="sr-only">Language</span>
                <select
                  data-testid="code-language"
                  value={artifact.language ?? "text"}
                  onChange={(e) => void canvas.setLanguage(e.target.value)}
                  className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {CODE_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous version"
              disabled={shownNo <= 1}
              onClick={() => canvas.viewVersion(shownNo - 1)}
            >
              <ChevronLeft />
            </Button>
            <label className="relative">
              <span className="sr-only">Version</span>
              <select
                data-testid="version-switcher"
                value={String(shownNo)}
                onChange={(e) => canvas.viewVersion(Number(e.target.value))}
                className="h-7 cursor-pointer appearance-none rounded-md bg-transparent px-1.5 text-center text-sm tabular-nums text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                title="Version history"
              >
                {[...versions].reverse().map((v) => (
                  <option key={v.versionNo} value={String(v.versionNo)} data-version-no={v.versionNo}>
                    {v.versionNo} / {latestNo} · {v.author === "ai" ? "AI" : "You"}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next version"
              disabled={shownNo >= latestNo}
              onClick={() => canvas.viewVersion(shownNo + 1)}
            >
              <ChevronRight />
            </Button>

            <span className="mx-1 h-5 w-px bg-border" aria-hidden />

            {isDocument && (
              <Button
                size="icon-sm"
                variant={showDiff ? "secondary" : "ghost"}
                aria-pressed={showDiff}
                aria-label="Show changes from the previous version"
                title="Changes"
                disabled={!previous}
                onClick={() => setShowDiff((s) => !s)}
              >
                <FileDiff />
              </Button>
            )}
            {isDocument && (
              <Button
                size="icon-sm"
                variant={outline === "show" ? "secondary" : "ghost"}
                aria-pressed={outline === "show"}
                aria-label="Outline"
                title="Outline"
                onClick={() => setOutline((o) => (o === "show" ? "hide" : "show"))}
              >
                <ListTree />
              </Button>
            )}
            {isDocument && (
              <Button
                data-testid="view-markdown"
                size="icon-sm"
                variant={sourceText !== null ? "secondary" : "ghost"}
                aria-pressed={sourceText !== null}
                aria-label="Edit as Markdown"
                title="Markdown source"
                disabled={!editable && sourceText === null}
                onClick={toggleSource}
              >
                <FileCode />
              </Button>
            )}
            {artifact?.kind !== "diagram" && (
              <Button
                data-testid="copy-markdown"
                size="icon-sm"
                variant="ghost"
                aria-label={copied ? "Copied" : "Copy to clipboard"}
                title="Copy"
                onClick={async () => {
                  await navigator.clipboard.writeText(await canvas.currentText());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            )}
            <Button
              data-testid="version-branch"
              size="icon-sm"
              variant="ghost"
              aria-label={`Branch a copy from version ${shownNo}`}
              title={`Branch a copy from version ${shownNo}`}
              onClick={() => canvas.branchShown()}
            >
              <GitBranch />
            </Button>
            {artifact?.kind === "diagram" && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      data-testid="diagram-style-menu"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Diagram style"
                      title="Style"
                      disabled={!editable}
                    >
                      <Palette />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Restyle the whole diagram</DropdownMenuLabel>
                    {STYLE_PRESETS.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        data-testid={`style-${p.id}`}
                        onSelect={() => diagramEditor.current?.applyPreset(p.id)}
                      >
                        <span className="flex flex-col">
                          <span>{p.label}</span>
                          <span className="text-xs text-muted-foreground">{p.hint}</span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  data-testid="diagram-tidy"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Tidy up layout"
                  title="Tidy up layout"
                  disabled={!editable}
                  onClick={() => diagramEditor.current?.tidy()}
                >
                  <LayoutDashboard />
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="artifact-delete" size="icon-sm" variant="ghost" aria-label="Delete" title="Delete">
                  <Trash2 />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Delete “{title}” and all its versions?</DropdownMenuLabel>
                <DropdownMenuItem
                  data-testid="artifact-delete-confirm"
                  className="text-destructive data-[highlighted]:text-destructive"
                  onSelect={() => void canvas.deleteOpen()}
                >
                  <Trash2 /> Delete permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="export-menu" size="icon-sm" variant="ghost" aria-label="Export" title="Export">
                  <Download />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                {artifact?.kind === "code" ? (
                  <DropdownMenuItem data-testid="export-code" onSelect={() => exportAs("code")}>
                    Source file
                  </DropdownMenuItem>
                ) : artifact?.kind === "document" ? (
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
          </div>
        )}
      </header>

      {(error || viewing !== null) && (
        <div
          className={cn(
            "mx-6 mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
            error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
          role={error ? "alert" : "status"}
        >
          {error ? (
            <>
              <CircleAlert className="size-4 shrink-0" /> {error}
            </>
          ) : (
            <>
              <span className="flex-1">This is version {viewing}. Restore it to keep editing from here.</span>
              <Button data-testid="version-restore" size="sm" variant="outline" onClick={() => canvas.restoreViewed()}>
                <RotateCcw /> Restore this version
              </Button>
            </>
          )}
        </div>
      )}

      <div className="@container relative min-h-0 flex-1 border-t">
        {preview && !doc ? (
          <div className="h-full overflow-y-auto" aria-busy="true">
            <div className="doc-prose px-10 pt-10 pb-32">
              <Markdown text={preview.markdown} className="" />
            </div>
          </div>
        ) : !doc && !openId ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
            <p>No artifact is open.</p>
            <p>Ask for a document or diagram, or use New in the chat header.</p>
          </div>
        ) : !doc ? (
          <CenteredSpinner label="Loading" />
        ) : artifact?.kind === "document" && sourceText !== null ? (
          <textarea
            data-testid="markdown-source"
            aria-label="Markdown source"
            value={sourceText}
            spellCheck={false}
            onChange={(e) => {
              const value = e.target.value;
              setSourceText(value);
              canvas.onUserChange(() => value);
            }}
            className="h-full w-full resize-none bg-muted/30 px-10 pt-8 pb-32 font-mono text-sm leading-relaxed outline-none"
          />
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
              onAskAi={(selectedText, instruction) => canvas.rewrite({ instruction, selectedText, mode: "ask", model })}
              outline={outline}
              onWordCount={setWords}
              diagrams={artifacts.filter((a) => a.kind === "diagram").map((a) => ({ id: a.id, title: a.title }))}
            />
          )
        ) : artifact?.kind === "code" ? (
          <CodeEditor
            key={artifact.id}
            content={doc.content}
            contentKey={doc.contentKey}
            language={artifact.language ?? "text"}
            editable={editable}
            onUserChange={canvas.onUserChange}
          />
        ) : (
          <DiagramEditor
            key={artifact?.id}
            handleRef={diagramEditor}
            content={doc.content}
            contentKey={doc.contentKey}
            editable={editable}
            onUserChange={canvas.onUserChange}
            onAskAi={(ids, instruction) => void canvas.rewriteDiagram(ids, instruction, model)}
            testHook={testHooks}
          />
        )}

        {/* Floating quick actions, bottom-right like Open Canvas. */}
        {doc && artifact?.kind !== "diagram" && !showDiff && sourceText === null && (
          <div className="absolute right-5 bottom-5 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="quick-actions"
                  size="icon"
                  variant="outline"
                  disabled={!editable}
                  aria-label="Quick actions"
                  title="Quick actions"
                  className="size-11 rounded-full bg-background shadow-lg"
                >
                  {rewriting ? <Loader2 className="animate-spin" /> : <WandSparkles className="text-ai" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-60">
                <DropdownMenuLabel>
                  {artifact?.kind === "code"
                    ? "Applies to the whole file"
                    : "Applies to the selection, or the whole document"}
                </DropdownMenuLabel>
                {(artifact?.kind === "code" ? CODE_QUICK_ACTIONS : QUICK_ACTIONS).map((a) => (
                  <DropdownMenuItem key={a.id} data-testid={`quick-action-${a.id}`} onSelect={() => quickAction(a.id)}>
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </section>
  );
}
