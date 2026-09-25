import { expect, test } from "@playwright/test";
import {
  createDiagram,
  drawRectangle,
  getArtifact,
  resetDb,
  sceneElements,
  sceneLabels,
  sendAndWait,
  shapeIdsByLabel,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

test("E2E-21 @stage6 AI updates existing diagram", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  const v1 = (await getArtifact(request, id)).currentVersion?.content ?? "";
  const originalIds = shapeIdsByLabel(v1);
  expect(Object.keys(originalIds)).toEqual(expect.arrayContaining(["User", "Login", "Dashboard"]));

  await sendAndWait(page, "Add a cache");
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");
  expect(sceneLabels(v2.content)).toEqual(expect.arrayContaining(["Cache", "User", "Login", "Dashboard"]));

  const after = shapeIdsByLabel(v2.content);
  for (const label of ["User", "Login", "Dashboard"]) {
    expect(after[label]).toBe(originalIds[label]);
  }
});

test("E2E-22 @stage6 AI edit keeps manual shapes", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  const v1 = (await getArtifact(request, id)).currentVersion?.content ?? "";
  await drawRectangle(page);
  const v2 = await waitForVersion(request, id, 2, 3_000);

  const v1Ids = new Set(sceneElements(v1).map((e) => e.id));
  const drawn = sceneElements(v2.content).filter((e) => e.type === "rectangle" && !v1Ids.has(e.id));
  expect(drawn).toHaveLength(1);
  const drawnId = drawn[0]?.id;

  await sendAndWait(page, "Add a cache");
  const v3 = await waitForVersion(request, id, 3);
  expect(v3.author).toBe("ai");
  expect(sceneElements(v3.content).some((e) => e.id === drawnId && e.type === "rectangle")).toBe(true);
  expect(sceneLabels(v3.content)).toContain("Cache");
});
