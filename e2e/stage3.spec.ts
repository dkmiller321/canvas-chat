import { expect, test } from "@playwright/test";
import {
  addManualNote,
  artifactIdOfCard,
  createDocument,
  getArtifact,
  recordToolStatus,
  resetDb,
  send,
  waitForReply,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

test("E2E-08 @stage3 create document", async ({ page, request }) => {
  await page.goto("/");
  const toolStatuses = await recordToolStatus(page);
  await send(page, "Write a document about coffee");

  await expect(page.getByTestId("tool-status")).toBeVisible();
  await expect(page.getByTestId("canvas-panel")).toBeVisible();
  await waitForReply(page);
  // tool-status was on screen while the reply was still streaming.
  expect((await toolStatuses()).some((s) => s.streaming && s.text.length > 0)).toBe(true);

  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
  const editor = page.getByTestId("doc-editor");
  await expect(editor.getByRole("heading", { name: "Brewing" })).toBeVisible();
  await expect(editor).toContainText("Use fresh beans.");

  const id = await artifactIdOfCard(page, "Coffee Guide");
  const artifact = await getArtifact(request, id);
  expect(artifact.kind).toBe("document");
  expect(artifact.currentVersion?.versionNo).toBe(1);
  expect(artifact.currentVersion?.author).toBe("ai");
});

test("E2E-09 @stage3 manual edit saves a version", async ({ page, request }) => {
  const id = await createDocument(page);
  await addManualNote(page);

  const v2 = await waitForVersion(request, id, 2, 3_000);
  expect(v2.author).toBe("user");
  expect(v2.content).toContain("Use fresh beans. My note.");
});

test("E2E-10 @stage3 artifact card reopens", async ({ page }) => {
  await createDocument(page);
  await page.getByTestId("canvas-close").click();
  await expect(page.getByTestId("canvas-panel")).toBeHidden();

  await page.getByTestId("artifact-card").click();
  await expect(page.getByTestId("canvas-panel")).toBeVisible();
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
});

test("E2E-11 @stage3 persistence", async ({ page }) => {
  await createDocument(page);
  const before = await page.getByTestId("doc-editor").innerText();

  await page.reload();
  await page.getByTestId("artifact-card").click();
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
  await expect(page.getByTestId("doc-editor")).toContainText("Use fresh beans.");
  expect(await page.getByTestId("doc-editor").innerText()).toBe(before);
});
