import { chromium, type Browser } from "playwright";
import type { DiagramImage } from "./diagram-images";
import { escapeHtml, markdownToHtmlBody } from "./html";

const STYLES = `
  @page { margin: 22mm 20mm; }
  body { font-family: "Source Serif 4", "Source Serif Pro", Georgia, "DejaVu Serif", serif; font-size: 11.5pt; line-height: 1.65; color: #1f2328; }
  h1, h2, h3, h4, th { font-family: Inter, "Segoe UI", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif; line-height: 1.25; }
  h1 { font-size: 24pt; margin: 0 0 14pt; letter-spacing: -0.01em; }
  h2 { font-size: 15pt; margin: 20pt 0 8pt; padding-bottom: 4pt; border-bottom: 1px solid #d8dee4; }
  h3 { font-size: 12.5pt; margin: 16pt 0 6pt; }
  p, ul, ol, pre, table, blockquote { margin: 0 0 9pt; }
  li + li { margin-top: 3pt; }
  li > p { margin: 0; }
  code { font-family: "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace; font-size: 0.85em; background: #f3f4f6; padding: 0.1em 0.35em; border-radius: 4px; }
  pre { background: #f6f8fa; border: 1px solid #e5e7eb; padding: 10pt 12pt; border-radius: 8px; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #8b9cf6; padding-left: 12pt; color: #57606a; font-style: italic; }
  table { border-collapse: collapse; width: 100%; font-family: Inter, "Segoe UI", "DejaVu Sans", Arial, sans-serif; font-size: 10pt; }
  th, td { border-bottom: 1px solid #d8dee4; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { border-bottom-width: 2px; }
  td p, th p { margin: 0; }
  hr { border: none; border-top: 1px solid #d8dee4; margin: 18pt 0; }
  a { color: #0969da; }
  figure.diagram { margin: 14pt 0; text-align: center; page-break-inside: avoid; }
  figure.diagram img { max-width: 100%; max-height: 180mm; }
  figure.diagram figcaption, .diagram-missing { font-family: Inter, "DejaVu Sans", Arial, sans-serif; font-size: 9pt; color: #57606a; margin-top: 4pt; }
  ul.tasks { list-style: none; padding-left: 4pt; }
  ul.tasks li::before { content: attr(data-box); margin-right: 6pt; }
`;

export function markdownToHtml(markdown: string, title: string, diagrams = new Map<string, DiagramImage>()): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head><body>${markdownToHtmlBody(markdown, diagrams)}</body></html>`;
}

// One headless Chromium for the process; launching per export is slow.
const globalForPdf = globalThis as unknown as { pdfBrowser?: Promise<Browser> };

export function exportBrowser(): Promise<Browser> {
  globalForPdf.pdfBrowser ??= chromium.launch({ headless: true }).catch((err: unknown) => {
    globalForPdf.pdfBrowser = undefined;
    throw err;
  });
  return globalForPdf.pdfBrowser;
}

export async function markdownToPdf(
  markdown: string,
  title: string,
  diagrams = new Map<string, DiagramImage>(),
): Promise<Buffer> {
  const context = await (await exportBrowser()).newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setContent(markdownToHtml(markdown, title, diagrams), { waitUntil: "load" });
    return await page.pdf({ format: "A4", preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}
