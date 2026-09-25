import { expect, test } from "@playwright/test";
import { resetDb } from "./helpers";

test.beforeEach(resetDb);

test("E2E-00 @stage0 app boots", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", db: "ok" });

  await page.goto("/");
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(page.getByTestId("new-chat")).toBeVisible();

  const reset = await request.post("/api/test/reset");
  expect(reset.status()).toBe(200);
});
