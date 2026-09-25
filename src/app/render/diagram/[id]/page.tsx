"use client";

import { use, useEffect, useRef, useState } from "react";

/**
 * Bare page that draws one diagram's current version as SVG. The server's export
 * Chromium loads it to embed diagrams in PDF, DOCX and Markdown exports (E4),
 * because Excalidraw's renderer needs a browser.
 */
export default function RenderDiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/artifacts/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      const artifact = (await res.json()) as { kind: string; currentVersion: { content: string } | null };
      if (artifact.kind !== "diagram" || !artifact.currentVersion) throw new Error("not a diagram");
      const scene = JSON.parse(artifact.currentVersion.content) as { elements: unknown[]; files?: unknown };
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const svg = await exportToSvg({
        elements: scene.elements as Parameters<typeof exportToSvg>[0]["elements"],
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportPadding: 16 },
        files: (scene.files ?? {}) as Parameters<typeof exportToSvg>[0]["files"],
      });
      if (cancelled || !ref.current) return;
      ref.current.replaceChildren(svg);
      setStatus("ready");
    })().catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div id="diagram-svg" ref={ref} data-status={status} style={{ display: "inline-block", background: "#fff" }} />
  );
}
