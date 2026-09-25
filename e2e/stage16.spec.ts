import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { artifactIdOfCard, resetDb, sceneElements, sceneLabels, sendAndWait, waitForVersion } from "./helpers";

test.beforeEach(resetDb);

type El = ReturnType<typeof sceneElements>[number];

async function draw(page: Page, request: APIRequestContext, prompt: string, title: string) {
  await page.goto("/");
  await sendAndWait(page, prompt);
  await expect(page.getByTestId("diagram-editor")).toBeVisible();
  const id = await artifactIdOfCard(page, title);
  const v1 = await waitForVersion(request, id, 1);
  return { id, v1 };
}

/** The shape a label is bound to, by the label's text. */
function shapeLabelled(els: El[], text: string): El {
  const label = els.find((e) => e.type === "text" && e.text === text && e.containerId);
  const shape = label && els.find((e) => e.id === label.containerId);
  if (!shape) throw new Error(`no shape labelled ${text}`);
  return shape;
}

const encloses = (outer: El, inner: El) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

test("E2E-50 @stage16 neutral graph", async ({ page, request }) => {
  const { v1 } = await draw(page, request, "Draw an architecture graph", "Architecture");
  const els = sceneElements(v1.content);
  expect(els.filter((e) => e.type === "image")).toHaveLength(0);
  const text = sceneLabels(v1.content);
  for (const label of ["Web", "API", "Worker", "Database", "HTTPS", "SQL", "jobs", "Backend"]) {
    expect(text, label).toContain(label);
  }
  const arrows = els.filter((e) => e.type === "arrow");
  expect(arrows).toHaveLength(4);
  expect(arrows.filter((a) => a.strokeStyle === "dashed")).toHaveLength(1);

  const title = els.find((e) => e.type === "text" && e.text === "Backend" && !e.containerId)!;
  const frame = els.find((e) => e.type === "rectangle" && encloses(e, title));
  expect(frame, "frame around the Backend label").toBeTruthy();
  for (const member of ["API", "Worker", "Database"])
    expect(encloses(frame!, shapeLabelled(els, member)), member).toBe(true);
  expect(encloses(frame!, shapeLabelled(els, "Web"))).toBe(false);
});

const LANGUAGES = [
  { prompt: "Draw a dot graph", title: "Pipeline", labels: ["Build", "Test", "Deploy"], arrows: 2 },
  {
    prompt: "Draw a plantuml diagram",
    title: "Shop",
    labels: ["User", "Web App", "Orders DB", "browses", "reads"],
    arrows: 2,
  },
  { prompt: "Draw a d2 diagram", title: "Cloud", labels: ["AWS", "Load balancer", "App", "Users", "HTTPS"], arrows: 2 },
  { prompt: "Draw a plantuml sequence", title: "Handshake", labels: ["Alice", "Bob", "Hello", "Hi"] },
];

test("E2E-51 @stage16 DOT, PlantUML and D2", async ({ page, request }) => {
  test.setTimeout(150_000);
  for (const t of LANGUAGES) {
    await request.post("/api/test/reset");
    const { v1 } = await draw(page, request, t.prompt, t.title);
    const els = sceneElements(v1.content);
    expect(
      els.filter((e) => e.type === "image"),
      `${t.prompt}: image fallback`,
    ).toHaveLength(0);
    const text = sceneLabels(v1.content).join("\n");
    for (const label of t.labels) expect(text, `${t.prompt}: ${label}`).toContain(label);
    if (t.arrows)
      expect(
        els.filter((e) => e.type === "arrow"),
        `${t.prompt}: arrows`,
      ).toHaveLength(t.arrows);
    if (t.title === "Pipeline") expect(shapeLabelled(els, "Deploy").type).toBe("diamond");
    if (t.title === "Cloud") expect(shapeLabelled(els, "Load balancer").y).toBeLessThan(shapeLabelled(els, "App").y);
  }
});

test("E2E-52 @stage16 source panel in other languages", async ({ page, request }) => {
  const { id } = await draw(page, request, "Draw a dot graph", "Pipeline");
  await page.getByTestId("diagram-source").click();
  await expect(page.getByTestId("source-language")).toHaveValue("dot");
  const source = page.getByTestId("mermaid-source");
  await expect.poll(() => source.inputValue()).toContain('deploy [label="Deploy", shape=diamond];');
  await source.fill((await source.inputValue()).replace("Deploy", "Release"));
  await page.getByTestId("mermaid-apply").click();
  const v2 = await waitForVersion(request, id, 2);
  expect(v2.author).toBe("user");
  expect(sceneLabels(v2.content)).toContain("Release");
  expect(sceneLabels(v2.content)).not.toContain("Deploy");

  await page.getByTestId("source-language").selectOption("d2");
  await source.fill("a: Alpha\nb: Beta\na -> b");
  await page.getByTestId("mermaid-apply").click();
  const v3 = await waitForVersion(request, id, 3);
  expect(v3.author).toBe("user");
  const labels = sceneLabels(v3.content);
  expect(labels).toContain("Alpha");
  expect(labels).toContain("Beta");

  await source.fill("a -> {");
  await page.getByTestId("mermaid-apply").click();
  await expect(page.getByRole("alert").filter({ hasText: "line 1" })).toBeVisible();
  await page.waitForTimeout(500);
  await waitForVersion(request, id, 3);
});
