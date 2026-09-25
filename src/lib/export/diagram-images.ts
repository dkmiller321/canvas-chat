import { env } from "@/lib/env";
import { exportBrowser } from "./pdf";

export type DiagramImage = { svg: string; png: Buffer; width: number; height: number };

/**
 * Render embedded diagrams for exports (E4) by loading /render/diagram/<id> in the
 * export Chromium. Missing or broken diagrams are left out; the exporters then
 * show the diagram's title as a placeholder.
 */
export async function renderDiagrams(ids: string[]): Promise<Map<string, DiagramImage>> {
  const out = new Map<string, DiagramImage>();
  if (ids.length === 0) return out;
  const { port } = env();
  const context = await (await exportBrowser()).newContext({ deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    for (const id of ids) {
      await page.goto(`http://127.0.0.1:${port}/render/diagram/${id}`);
      const host = page.locator("#diagram-svg");
      await page.waitForSelector("#diagram-svg:not([data-status=loading])", { timeout: 20_000 });
      if ((await host.getAttribute("data-status")) !== "ready") continue;
      const svg = host.locator("svg");
      const box = await svg.boundingBox();
      if (!box) continue;
      out.set(id, {
        svg: await svg.evaluate((el) => el.outerHTML),
        png: await svg.screenshot({ type: "png" }),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
    }
  } finally {
    await context.close();
  }
  return out;
}
