import { expect, test, type Page } from "@playwright/test";
import { artifactIdOfCard, getArtifact, sceneLabels, send } from "./helpers";

// Real model, manual only: needs RUN_SMOKE=1 and OPENROUTER_API_KEY. No database reset between steps.
test.skip(
  process.env.RUN_SMOKE !== "1" || !process.env.OPENROUTER_API_KEY,
  "Set RUN_SMOKE=1 and OPENROUTER_API_KEY to run the real-model smoke suite",
);
test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto("/");
});

test.afterAll(async () => {
  await page.close();
});

test("SMOKE-1 @smoke chat", async () => {
  await send(page, "Reply with exactly one word: pong");
  await expect(page.getByTestId("message-assistant").last()).toHaveText(/pong/i, { timeout: 30_000 });
  await expect(page.getByTestId("stop-button")).toBeHidden({ timeout: 30_000 });
});

test("SMOKE-2 @smoke document", async () => {
  await send(page, 'Create a short document titled "Smoke Test" with two headings.');
  await expect(page.getByTestId("canvas-panel")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("doc-title")).toContainText("Smoke Test", { timeout: 60_000 });
  await expect(page.getByTestId("stop-button")).toBeHidden({ timeout: 60_000 });
});

test("SMOKE-3 @smoke edit", async ({ request }) => {
  const id = await artifactIdOfCard(page, "Smoke Test");
  await send(page, 'In the document, change the first heading to "Changed Heading".');
  await expect(page.getByTestId("doc-editor")).toContainText("Changed Heading", { timeout: 60_000 });
  await expect
    .poll(async () => (await getArtifact(request, id)).currentVersion?.versionNo, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("stop-button")).toBeHidden({ timeout: 60_000 });
});

test("SMOKE-4 @smoke diagram", async ({ request }) => {
  await send(page, "Draw a flowchart with three boxes: Start, Process, End.");
  await expect(page.getByTestId("diagram-editor")).toBeVisible({ timeout: 60_000 });
  const cards = page.getByTestId("artifact-card");
  const id = await cards.last().getAttribute("data-artifact-id");
  if (!id) throw new Error("no artifact id");
  await expect
    .poll(async () => sceneLabels((await getArtifact(request, id)).currentVersion?.content ?? '{"elements":[]}'), {
      timeout: 60_000,
    })
    .toEqual(expect.arrayContaining(["Start", "Process", "End"]));
});
