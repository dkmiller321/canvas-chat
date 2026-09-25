import { expect, test } from "@playwright/test";
import {
  createDiagram,
  fullElements,
  getArtifact,
  resetDb,
  sceneLabels,
  selectShapes,
  shapeIdsByLabel,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

async function askAboutSelection(page: import("@playwright/test").Page, instruction: string) {
  await expect(page.getByTestId("diagram-ask-ai-button")).toBeVisible();
  await page.getByTestId("diagram-ask-ai-button").click();
  await page.getByTestId("diagram-ask-ai-input").fill(instruction);
  await page.getByTestId("diagram-ask-ai-submit").click();
}

test("E2E-39 @stage12 restyle the selection", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  const v1 = (await getArtifact(request, id)).currentVersion?.content ?? "";
  const ids = shapeIdsByLabel(v1);
  const before = Object.fromEntries(fullElements(v1).map((e) => [e.id, e]));

  await selectShapes(page, [ids.Login!]);
  await askAboutSelection(page, "make it red");

  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");
  const after = Object.fromEntries(fullElements(v2.content).map((e) => [e.id, e]));
  expect(after[ids.Login!]).toMatchObject({ strokeColor: "#e03131", backgroundColor: "#ffc9c9" });
  for (const label of ["User", "Dashboard"]) {
    const shape = ids[label]!;
    expect(after[shape]?.strokeColor).toBe(before[shape]?.strokeColor);
    expect(after[shape]?.backgroundColor).toBe(before[shape]?.backgroundColor);
  }
});

test("E2E-40 @stage12 relabel the selection", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  const ids = shapeIdsByLabel((await getArtifact(request, id)).currentVersion?.content ?? "");

  await selectShapes(page, [ids.Login!]);
  await askAboutSelection(page, "rename to auth");

  const v2 = await waitForVersion(request, id, 2);
  const labels = sceneLabels(v2.content);
  expect(labels).toContain("Auth");
  expect(labels).not.toContain("Login");
  expect(shapeIdsByLabel(v2.content).Auth).toBe(ids.Login);
});
