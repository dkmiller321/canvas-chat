import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const HELLO = "Hello! I am the mock model and streaming works.";
export const V1_MARKDOWN = "# Coffee Guide\n\nCoffee is a brewed drink.\n\n## Brewing\n\nUse fresh beans.";

export type Version = { versionNo: number; author: "user" | "ai"; content: string };
export type Artifact = {
  id: string;
  kind: "document" | "diagram" | "code";
  title: string;
  language?: string | null;
  currentVersion: Version | null;
};

export type SceneElement = {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  containerId?: string | null;
  label?: { text: string };
};

export async function resetDb({ request }: { request: APIRequestContext }) {
  const res = await request.post("/api/test/reset");
  expect(res.status()).toBe(200);
}

/** Type into chat-input and click send-button. */
export async function send(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("send-button").click();
}

/** Wait until the current reply has finished streaming. */
export async function waitForReply(page: Page) {
  await expect(page.getByTestId("message-assistant").last()).toBeVisible();
  await expect(page.getByTestId("stop-button")).toBeHidden({ timeout: 20_000 });
}

export async function sendAndWait(page: Page, text: string) {
  await send(page, text);
  await waitForReply(page);
}

export function conversationIdFromUrl(page: Page): string {
  const match = page.url().match(/\/c\/([0-9a-f-]{36})/);
  if (!match?.[1]) throw new Error(`No conversation id in ${page.url()}`);
  return match[1];
}

export async function getArtifact(request: APIRequestContext, id: string): Promise<Artifact> {
  const res = await request.get(`/api/artifacts/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Artifact;
}

export async function getVersions(request: APIRequestContext, id: string): Promise<Version[]> {
  const res = await request.get(`/api/artifacts/${id}/versions`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Version[];
}

/** Poll until the artifact's current version reaches `versionNo`, then return it. */
export async function waitForVersion(request: APIRequestContext, id: string, versionNo: number, timeout = 10_000) {
  await expect
    .poll(async () => (await getArtifact(request, id)).currentVersion?.versionNo ?? 0, { timeout })
    .toBe(versionNo);
  const artifact = await getArtifact(request, id);
  if (!artifact.currentVersion) throw new Error("no current version");
  return artifact.currentVersion;
}

export function sceneElements(content: string): SceneElement[] {
  const scene = JSON.parse(content) as { elements: SceneElement[] };
  return scene.elements.filter((e) => !e.isDeleted);
}

/** Every label in a scene: text elements, plus skeleton labels before conversion. */
export function sceneLabels(content: string): string[] {
  const labels: string[] = [];
  for (const el of sceneElements(content)) {
    if (el.type === "text" && el.text) labels.push(el.text);
    if (el.label?.text) labels.push(el.label.text);
  }
  return labels;
}

/** Map from label to the id of the shape that contains it. */
export function shapeIdsByLabel(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const el of sceneElements(content)) {
    if (el.type === "text" && el.text && el.containerId) map[el.text] = el.containerId;
  }
  return map;
}

export function countType(content: string, type: string): number {
  return sceneElements(content).filter((e) => e.type === type).length;
}

export async function artifactIdOfCard(page: Page, title: string): Promise<string> {
  const card = page.getByTestId("artifact-card").filter({ hasText: title }).last();
  await expect(card).toBeVisible();
  const id = await card.getAttribute("data-artifact-id");
  if (!id) throw new Error("artifact-card has no data-artifact-id");
  return id;
}

/** Send the S5 prompt from a fresh chat and wait for the document canvas. Returns the artifact id. */
export async function createDocument(page: Page): Promise<string> {
  await page.goto("/");
  await sendAndWait(page, "Write a document about coffee");
  await expect(page.getByTestId("doc-title")).toHaveText("Coffee Guide");
  await expect(page.getByTestId("doc-editor")).toContainText("Use fresh beans.");
  return artifactIdOfCard(page, "Coffee Guide");
}

/** Send the S11 prompt from the current page and wait until version 1 of the diagram is saved. */
export async function createDiagram(page: Page, request: APIRequestContext, { goto = true } = {}): Promise<string> {
  if (goto) await page.goto("/");
  await sendAndWait(page, "Draw a login flowchart");
  await expect(page.getByTestId("diagram-editor")).toBeVisible();
  const id = await artifactIdOfCard(page, "Login Flow");
  await waitForVersion(request, id, 1);
  return id;
}

/** E2E-09's manual edit: type " My note." at the end of "Use fresh beans.". */
export async function addManualNote(page: Page) {
  await page.getByTestId("doc-editor").getByText("Use fresh beans.", { exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" My note.");
}

/** Visible, non-empty lines of the document editor. */
export async function editorLines(page: Page): Promise<string[]> {
  const text = await page.getByTestId("doc-editor").innerText();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Drag a rectangle with Excalidraw's rectangle tool on empty space in the lower right of the canvas. */
export async function drawRectangle(page: Page) {
  const editor = page.getByTestId("diagram-editor");
  const box = await editor.boundingBox();
  if (!box) throw new Error("diagram-editor has no bounding box");
  const x0 = box.x + box.width * 0.62;
  const y0 = box.y + box.height * 0.72;
  // Focus the canvas without selecting anything, then pick the rectangle tool.
  await page.mouse.click(x0 - 20, y0 - 20);
  await page.keyboard.press("r");
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 80, y0 + 50, { steps: 8 });
  await page.mouse.move(x0 + 140, y0 + 90, { steps: 8 });
  await page.mouse.up();
}

/**
 * Record every tool-status text seen from now on, and whether a reply was streaming at that moment.
 * Returns a function that reads the records.
 */
export async function recordToolStatus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __toolStatus: { text: string; streaming: boolean }[] };
    w.__toolStatus = [];
    const snapshot = () => {
      const streaming = document.querySelector('[data-testid="stop-button"]') !== null;
      for (const el of document.querySelectorAll('[data-testid="tool-status"]')) {
        w.__toolStatus.push({ text: el.textContent ?? "", streaming });
      }
    };
    new MutationObserver(snapshot).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __toolStatus: { text: string; streaming: boolean }[] }).__toolStatus);
}

export async function downloadBytes(page: Page, testId: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

export type FullElement = SceneElement & {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  roughness?: number;
  fillStyle?: string;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
};

export function fullElements(content: string): FullElement[] {
  return sceneElements(content) as FullElement[];
}

/** Select shapes in the open diagram through the MOCK_LLM test hook (docs/E2E_TESTS.md §4.1). */
export async function selectShapes(page: Page, ids: string[]) {
  await page.waitForFunction(() => "__excalidrawAPI" in window);
  await page.evaluate((ids) => {
    const api = (window as unknown as { __excalidrawAPI: { updateScene: (s: unknown) => void } }).__excalidrawAPI;
    api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } });
  }, ids);
}

/** Wait until the artifact has a version newer than `after` and return it. */
export async function waitForNewVersion(request: APIRequestContext, id: string, after: number, timeout = 10_000) {
  return waitForVersion(request, id, after + 1, timeout);
}

export async function createCode(page: Page): Promise<string> {
  await page.goto("/");
  await sendAndWait(page, "Write a python script");
  await expect(page.getByTestId("code-editor")).toContainText("def fib(n):");
  return artifactIdOfCard(page, "Fibonacci");
}
