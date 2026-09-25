import { expect, test } from "@playwright/test";
import { createDiagram, downloadBytes, getArtifact, resetDb, sendAndWait, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

test("E2E-38 @stage11 embed a live diagram", async ({ page, request }) => {
  await page.goto("/");
  await sendAndWait(page, "Write a document about coffee");
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
  const docId = await page.getByTestId("artifact-card").first().getAttribute("data-artifact-id");
  if (!docId) throw new Error("no document id");
  const diagramId = await createDiagram(page, request, { goto: false });

  const switcher = page.getByTestId("artifact-switcher");
  await switcher.getByText("Coffee Guide").click();
  const editor = page.getByTestId("doc-editor");
  await editor.getByText("Use fresh beans.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.getByTestId("insert-diagram").click();
  await page.getByTestId("insert-diagram-option").filter({ hasText: "Login Flow" }).click();

  const embed = editor.getByTestId("diagram-embed");
  await expect(embed.locator("svg")).toBeVisible();
  await expect
    .poll(async () => (await getArtifact(request, docId)).currentVersion?.content ?? "", { timeout: 5_000 })
    .toContain(`diagram://${diagramId}`);

  await switcher.getByText("Login Flow").click();
  await sendAndWait(page, "Add a cache");
  await waitForVersion(request, diagramId, 2);
  await switcher.getByText("Coffee Guide").click();
  await expect(page.getByTestId("doc-editor").getByTestId("diagram-embed").locator("svg")).toContainText("Cache");

  await page.getByTestId("export-menu").click();
  const md = await downloadBytes(page, "export-md");
  expect(md.bytes.toString("utf8")).toContain("data:image/svg+xml;base64");

  await page.getByTestId("export-menu").click();
  const docx = await downloadBytes(page, "export-docx");
  expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(docx.bytes.toString("latin1")).toContain("word/media/");

  await page.getByTestId("export-menu").click();
  const pdf = await downloadBytes(page, "export-pdf");
  expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
});
