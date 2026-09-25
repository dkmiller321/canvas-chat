import { TableKit } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { COFFEE_MARKDOWN } from "@/lib/llm/mock-scripts";
import { markdownToDocx } from "./docx";
import { parseMarkdown } from "./markdown";
import { markdownToHtml } from "./pdf";

const SAMPLE = `# Plan

Intro with **bold**, *italic*, \`code\` and a [link](https://example.com).

## Steps

1. First
2. Second
   - nested bullet

> A quote

\`\`\`ts
const answer = 42;
\`\`\`

| Name | Value |
| --- | --- |
| a | 1 |

---

Done.`;

describe("Markdown round-trip through the editor's extensions (PRD risk)", () => {
  const md = new MarkdownManager({ extensions: [StarterKit, TableKit] });

  for (const [name, source] of [
    ["coffee guide", COFFEE_MARKDOWN],
    ["mixed sample", SAMPLE],
  ] as const) {
    it(`is stable after one normalisation: ${name}`, () => {
      const once = md.serialize(md.parse(source));
      expect(md.serialize(md.parse(once))).toBe(once);
    });
  }

  it("leaves the coffee guide byte-identical", () => {
    expect(md.serialize(md.parse(COFFEE_MARKDOWN)).trim()).toBe(COFFEE_MARKDOWN);
  });
});

describe("exports", () => {
  it("parses headings for export", () => {
    const doc = parseMarkdown(COFFEE_MARKDOWN);
    expect(doc.content?.map((n) => n.type)).toEqual(["heading", "paragraph", "heading", "paragraph"]);
  });

  it("builds a DOCX zip", async () => {
    const buf = await markdownToDocx(SAMPLE, "Plan");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("renders HTML for PDF with an escaped title", () => {
    const html = markdownToHtml(COFFEE_MARKDOWN, "Coffee <Guide>");
    expect(html).toContain("<h2>Brewing</h2>");
    expect(html).toContain("<title>Coffee &lt;Guide&gt;</title>");
  });

  it("renders every block type and drops unsafe links", () => {
    const html = markdownToHtml(`${SAMPLE}\n\n[x](javascript:alert(1)) <script>`, "Plan");
    for (const tag of ["<h1>", "<strong>", "<em>", "<code>", '<a href="https://example.com">', "<ol>", "<ul>", "<blockquote>", "<pre><code>", "<table>", "<th>", "<hr>"]) {
      expect(html).toContain(tag);
    }
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });
});
