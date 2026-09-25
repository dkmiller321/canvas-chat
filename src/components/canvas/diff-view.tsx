"use client";

import { diffWords } from "diff";
import { cn } from "@/lib/utils";

/** Word-level diff between two versions of a document (PRD D9). */
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
        {parts.map((p, i) => (
          <span
            key={i}
            className={cn(
              p.added && "rounded-sm bg-added",
              p.removed && "rounded-sm bg-removed line-through decoration-1",
            )}
          >
            {p.added && <span className="sr-only">[added] </span>}
            {p.removed && <span className="sr-only">[removed] </span>}
            {p.value}
          </span>
        ))}
      </pre>
    </div>
  );
}
