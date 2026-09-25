import { chromium, type Browser } from "playwright";
import { escapeHtml, markdownToHtmlBody } from "./html";

const STYLES = `
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 11pt; line-height: 1.55; color: #1f2328; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; }
  h1 { font-size: 22pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p, ul, ol, pre, table, blockquote { margin: 0 0 0.8em; }
  code { font-family: Consolas, "SFMono-Regular", monospace; font-size: 0.9em; background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f3f4f6; padding: 0.8em; border-radius: 6px; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d0d7de; padding-left: 1em; color: #57606a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; }
  a { color: #0969da; }
`;

export function markdownToHtml(markdown: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head><body>${markdownToHtmlBody(markdown)}</body></html>`;
}

// One headless Chromium for the process; launching per export is slow.
const globalForPdf = globalThis as unknown as { pdfBrowser?: Promise<Browser> };

function browser(): Promise<Browser> {
  globalForPdf.pdfBrowser ??= chromium.launch({ headless: true }).catch((err: unknown) => {
    globalForPdf.pdfBrowser = undefined;
    throw err;
  });
  return globalForPdf.pdfBrowser;
}

export async function markdownToPdf(markdown: string, title: string): Promise<Buffer> {
  const context = await (await browser()).newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setContent(markdownToHtml(markdown, title), { waitUntil: "load" });
    return await page.pdf({ format: "A4", margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" } });
  } finally {
    await context.close();
  }
}
