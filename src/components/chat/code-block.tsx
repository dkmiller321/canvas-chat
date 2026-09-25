"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

type Props = { code: string; language: string };

/** Fenced code block with Shiki highlighting (loaded lazily) and a copy button. */
export function CodeBlock({ code, language }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("shiki/bundle/web")
      .then(({ codeToHtml, bundledLanguages }) =>
        codeToHtml(code, {
          lang: language in bundledLanguages ? language : "text",
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        }),
      )
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        // Unknown grammar or failed chunk load: keep the plain rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div data-testid="code-block" className="not-prose my-3 overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between border-b px-3 py-1 text-xs text-muted-foreground">
        <span>{language || "text"}</span>
        <button
          type="button"
          data-testid="copy-code"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="rounded p-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {html ? (
        <div className="shiki-wrap overflow-x-auto p-3 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-3 text-sm">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
