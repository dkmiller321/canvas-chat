import { expect, test } from "@playwright/test";
import {
  V1_MARKDOWN,
  addManualNote,
  createDocument,
  editorLines,
  getArtifact,
  getVersions,
  resetDb,
  sendAndWait,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

const OLD = "Coffee is a brewed drink.";
const FORMAL = "Coffee is a beverage prepared from roasted beans.";

test("E2E-12 @stage4 AI targeted edit", async ({ page, request }) => {
  const id = await createDocument(page);
  const before = await editorLines(page);

  await sendAndWait(page, "Make it more formal");
  const editor = page.getByTestId("doc-editor");
  await expect(editor).toContainText(FORMAL);
  await expect(editor).not.toContainText(OLD);
  expect(await editorLines(page)).toEqual(before.map((l) => (l === OLD ? FORMAL : l)));

  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");
});

test("E2E-13 @stage4 AI builds on manual edits", async ({ page, request }) => {
  const id = await createDocument(page);
  await addManualNote(page);
  await waitForVersion(request, id, 2, 3_000);

  await sendAndWait(page, "Add a conclusion");
  const editor = page.getByTestId("doc-editor");
  await expect(editor).toContainText("My note.");
  await expect(editor.getByRole("heading", { name: "Conclusion" })).toBeVisible();
  await expect(editor).toContainText("Enjoy responsibly.");

  const v3 = await waitForVersion(request, id, 3);
  expect(v3.author).toBe("ai");
  // The manual note survives the AI edit. S7 inserts the conclusion right after "Use fresh beans.",
  // so the note ends up after "Enjoy responsibly." (approved spec fix, docs/VERIFICATION.md stage 4).
  expect(v3.content).toContain("My note.");
  expect(v3.content).toContain("## Conclusion\n\nEnjoy responsibly.");
});

test("E2E-14 @stage4 failed edit is atomic", async ({ page, request }) => {
  const id = await createDocument(page);
  await sendAndWait(page, "Break the edit");

  await expect(page.getByTestId("tool-status").last()).toContainText("failed");
  const artifact = await getArtifact(request, id);
  expect(artifact.currentVersion?.versionNo).toBe(1);
  expect(artifact.currentVersion?.content).toBe(V1_MARKDOWN);
  expect(await getVersions(request, id)).toHaveLength(1);
});

test("E2E-15 @stage4 highlight to edit", async ({ page, request }) => {
  const id = await createDocument(page);
  const before = await editorLines(page);
  const editor = page.getByTestId("doc-editor");

  await editor.getByText("Use fresh beans.", { exact: true }).click({ clickCount: 3 });
  await expect(page.getByTestId("ask-ai-button")).toBeVisible();
  await page.getByTestId("ask-ai-button").click();
  await page.getByTestId("ask-ai-input").fill("shorten");
  await page.getByTestId("ask-ai-submit").click();

  await expect(editor.getByText("Grind beans fresh.", { exact: true })).toBeVisible();
  await expect(editor).not.toContainText("Use fresh beans.");
  expect(await editorLines(page)).toEqual(before.map((l) => (l === "Use fresh beans." ? "Grind beans fresh." : l)));

  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");
});

test("E2E-16 @stage4 quick action", async ({ page, request }) => {
  const id = await createDocument(page);
  await page.getByTestId("quick-actions").click();
  await page.getByTestId("quick-action-formal").click();

  const editor = page.getByTestId("doc-editor");
  await expect(editor).toContainText("COFFEE Guide");
  await expect(editor).not.toContainText("Coffee");
  await waitForVersion(request, id, 2);
});

test("E2E-17 @stage4 versions and restore", async ({ page, request }) => {
  const id = await createDocument(page);
  await sendAndWait(page, "Make it more formal");
  await waitForVersion(request, id, 2);

  const editor = page.getByTestId("doc-editor");
  await page.getByTestId("version-switcher").selectOption("1");
  await expect(editor).toContainText(OLD);
  await expect(editor).toHaveAttribute("contenteditable", "false");

  await page.getByTestId("version-restore").click();
  const v3 = await waitForVersion(request, id, 3);
  expect(v3.author).toBe("user");
  const versions = await getVersions(request, id);
  expect(v3.content).toBe(versions[0]?.content);
  await expect(editor).toHaveAttribute("contenteditable", "true");
});
