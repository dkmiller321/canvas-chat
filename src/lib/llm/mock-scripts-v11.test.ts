import { describe, expect, it } from "vitest";
import type { ArtifactContext } from "./context";
import { FIB_CODE, LOGIN_MERMAID, planResponse, type MockRequest } from "./mock-scripts";
import { buildDiagramRewriteMessage, buildRewriteMessage, quickActionInstruction } from "./rewrite-prompt";

const codeCtx: ArtifactContext = {
  artifacts: [{ id: "code-1", kind: "code", title: "Fibonacci", version: 1 }],
  open: { id: "code-1", kind: "code", title: "Fibonacci", version: 1, language: "python", content: FIB_CODE },
};
const diagramCtx: ArtifactContext = {
  artifacts: [{ id: "dia-1", kind: "diagram", title: "Login Flow", version: 1 }],
  open: { id: "dia-1", kind: "diagram", title: "Login Flow", version: 1, elements: [] },
};
const req = (lastUser: string, context: ArtifactContext = { artifacts: [], open: null }, mode: MockRequest["mode"] = "chat"): MockRequest => ({
  mode,
  lastUser,
  modelId: "mock/alpha",
  context,
  afterTool: false,
});

describe("v1.1 mock scripts", () => {
  it("S14 creates the Fibonacci code artifact", () => {
    expect(planResponse(req("Write a python script"))).toEqual({
      type: "tool",
      toolName: "create_code",
      input: { title: "Fibonacci", language: "python", code: FIB_CODE },
    });
    expect(planResponse({ ...req("Write a python script"), afterTool: true })).toMatchObject({ text: "Here is the script." });
  });

  it("S15 edits the open code artifact", () => {
    expect(planResponse(req("Rename the function", codeCtx))).toMatchObject({
      toolName: "edit_document",
      input: { artifact_id: "code-1", edits: [{ find: "def fib(n):", replace: "def fibonacci(n):" }, { find: "print(fib(10))" }] },
    });
  });

  it("S16 prepends a comment to the whole code", () => {
    const msg = buildRewriteMessage({ artifactId: "code-1", instruction: quickActionInstruction("comments"), selectedText: FIB_CODE, document: FIB_CODE });
    expect(planResponse(req(msg, codeCtx, "rewrite"))).toMatchObject({
      input: { replacement: `# Compute Fibonacci numbers.\n${FIB_CODE}` },
    });
  });

  it("S17 and S18 only touch the selected shapes", () => {
    const base = { artifactId: "dia-1", selectedIds: ["login"], elements: [] };
    const red = buildDiagramRewriteMessage({ ...base, instruction: "make it red" });
    expect(planResponse(req(red, diagramCtx, "diagram-rewrite"))).toEqual({
      type: "tool",
      toolName: "update_diagram",
      input: { artifact_id: "dia-1", operations: [{ op: "restyle", id: "login", strokeColor: "#e03131", backgroundColor: "#ffc9c9" }] },
    });
    const rename = buildDiagramRewriteMessage({ ...base, instruction: "rename to auth" });
    expect(planResponse(req(rename, diagramCtx, "diagram-rewrite"))).toMatchObject({
      input: { operations: [{ op: "relabel", id: "login", label: "Auth" }] },
    });
  });

  it("S19 applies the monochrome preset", () => {
    expect(planResponse(req("Make it monochrome", diagramCtx))).toMatchObject({
      input: { artifact_id: "dia-1", operations: [{ op: "preset", preset: "monochrome" }] },
    });
  });

  it("S20–S24 create each diagram type", () => {
    const cases: [string, string, string][] = [
      ["Draw a sequence diagram", "Greeting", "sequenceDiagram"],
      ["Draw a class diagram", "Animals", "classDiagram"],
      ["Draw a state diagram", "Runner", "stateDiagram-v2"],
      ["Draw an ER diagram", "Orders", "erDiagram"],
      ["Draw a mind map", "Coffee Map", "mindmap"],
    ];
    for (const [prompt, title, kind] of cases) {
      const step = planResponse(req(prompt));
      expect(step).toMatchObject({ toolName: "create_diagram", input: { title } });
      expect(step.type === "tool" && (step.input as { mermaid: string }).mermaid.startsWith(kind)).toBe(true);
    }
    expect(planResponse(req("Draw a login flowchart"))).toMatchObject({ input: { mermaid: LOGIN_MERMAID } });
  });
});
