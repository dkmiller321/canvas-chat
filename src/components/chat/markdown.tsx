"use client";

import { isValidElement, memo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const components: Components = {
  pre({ children }) {
    const code = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode }>) : null;
    const language = code?.props.className?.match(/language-([\w+-]+)/)?.[1] ?? "";
    return <CodeBlock code={textOf(code?.props.children ?? children).replace(/\n$/, "")} language={language} />;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

/** `className` defaults to chat typography; pass "" to inherit the surrounding document's. */
export const Markdown = memo(function Markdown({ text, className = "prose-chat" }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
