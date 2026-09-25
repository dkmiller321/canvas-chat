import { expect, test } from "@playwright/test";
import { createDiagram, getArtifact, resetDb, sceneElements, sceneLabels, sendAndWait, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

const TYPES = [
  { prompt: "Draw a sequence diagram", title: "Greeting", labels: ["Alice", "Bob"] },
  { prompt: "Draw a class diagram", title: "Animals", labels: ["Animal", "Dog"] },
  { prompt: "Draw a state diagram", title: "Runner", labels: ["Idle", "Running"] },
  { prompt: "Draw an ER diagram", title: "Orders", labels: ["CUSTOMER", "ORDER"] },
  { prompt: "Draw a mind map", title: "Coffee Map", labels: ["Coffee", "Beans", "Brewing", "Serving"] },
];

test("E2E-44 @stage14 editable diagram types", async ({ page, request }) => {
  test.setTimeout(150_000);
  for (const t of TYPES) {
    await request.post("/api/test/reset");
    await page.goto("/");
    await sendAndWait(page, t.prompt);
    await expect(page.getByTestId("diagram-editor")).toBeVisible();
    const card = page.getByTestId("artifact-card").filter({ hasText: t.title });
    const id = await card.getAttribute("data-artifact-id");
    if (!id) throw new Error(`no artifact for ${t.prompt}`);
    const v1 = await waitForVersion(request, id, 1);
    expect(sceneElements(v1.content).filter((e) => e.type === "image"), `${t.prompt}: image fallback`).toHaveLength(0);
    // Labels may be split across lines or carry decorations (e.g. class members); match by inclusion.
    const text = sceneLabels(v1.content).join("\n");
    for (const label of t.labels) expect(text, `${t.prompt}: ${label}`).toContain(label);
  }
});

test("E2E-45 @stage14 Mermaid source", async ({ page, request }) => {
  const id = await createDiagram(page, request);
  await page.getByTestId("diagram-source").click();
  const source = page.getByTestId("mermaid-source");
  await expect(source).toHaveValue("flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]");
  await source.fill("flowchart LR\n  A[User] --> B[Login]\n  B --> C[Home]");
  await page.getByTestId("mermaid-apply").click();

  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("user");
  const labels = sceneLabels(v2.content);
  expect(labels).toContain("Home");
  expect(labels).not.toContain("Dashboard");
  expect((await getArtifact(request, id)).kind).toBe("diagram");
});
