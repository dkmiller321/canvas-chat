import type { JSONContent } from "@tiptap/core";
import type { DiagramImage } from "./diagram-images";
import { parseMarkdown } from "./markdown";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const SAFE_URL = /^(https?:|mailto:|#|\/)/i;

function inline(node: JSONContent): string {
  if (node.type === "hardBreak") return "<br>";
  if (node.type !== "text") return (node.content ?? []).map(inline).join("");
  let out = escape(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = `<strong>${out}</strong>`;
    else if (mark.type === "italic") out = `<em>${out}</em>`;
    else if (mark.type === "strike") out = `<s>${out}</s>`;
    else if (mark.type === "underline") out = `<u>${out}</u>`;
    else if (mark.type === "code") out = `<code>${out}</code>`;
    else if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "");
      if (SAFE_URL.test(href)) out = `<a href="${escape(href)}">${out}</a>`;
    }
  }
  return out;
}

function block(node: JSONContent, diagrams: Map<string, DiagramImage>): string {
  const children = () => (node.content ?? []).map((n) => block(n, diagrams)).join("");
  const text = () => (node.content ?? []).map(inline).join("");
  switch (node.type) {
    case "doc":
      return children();
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `<h${level}>${text()}</h${level}>`;
    }
    case "paragraph":
      return `<p>${text()}</p>`;
    case "bulletList":
      return `<ul>${children()}</ul>`;
    case "orderedList":
      return `<ol>${children()}</ol>`;
    case "listItem":
      return `<li>${children()}</li>`;
    case "blockquote":
      return `<blockquote>${children()}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escape((node.content ?? []).map((t) => t.text ?? "").join(""))}</code></pre>`;
    case "horizontalRule":
      return "<hr>";
    case "taskList":
      return `<ul class="tasks">${children()}</ul>`;
    case "taskItem":
      return `<li><span class="box">${node.attrs?.checked ? "☑" : "☐"}</span><div>${children()}</div></li>`;
    case "diagramEmbed": {
      const title = escape(String(node.attrs?.title ?? "Diagram"));
      const image = diagrams.get(String(node.attrs?.id));
      if (!image) return `<p class="diagram-missing">[Diagram: ${title}]</p>`;
      const src = `data:image/svg+xml;base64,${Buffer.from(image.svg).toString("base64")}`;
      return `<figure class="diagram"><img src="${src}" alt="${title}"><figcaption>${title}</figcaption></figure>`;
    }
    case "table":
      return `<table>${children()}</table>`;
    case "tableRow":
      return `<tr>${children()}</tr>`;
    case "tableHeader":
      return `<th>${children()}</th>`;
    case "tableCell":
      return `<td>${children()}</td>`;
    default:
      return node.content ? children() : inline(node);
  }
}

/** Markdown → HTML body, parsed with the editor's own Markdown extensions. */
export function markdownToHtmlBody(markdown: string, diagrams = new Map<string, DiagramImage>()): string {
  return block(parseMarkdown(markdown), diagrams);
}

export { escape as escapeHtml };
