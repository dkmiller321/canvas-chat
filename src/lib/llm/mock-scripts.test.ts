import { describe, expect, it } from "vitest";
import type { ArtifactContext } from "./context";
import { buildInstructions, parseArtifactContext } from "./context";
import { chunkWords } from "./mock";
import { COFFEE_MARKDOWN, NO_SCRIPT, planResponse, type MockRequest } from "./mock-scripts";
import { buildRewriteMessage, parseRewriteMessage, quickActionInstruction } from "./rewrite-prompt";

const empty: ArtifactContext = { artifacts: [], open: null };
const docCtx: ArtifactContext = {
  artifacts: [{ id: "doc-1", kind: "document", title: "Coffee Guide", version: 2 }],
  open: { id: "doc-1", kind: "document", title: "Coffee Guide", version: 2, content: COFFEE_MARKDOWN },
};
const diagramCtx: ArtifactContext = {
  artifacts: [{ id: "dia-1", kind: "diagram", title: "Login Flow", version: 1 }],
  open: {
    id: "dia-1",
    kind: "diagram",
    title: "Login Flow",
    version: 1,
    elements: [
      { id: "u", type: "rectangle", label: "User", x: 0, y: 0, w: 100, h: 50 },
      { id: "l", type: "rectangle", label: "Login", x: 200, y: 0, w: 100, h: 50 },
    ],
  },
};

function chat(lastUser: string, context = empty, afterTool = false): MockRequest {
  return { mode: "chat", lastUser, modelId: "mock/alpha", context, afterTool };
}

describe("planResponse", () => {
  it("S1 streams the hello text, case-insensitively", () => {
    expect(planResponse(chat("Say hello"))).toEqual({
      type: "text",
      text: "Hello! I am the mock model and streaming works.",
      chunkDelayMs: 40,
    });
  });

  it("S2 is 200 words at 50 ms per chunk", () => {
    const step = planResponse(chat("Write a long story"));
    expect(step).toMatchObject({ type: "text", chunkDelayMs: 50 });
    expect(step.type === "text" && step.text.trim().split(" ")).toHaveLength(200);
  });

  it("S3 returns a ts code fence", () => {
    const step = planResponse(chat("Show me code"));
    expect(step.type === "text" && step.text).toBe("Here is code:\n\n```ts\nconst answer = 42;\n```");
  });

  it("S4 names the selected model", () => {
    expect(planResponse({ ...chat("Which model?"), modelId: "mock/beta" })).toMatchObject({
      text: "Mock reply from mock/beta",
    });
  });

  it("S5 creates the coffee document, then follows up after the tool result", () => {
    expect(planResponse(chat("Write a document about coffee"))).toEqual({
      type: "tool",
      toolName: "create_document",
      input: { title: "Coffee Guide", markdown: COFFEE_MARKDOWN },
    });
    expect(planResponse(chat("Write a document about coffee", empty, true))).toMatchObject({
      type: "text",
      text: "I drafted the Coffee Guide.",
    });
  });

  it("S6 edits the open document", () => {
    expect(planResponse(chat("Make it more formal", docCtx))).toEqual({
      type: "tool",
      toolName: "edit_document",
      input: {
        artifact_id: "doc-1",
        edits: [{ find: "Coffee is a brewed drink.", replace: "Coffee is a beverage prepared from roasted beans." }],
      },
    });
  });

  it("S7 and S8 edit the open document", () => {
    expect(planResponse(chat("Add a conclusion", docCtx))).toMatchObject({
      input: { edits: [{ find: "Use fresh beans.", replace: "Use fresh beans.\n\n## Conclusion\n\nEnjoy responsibly." }] },
    });
    expect(planResponse(chat("Break the edit", docCtx))).toMatchObject({
      input: { edits: [{ find: "TEXT THAT DOES NOT EXIST", replace: "x" }] },
    });
    // No follow-up text is scripted for S7 and S8.
    expect(planResponse(chat("Add a conclusion", docCtx, true))).toEqual({ type: "none" });
  });

  it("S11 creates the login flowchart", () => {
    expect(planResponse(chat("Draw a login flowchart"))).toEqual({
      type: "tool",
      toolName: "create_diagram",
      input: { title: "Login Flow", mermaid: "flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]" },
    });
  });

  it("S12 adds a Cache box and an arrow from Login", () => {
    expect(planResponse(chat("Add a cache", diagramCtx))).toEqual({
      type: "tool",
      toolName: "update_diagram",
      input: {
        artifact_id: "dia-1",
        operations: [
          { op: "add", id: "cache", type: "rectangle", label: "Cache" },
          { op: "add", type: "arrow", from: "l", to: "cache" },
        ],
      },
    });
  });

  it("S9 and S10 match on the rewrite instruction", () => {
    const base = { artifactId: "doc-1", document: COFFEE_MARKDOWN };
    const shorten = buildRewriteMessage({ ...base, instruction: "shorten", selectedText: "Use fresh beans." });
    expect(planResponse({ ...chat(shorten), mode: "rewrite" })).toEqual({
      type: "tool",
      toolName: "rewrite_selection",
      input: { artifact_id: "doc-1", selected_text: "Use fresh beans.", replacement: "Grind beans fresh." },
    });

    const formal = buildRewriteMessage({ ...base, instruction: quickActionInstruction("formal"), selectedText: COFFEE_MARKDOWN });
    expect(planResponse({ ...chat(formal), mode: "rewrite" })).toMatchObject({
      input: { selected_text: COFFEE_MARKDOWN, replacement: COFFEE_MARKDOWN.replaceAll("Coffee", "COFFEE") },
    });
  });

  it("S13 always titles Mock Title", () => {
    expect(planResponse({ ...chat("anything"), mode: "title" })).toMatchObject({ text: "Mock Title" });
  });

  it("falls back to the no-script reply", () => {
    expect(planResponse(chat("What is the weather?"))).toMatchObject({ type: "text", text: NO_SCRIPT });
  });
});

describe("chunkWords", () => {
  it("groups three words per chunk and keeps whitespace", () => {
    const text = "Hello! I am the mock model and streaming works.";
    const chunks = chunkWords(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0]).toBe("Hello! I am ");
    expect(chunks).toHaveLength(3);
  });

  it("preserves newlines in code fences", () => {
    const text = "Here is code:\n\n```ts\nconst answer = 42;\n```";
    expect(chunkWords(text).join("")).toBe(text);
  });
});

describe("prompt formats round-trip", () => {
  it("artifact context", () => {
    expect(parseArtifactContext(buildInstructions(docCtx))).toEqual(docCtx);
    expect(parseArtifactContext(buildInstructions(empty))).toEqual(empty);
  });

  it("rewrite message", () => {
    const req = { artifactId: "a", instruction: "shorten", selectedText: "x\ny", document: "# T\n\nx\ny" };
    expect(parseRewriteMessage(buildRewriteMessage(req))).toEqual(req);
  });
});
