import path from "node:path";
import { expect, test } from "@playwright/test";
import { createDiagram, downloadBytes, resetDb, sceneLabels, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

test("E2E-46 @stage15 import .excalidraw", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  await page.getByTestId("diagram-import").setInputFiles(path.join(import.meta.dirname, "fixtures", "imported.excalidraw"));
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("user");
  expect(sceneLabels(v2.content)).toEqual(["Imported"]);
});

test("E2E-47 @stage15 library persists", async ({ page, request }) => {
  await createDiagram(page, request);
  await page.waitForFunction(() => "__excalidrawAPI" in window);
  await page.evaluate(async () => {
    const api = (window as unknown as { __excalidrawAPI: { updateLibrary: (o: unknown) => Promise<unknown> } }).__excalidrawAPI;
    await api.updateLibrary({
      libraryItems: [
        {
          id: "lib-1",
          status: "unpublished",
          created: Date.now(),
          elements: [
            {
              id: "lib-rect",
              type: "rectangle",
              x: 0,
              y: 0,
              width: 100,
              height: 60,
              angle: 0,
              strokeColor: "#1e1e1e",
              backgroundColor: "#a5d8ff",
              fillStyle: "solid",
              strokeWidth: 2,
              strokeStyle: "solid",
              roughness: 1,
              opacity: 100,
              groupIds: [],
              frameId: null,
              roundness: null,
              seed: 1,
              version: 1,
              versionNonce: 1,
              isDeleted: false,
              boundElements: null,
              updated: 1,
              link: null,
              locked: false,
            },
          ],
        },
      ],
      merge: true,
    });
  });

  const count = async () => ((await (await request.get("/api/library")).json()) as { items: unknown[] }).items.length;
  await expect.poll(count, { timeout: 3_000 }).toBe(1);
  await page.reload();
  expect(await count()).toBe(1);
});

test("E2E-48 @stage15 transparent and dark exports", async ({ page, request }) => {
  await createDiagram(page, request);

  await page.getByTestId("export-menu").click();
  const png = await downloadBytes(page, "export-png-transparent");
  const alpha = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }, png.bytes.toString("base64"));
  expect(alpha).toBe(0);

  await page.getByTestId("export-menu").click();
  const svg = await downloadBytes(page, "export-svg-dark");
  expect(svg.bytes.toString("utf8")).toContain("invert");
});
