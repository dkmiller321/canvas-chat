import { expect, test } from "@playwright/test";
import {
  createDocument,
  getArtifact,
  getVersions,
  resetDb,
  sendAndWait,
  waitForNewVersion,
  waitForVersion,
} from "./helpers";

test.beforeEach(resetDb);

test("E2E-28 @stage8 blank document", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId("new-artifact").click();
  await page.getByTestId("new-document").click();
  await expect(page.getByTestId("canvas-panel")).toBeVisible();
  await expect(page.getByTestId("doc-title")).toHaveText("Untitled document");

  await page.getByTestId("doc-editor").click();
  await page.keyboard.type("Hello world");

  const id = await page.getByTestId("artifact-switcher").getByRole("tab").first().getAttribute("data-artifact-id");
  if (!id) throw new Error("switcher tab has no data-artifact-id");
  await expect
    .poll(async () => (await getArtifact(request, id)).currentVersion?.content ?? "", { timeout: 5_000 })
    .toContain("Hello world");
  expect((await getArtifact(request, id)).currentVersion?.author).toBe("user");
  await expect(page.getByTestId("sidebar-item")).toHaveCount(1);
});

test("E2E-29 @stage8 rename and delete", async ({ page, request }) => {
  const id = await createDocument(page);
  await page.getByTestId("artifact-rename").click();
  const input = page.getByTestId("artifact-title-input");
  await input.fill("Brew Notes");
  await input.press("Enter");
  await expect(page.getByTestId("doc-title")).toHaveText("Brew Notes");
  await expect(page.getByTestId("artifact-switcher")).toContainText("Brew Notes");
  await expect.poll(async () => (await getArtifact(request, id)).title).toBe("Brew Notes");

  await page.getByTestId("artifact-delete").click();
  await page.getByTestId("artifact-delete-confirm").click();
  await expect(page.getByTestId("artifact-switcher")).not.toContainText("Brew Notes");
  await expect.poll(async () => (await request.get(`/api/artifacts/${id}`)).status()).toBe(404);
});

test("E2E-30 @stage8 branch from a version", async ({ page, request }) => {
  const id = await createDocument(page);
  await sendAndWait(page, "Make it more formal");
  await waitForVersion(request, id, 2);

  await page.getByTestId("version-switcher").selectOption("1");
  await expect(page.getByTestId("doc-editor")).toContainText("Coffee is a brewed drink.");
  await page.getByTestId("version-branch").click();

  const tabs = page.getByTestId("artifact-switcher").getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide (v1 copy)");
  const copyId = await page
    .getByTestId("artifact-switcher")
    .getByRole("tab", { selected: true })
    .getAttribute("data-artifact-id");
  if (!copyId) throw new Error("no selected tab id");
  expect(copyId).not.toBe(id);

  const original = await getVersions(request, id);
  const copy = await getVersions(request, copyId);
  expect(copy[0]?.content).toBe(original[0]?.content);
  expect((await getArtifact(request, id)).currentVersion?.versionNo).toBe(2);
});

test("E2E-31 @stage8 copy, source view, stats and outline", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = await createDocument(page);

  await page.getByTestId("copy-markdown").click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // The Windows clipboard turns \n into \r\n; compare the text, not the platform's line endings.
  expect(clipboard.replace(/\r\n/g, "\n")).toBe((await getArtifact(request, id)).currentVersion?.content);

  await expect(page.getByTestId("doc-stats")).toContainText("11 words");
  const outline = page.getByTestId("doc-outline");
  await expect(outline).toContainText("Coffee Guide");
  await expect(outline).toContainText("Brewing");

  await page.getByTestId("view-markdown").click();
  const source = page.getByTestId("markdown-source");
  await expect(source).toHaveValue((await getArtifact(request, id)).currentVersion?.content ?? "");
  await source.press("ControlOrMeta+End");
  await source.pressSequentially("\n\nExtra line.");
  await page.getByTestId("view-markdown").click();

  await expect(page.getByTestId("doc-editor")).toContainText("Extra line.");
  const v2 = await waitForNewVersion(request, id, 1);
  expect(v2.author).toBe("user");
  expect(v2.content).toContain("Extra line.");
});
