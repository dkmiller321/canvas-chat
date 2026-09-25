"use client";

import { useRef, useState } from "react";

const MIN = 0.25;
const MAX = 0.75;

/**
 * Chat on the left, canvas on the right, with a draggable (and keyboard-adjustable) divider (PRD D1).
 * The left pane keeps its place in the tree when `right` is null, so closing the canvas never remounts the chat.
 */
export function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode | null }) {
  const [split, setSplit] = useState(0.42);
  const containerRef = useRef<HTMLDivElement>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    setSplit(Math.min(MAX, Math.max(MIN, (e.clientX - box.left) / box.width)));
  }

  return (
    <div ref={containerRef} className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0" style={{ width: right ? `${split * 100}%` : "100%" }}>
        {left}
      </div>
      {right && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat and canvas"
            aria-valuemin={MIN * 100}
            aria-valuemax={MAX * 100}
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSplit((s) => Math.max(MIN, s - 0.02));
              if (e.key === "ArrowRight") setSplit((s) => Math.min(MAX, s + 0.02));
            }}
            className="w-1.5 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none"
          />
          <div className="flex h-full min-w-0 flex-1">{right}</div>
        </>
      )}
    </div>
  );
}
