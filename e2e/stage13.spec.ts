import { expect, test } from "@playwright/test";
import { createDiagram, fullElements, getArtifact, resetDb, sendAndWait, shapeIdsByLabel, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);

test("E2E-41 @stage13 style presets", async ({ page, request }) => {
  const id = await createDiagram(page, request);

  await page.getByTestId("diagram-style-menu").click();
  await page.getByTestId("style-monochrome").click();
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("user");
  for (const r of fullElements(v2.content).filter((e) => e.type === "rectangle")) {
    expect(r.strokeColor).toBe("#1e1e1e");
    expect(r.backgroundColor).toBe("transparent");
  }

  await page.getByTestId("diagram-style-menu").click();
  await page.getByTestId("style-clean").click();
  const v3 = await waitForVersion(request, id, 3);
  for (const s of fullElements(v3.content).filter((e) => SHAPES.has(e.type))) {
    expect(s.roughness).toBe(0);
    expect(s.fillStyle).toBe("solid");
  }
});

test("E2E-42 @stage13 AI restyle", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  await sendAndWait(page, "Make it monochrome");
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");
  const rects = fullElements(v2.content).filter((e) => e.type === "rectangle");
  expect(rects.length).toBeGreaterThan(0);
  for (const r of rects) expect(r.strokeColor).toBe("#1e1e1e");
});

test("E2E-43 @stage13 tidy up", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  await sendAndWait(page, "Add a cache");
  const v2 = await waitForVersion(request, id, 2);

  await page.getByTestId("diagram-tidy").click();
  const v3 = await waitForVersion(request, id, 3);
  expect(v3.author).toBe("user");

  const els = fullElements(v3.content);
  const shapes = els.filter((e) => SHAPES.has(e.type));
  for (const a of shapes) {
    for (const b of shapes) {
      if (a.id >= b.id) continue;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
  const ids = shapeIdsByLabel(v3.content);
  const x = (label: string) => els.find((e) => e.id === ids[label])!.x;
  expect(x("User")).toBeLessThan(x("Login"));
  expect(x("Login")).toBeLessThan(x("Dashboard"));
  expect(x("Cache")).toBeGreaterThan(x("Login"));

  const bindings = (content: string) =>
    Object.fromEntries(
      fullElements(content)
        .filter((e) => e.type === "arrow")
        .map((a) => [a.id, [a.startBinding?.elementId, a.endBinding?.elementId]]),
    );
  expect(bindings(v3.content)).toEqual(bindings(v2.content));
});
