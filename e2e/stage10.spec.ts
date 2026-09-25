import { expect, test } from "@playwright/test";
import { createCode, downloadBytes, getArtifact, resetDb, sendAndWait, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

test("E2E-35 @stage10 create code", async ({ page, request }) => {
  const id = await createCode(page);
  await expect(page.getByTestId("code-language")).toHaveValue("python");
  const artifact = await getArtifact(request, id);
  expect(artifact.kind).toBe("code");
  expect(artifact.language).toBe("python");
  expect(artifact.currentVersion?.versionNo).toBe(1);
  expect(artifact.currentVersion?.author).toBe("ai");

  await page.getByTestId("code-editor").getByText("print(fib(10))").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" # done");
  const v2 = await waitForVersion(request, id, 2, 3_000);
  expect(v2.author).toBe("user");
  expect(v2.content).toContain("# done");
});

test("E2E-36 @stage10 AI edit and quick action on code", async ({ page, request }) => {
  const id = await createCode(page);
  await sendAndWait(page, "Rename the function");
  await expect(page.getByTestId("code-editor")).toContainText("def fibonacci(n):");
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("ai");

  await page.getByTestId("quick-actions").click();
  await page.getByTestId("quick-action-comments").click();
  await expect(page.getByTestId("code-editor")).toContainText("# Compute Fibonacci numbers.");
  await waitForVersion(request, id, 3);
});

test("E2E-37 @stage10 language and export", async ({ page, request }) => {
  const id = await createCode(page);
  await page.getByTestId("code-language").selectOption("javascript");
  await expect.poll(async () => (await getArtifact(request, id)).language).toBe("javascript");

  await page.getByTestId("export-menu").click();
  const file = await downloadBytes(page, "export-code");
  expect(file.name).toBe("fibonacci.js");
  expect(file.bytes.toString("utf8")).toContain("def fib(n):");
});
