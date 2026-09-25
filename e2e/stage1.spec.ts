import { expect, test } from "@playwright/test";
import { HELLO, resetDb, send, waitForReply } from "./helpers";

test.beforeEach(resetDb);

test("E2E-01 @stage1 streaming reply", async ({ page }) => {
  await page.goto("/");
  await send(page, "Say hello");
  await expect(page.getByTestId("stop-button")).toBeVisible();

  const lengths: number[] = [];
  let text = "";
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    text = await page.evaluate(
      () => [...document.querySelectorAll('[data-testid="message-assistant"]')].at(-1)?.textContent ?? "",
    );
    lengths.push(text.length);
    if (text.includes(HELLO)) break;
    await page.waitForTimeout(10);
  }
  expect(text).toContain("Hello! I am the mock model");

  await expect(page.getByTestId("stop-button")).toBeHidden();
  const assistant = page.getByTestId("message-assistant").last();
  await expect(assistant).toContainText(HELLO);
  const finalLength = ((await assistant.textContent()) ?? "").length;
  // Observed at least once mid-stream with partial text.
  expect(lengths.some((l) => l > 0 && l < finalLength)).toBe(true);
});

test("E2E-02 @stage1 markdown and code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await send(page, "Show me code");
  await waitForReply(page);

  const block = page.getByTestId("code-block");
  await expect(block).toContainText("const answer = 42;");
  await block.getByTestId("copy-code").click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe("const answer = 42;");
});

test("E2E-03 @stage1 stop button halts stream", async ({ page }) => {
  await page.goto("/");
  await send(page, "Write a long story");
  await page.waitForTimeout(800);
  await page.getByTestId("stop-button").click();

  const assistant = page.getByTestId("message-assistant").last();
  const before = ((await assistant.textContent()) ?? "").length;
  await page.waitForTimeout(1_000);
  const after = ((await assistant.textContent()) ?? "").length;
  expect(after).toBe(before);
  await expect(page.getByTestId("chat-input")).toBeEnabled();
});

test("E2E-04 @stage1 model picker", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByTestId("model-picker");
  const current = await picker.inputValue();
  const options = await picker.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
  const other = options.find((o) => o !== current);
  if (!other) throw new Error("ALLOWED_MODELS needs at least two models");

  await picker.selectOption(other);
  await send(page, "Which model");
  await waitForReply(page);
  await expect(page.getByTestId("message-assistant").last()).toContainText(other);
});
