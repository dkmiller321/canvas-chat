import { expect, test } from "@playwright/test";
import {
  countType,
  createDiagram,
  drawRectangle,
  getArtifact,
  resetDb,
  sceneLabels,
  sendAndWait,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

test("E2E-18 @stage5 create diagram", async ({ page, request }) => {
  const id = await createDiagram(page, request);

  const panel = page.getByTestId("canvas-panel");
  await expect(panel.getByTestId("diagram-editor")).toBeVisible();
  await expect(page.getByTestId("diagram-editor").locator("canvas").first()).toBeVisible();

  const artifact = await getArtifact(request, id);
  expect(artifact.kind).toBe("diagram");
  expect(artifact.currentVersion?.versionNo).toBe(1);
  expect(artifact.currentVersion?.author).toBe("ai");
  const content = artifact.currentVersion?.content ?? "";
  expect(sceneLabels(content)).toEqual(expect.arrayContaining(["User", "Login", "Dashboard"]));
  expect(countType(content, "arrow")).toBeGreaterThanOrEqual(2);
});

test("E2E-19 @stage5 manual drawing autosaves", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  const v1 = await getArtifact(request, id);
  await drawRectangle(page);

  const v2 = await waitForVersion(request, id, 2, 3_000);
  expect(v2.author).toBe("user");
  expect(countType(v2.content, "rectangle")).toBe(countType(v1.currentVersion?.content ?? "", "rectangle") + 1);
});

test("E2E-20 @stage5 multiple artifacts", async ({ page, request }) => {
  await page.goto("/");
  await sendAndWait(page, "Write a document about coffee");
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
  const diagramId = await createDiagram(page, request, { goto: false });

  const switcher = page.getByTestId("artifact-switcher");
  await expect(switcher).toContainText("Coffee Guide");
  await expect(switcher).toContainText("Login Flow");

  await switcher.getByText("Coffee Guide").click();
  await expect(page.getByTestId("doc-editor")).toBeVisible();
  await expect(page.getByTestId("diagram-editor")).toBeHidden();
  await expect(page.getByTestId("doc-editor")).toContainText("Use fresh beans.");

  await switcher.getByText("Login Flow").click();
  await expect(page.getByTestId("diagram-editor")).toBeVisible();
  await expect(page.getByTestId("doc-editor")).toBeHidden();
  const diagram = await getArtifact(request, diagramId);
  expect(sceneLabels(diagram.currentVersion?.content ?? "")).toEqual(
    expect.arrayContaining(["User", "Login", "Dashboard"]),
  );

  await switcher.getByText("Coffee Guide").click();
  await expect(page.getByTestId("doc-editor")).toContainText("Use fresh beans.");
  await waitForVersion(request, diagramId, 1);
});
