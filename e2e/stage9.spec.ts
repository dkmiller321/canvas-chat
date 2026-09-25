import { expect, test, type APIRequestContext } from "@playwright/test";
import { createDocument, getArtifact, resetDb } from "./helpers";

test.beforeEach(resetDb);

const content = async (request: APIRequestContext, id: string) =>
  (await getArtifact(request, id)).currentVersion?.content ?? "";

test("E2E-32 @stage9 formatting toolbar", async ({ page, request }) => {
  const id = await createDocument(page);
  await expect(page.getByTestId("format-toolbar")).toBeVisible();
  const editor = page.getByTestId("doc-editor");

  await editor.getByText("Use fresh beans.", { exact: true }).click({ clickCount: 3 });
  await page.getByTestId("format-bold").click();
  await expect.poll(() => content(request, id), { timeout: 5_000 }).toContain("**Use fresh beans.**");

  await editor.getByText("Coffee is a brewed drink.", { exact: true }).click();
  await page.getByTestId("format-bullet-list").click();
  await expect.poll(() => content(request, id), { timeout: 5_000 }).toContain("- Coffee is a brewed drink.");
});

test("E2E-33 @stage9 slash menu and task list", async ({ page, request }) => {
  const id = await createDocument(page);
  const editor = page.getByTestId("doc-editor");
  await editor.getByText("Use fresh beans.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.getByTestId("slash-menu")).toBeVisible();
  await page.keyboard.type("task");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Buy beans");
  await expect.poll(() => content(request, id), { timeout: 5_000 }).toContain("- [ ] Buy beans");
  // The task goes on the new line after "Use fresh beans.", and the title is untouched.
  const saved = await content(request, id);
  expect(saved.startsWith("# Coffee Guide\n")).toBe(true);
  expect(saved.indexOf("- [ ] Buy beans")).toBeGreaterThan(saved.indexOf("Use fresh beans."));

  await editor.getByRole("checkbox").first().check();
  await expect.poll(() => content(request, id), { timeout: 5_000 }).toContain("- [x] Buy beans");
});

test("E2E-34 @stage9 table controls", async ({ page, request }) => {
  const id = await createDocument(page);
  const editor = page.getByTestId("doc-editor");
  await editor.getByText("Use fresh beans.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await expect(page.getByTestId("slash-menu")).toBeVisible();
  await page.keyboard.press("Enter");

  const tableLines = async () => (await content(request, id)).split("\n").filter((l) => l.trim().startsWith("|"));
  await expect.poll(async () => (await tableLines()).length, { timeout: 5_000 }).toBeGreaterThan(1);
  const before = await tableLines();
  // The table goes on the new line after "Use fresh beans.", and the title is untouched.
  const saved = await content(request, id);
  expect(saved.startsWith("# Coffee Guide\n")).toBe(true);
  expect(saved.indexOf("|")).toBeGreaterThan(saved.indexOf("Use fresh beans."));

  await editor.locator("td, th").first().click();
  await expect(page.getByTestId("table-toolbar")).toBeVisible();
  await page.getByTestId("table-add-row").click();
  await expect.poll(async () => (await tableLines()).length, { timeout: 5_000 }).toBe(before.length + 1);

  const cells = (line: string | undefined) => (line ?? "").split("|").length;
  const headerBefore = cells((await tableLines())[0]);
  await page.getByTestId("table-add-column").click();
  await expect.poll(async () => cells((await tableLines())[0]), { timeout: 5_000 }).toBe(headerBefore + 1);
});
