import { expect, test } from "@playwright/test";
import { HELLO, createDiagram, createDocument, downloadBytes, resetDb, send, sendAndWait, waitForReply } from "./helpers";

test.beforeEach(resetDb);

test("E2E-23 @stage7 document exports", async ({ page }) => {
  await createDocument(page);

  await page.getByTestId("export-menu").click();
  const md = await downloadBytes(page, "export-md");
  expect(md.name).toBe("coffee-guide.md");
  expect(md.bytes.toString("utf8")).toContain("## Brewing");

  await page.getByTestId("export-menu").click();
  const pdf = await downloadBytes(page, "export-pdf");
  expect(pdf.name).toBe("coffee-guide.pdf");
  expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  expect(pdf.bytes.length).toBeGreaterThanOrEqual(1024);

  await page.getByTestId("export-menu").click();
  const docx = await downloadBytes(page, "export-docx");
  expect(docx.name).toBe("coffee-guide.docx");
  expect(docx.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
});

test("E2E-24 @stage7 diagram exports", async ({ page, request }) => {
  await createDiagram(page, request);

  await page.getByTestId("export-menu").click();
  const png = await downloadBytes(page, "export-png");
  expect(png.bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);

  await page.getByTestId("export-menu").click();
  const svg = await downloadBytes(page, "export-svg");
  expect(svg.bytes.toString("utf8")).toContain("<svg");

  await page.getByTestId("export-menu").click();
  const json = await downloadBytes(page, "export-excalidraw");
  const scene = JSON.parse(json.bytes.toString("utf8")) as { type: string; elements: unknown[] };
  expect(scene.type).toBe("excalidraw");
  expect(scene.elements.length).toBeGreaterThan(0);
});

test("E2E-25 @stage7 auto title", async ({ page }) => {
  await page.goto("/");
  await send(page, "Say hello");
  await expect(page.getByTestId("sidebar-item").first()).toHaveText("Mock Title", { timeout: 5_000 });
});

test("E2E-26 @stage7 regenerate and edit-resend", async ({ page }) => {
  await page.goto("/");
  await sendAndWait(page, "Say hello");

  await page.getByTestId("message-assistant").last().hover();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await waitForReply(page);
  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);
  await expect(page.getByTestId("message-assistant")).toContainText(HELLO);

  await page.getByTestId("message-user").hover();
  await page.getByRole("button", { name: "Edit message" }).click();
  const editBox = page.getByRole("textbox", { name: "Edit message" });
  await editBox.fill("Show me code");
  await page.getByRole("button", { name: "Save and send" }).click();
  await waitForReply(page);
  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await expect(page.getByTestId("message-user")).toContainText("Show me code");
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);
  await expect(page.getByTestId("message-assistant").getByTestId("code-block")).toBeVisible();
});

test("E2E-27 @stage7 settings", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("settings-link").click();
  const select = page.getByTestId("settings-default-model");
  const current = await select.inputValue();
  const options = await select.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
  const other = options.find((o) => o !== current);
  if (!other) throw new Error("ALLOWED_MODELS needs at least two models");

  await select.selectOption(other);
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok()),
    page.getByTestId("settings-save").click(),
  ]);

  await page.goto("/");
  await page.getByTestId("new-chat").click();
  await expect(page.getByTestId("model-picker")).toHaveValue(other);
  // Still the default after sending in the new chat.
  await sendAndWait(page, "Which model");
  await expect(page.getByTestId("message-assistant").last()).toContainText(other);
});
