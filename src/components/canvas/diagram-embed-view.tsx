"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ExternalLink, Loader2, Shapes } from "lucide-react";
import { useEffect, useState } from "react";
import { useCanvasActions } from "@/components/chat/canvas-actions";
import { DiagramEmbedNode } from "@/lib/diagram-embed";
import { cn } from "@/lib/utils";

type State = { svg: string } | { error: string } | null;

/** Renders an embedded diagram's current version as SVG, refreshing when the diagram changes (E4). */
function DiagramEmbedView({ node, selected }: NodeViewProps) {
  const id = String(node.attrs.id);
  const title = String(node.attrs.title ?? "Diagram");
  const { openArtifact, kinds, versions } = useCanvasActions();
  const version = versions.get(id);
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/artifacts/${id}`);
      if (!res.ok)
        throw new Error(res.status === 404 ? "This diagram was deleted." : `Could not load (${res.status}).`);
      const artifact = (await res.json()) as { currentVersion: { content: string } | null };
      if (!artifact.currentVersion) throw new Error("The diagram is still being drawn.");
      const scene = JSON.parse(artifact.currentVersion.content) as { elements: unknown[]; files?: unknown };
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const svg = await exportToSvg({
        elements: scene.elements as Parameters<typeof exportToSvg>[0]["elements"],
        appState: { exportBackground: false, exportPadding: 16 },
        files: (scene.files ?? {}) as Parameters<typeof exportToSvg>[0]["files"],
      });
      svg.removeAttribute("height");
      svg.setAttribute("width", "100%");
      svg.style.maxHeight = "480px";
      if (!cancelled) setState({ svg: svg.outerHTML });
    })().catch((e: unknown) => {
      if (!cancelled) setState({ error: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  return (
    <NodeViewWrapper
      data-diagram-id={id}
      className={cn(
        "group relative my-6 overflow-hidden rounded-xl border bg-white not-italic",
        selected && "ring-2 ring-primary",
      )}
      contentEditable={false}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 font-sans text-xs text-muted-foreground">
        <Shapes className="size-3.5" aria-hidden />
        <span className="truncate font-medium">{title}</span>
        {kinds.has(id) && (
          <button
            type="button"
            onClick={() => openArtifact(id)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
          >
            <ExternalLink className="size-3" /> Open
          </button>
        )}
      </div>
      {state === null ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Rendering diagram…
        </div>
      ) : "error" in state ? (
        <p className="px-4 py-6 font-sans text-sm text-muted-foreground">{state.error}</p>
      ) : (
        // The test id marks the drawing itself, not the card's header icons.
        <div
          data-testid="diagram-embed"
          className="flex justify-center p-2"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const DiagramEmbed = DiagramEmbedNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DiagramEmbedView);
  },
});
