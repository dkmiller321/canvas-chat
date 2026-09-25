import { expect, test } from "@playwright/test";
import { HELLO, conversationIdFromUrl, resetDb, sendAndWait } from "./helpers";

test.beforeEach(resetDb);

test("E2E-05 @stage2 history survives reload", async ({ page }) => {
  await page.goto("/");
  await sendAndWait(page, "Say hello");
  await page.reload();

  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await expect(page.getByTestId("message-user")).toContainText("Say hello");
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);
  await expect(page.getByTestId("message-assistant")).toContainText(HELLO);
  await expect(page.getByTestId("sidebar-item")).toHaveCount(1);
});

test("E2E-06 @stage2 sidebar management", async ({ page, request }) => {
  await page.goto("/");
  const items = page.getByTestId("sidebar-item");
  for (let i = 1; i <= 3; i++) {
    await page.getByTestId("new-chat").click();
    await sendAndWait(page, "Say hello");
    await expect(items).toHaveCount(i);
  }
  await expect(items).toHaveCount(3);

  const second = items.nth(1);
  const secondId = await second.getAttribute("data-conversation-id");
  if (!secondId) throw new Error("sidebar-item has no data-conversation-id");
  await second.hover();
  await second.getByTestId("rename-chat").click();
  const titleInput = page.getByRole("textbox", { name: "Conversation title" });
  await titleInput.fill("Renamed Chat");
  await titleInput.press("Enter");
  const renamed = page.locator(`[data-testid="sidebar-item"][data-conversation-id="${secondId}"]`);
  await expect(renamed).toContainText("Renamed Chat");

  await page.getByTestId("sidebar-search").fill("renamed");
  const visible = items.filter({ visible: true });
  await expect(visible).toHaveCount(1);
  await expect(visible).toHaveAttribute("data-conversation-id", secondId);

  await visible.hover();
  await visible.getByTestId("delete-chat").click();
  await expect(renamed).toHaveCount(0);

  await page.reload();
  await expect(items).toHaveCount(2);
  const res = await request.get(`/api/conversations/${secondId}`);
  expect(res.status()).toBe(404);
});

test("E2E-07 @stage2 switching chats", async ({ page }) => {
  await page.goto("/");
  await sendAndWait(page, "Say hello");
  const a = conversationIdFromUrl(page);

  await page.getByTestId("new-chat").click();
  await sendAndWait(page, "Show me code");
  const b = conversationIdFromUrl(page);
  expect(b).not.toBe(a);

  await page.locator(`[data-testid="sidebar-item"][data-conversation-id="${a}"]`).click();
  await expect(page).toHaveURL(new RegExp(a));
  await expect(page.getByTestId("message-user")).toHaveCount(1);
  await expect(page.getByTestId("message-user")).toContainText("Say hello");
  await expect(page.getByTestId("message-assistant")).toHaveCount(1);
  await expect(page.getByTestId("message-assistant")).toContainText(HELLO);
  await expect(page.getByTestId("code-block")).toHaveCount(0);
});
