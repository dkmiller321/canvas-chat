"use client";

import { diffArrays, diffWords } from "diff";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

/** Split Markdown into top-level blocks (paragraphs, headings, lists, fences). */
function blocks(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}(?=(?:[^`]*`[^`]*`)*[^`]*$)/)
    .map((b) => b.trim())
    .filter(Boolean);
}

const HEADING = /^(#{1,6})\s+/;

/** A changed block: word-level highlights, keeping the heading level when there is one. */
function ChangedBlock({ before, after }: { before: string; after: string }) {
  const level = after.match(HEADING)?.[1]?.length ?? before.match(HEADING)?.[1]?.length;
  const parts = diffWords(before.replace(HEADING, ""), after.replace(HEADING, ""));
  const body = parts.map((p, i) => (
    <span
      key={i}
      className={cn(p.added && "rounded-sm bg-added", p.removed && "rounded-sm bg-removed line-through decoration-1")}
    >
      {p.added && <span className="sr-only">[added] </span>}
      {p.removed && <span className="sr-only">[removed] </span>}
      {p.value}
    </span>
  ));
  if (level === 1) return <h1>{body}</h1>;
  if (level === 2) return <h2>{body}</h2>;
  if (level) return <h3>{body}</h3>;
  return <p className="whitespace-pre-wrap">{body}</p>;
}

/**
 * What changed from the previous version (PRD D9), rendered as the formatted
 * document: unchanged blocks as they are, edited blocks with word highlights,
 * whole added or removed blocks marked in the margin.
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const changes = diffArrays(blocks(before), blocks(after));
  const out: React.ReactNode[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      // Pair edited blocks one-to-one; extra blocks on either side are whole additions/removals.
      const n = Math.max(change.value.length, next.value.length);
      for (let j = 0; j < n; j++) {
        const b = change.value[j];
        const a = next.value[j];
        if (b !== undefined && a !== undefined) out.push(<ChangedBlock key={`${i}-${j}`} before={b} after={a} />);
        else if (a !== undefined) out.push(<Whole key={`${i}-${j}`} kind="added" text={a} />);
        else if (b !== undefined) out.push(<Whole key={`${i}-${j}`} kind="removed" text={b} />);
      }
      i++;
      continue;
    }
    for (const [j, text] of change.value.entries()) {
      out.push(
        change.added ? (
          <Whole key={`${i}-${j}`} kind="added" text={text} />
        ) : change.removed ? (
          <Whole key={`${i}-${j}`} kind="removed" text={text} />
        ) : (
          <Markdown key={`${i}-${j}`} text={text} className="" />
        ),
      );
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="doc-prose px-10 pt-10 pb-32" aria-label="Changes from the previous version">
        {out}
      </div>
    </div>
  );
}

function Whole({ kind, text }: { kind: "added" | "removed"; text: string }) {
  return (
    <div
      className={cn(
        "-ml-4 border-l-[3px] pl-[13px]",
        kind === "added" ? "border-emerald-500 bg-added/40" : "border-rose-500 bg-removed/40 line-through decoration-1",
      )}
    >
      <span className="sr-only">{kind === "added" ? "[added block] " : "[removed block] "}</span>
      <Markdown text={text} className="" />
    </div>
  );
}
