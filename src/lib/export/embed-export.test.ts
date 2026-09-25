import { describe, expect, it } from "vitest";
import { diagramIds } from "@/lib/diagram-embed";
import type { DiagramImage } from "./diagram-images";
import { markdownToDocx } from "./docx";
import { markdownToHtmlBody } from "./html";
import { parseMarkdown } from "./markdown";

const ID = "11111111-2222-3333-4444-555555555555";
const MD = `# Plan\n\nIntro.\n\n![Login Flow](diagram://${ID})\n\n- [ ] Buy beans\n- [x] Grind\n`;
// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const image: DiagramImage = { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Login</text></svg>', png: PNG, width: 400, height: 200 };

describe("diagram embeds and task lists in exports", () => {
  it("finds embedded diagram ids once each", () => {
    expect(diagramIds(`${MD}\n![Again](diagram://${ID})`)).toEqual([ID]);
  });

  it("parses embeds and task lists with the editor's extensions", () => {
    const types = parseMarkdown(MD).content?.map((n) => n.type);
    expect(types).toEqual(["heading", "paragraph", "diagramEmbed", "taskList"]);
  });

  it("inlines the diagram SVG and renders checkboxes in HTML", () => {
    const html = markdownToHtmlBody(MD, new Map([[ID, image]]));
    expect(html).toContain('<figure class="diagram"><img src="data:image/svg+xml;base64,');
    expect(html).toContain("<figcaption>Login Flow</figcaption>");
    expect(html).toContain('data-box="☐"');
    expect(html).toContain('data-box="☑"');
  });

  it("shows a placeholder when a diagram could not be rendered", () => {
    expect(markdownToHtmlBody(MD)).toContain("[Diagram: Login Flow]");
  });

  it("puts the diagram image into the DOCX media folder", async () => {
    const buf = await markdownToDocx(MD, "Plan", new Map([[ID, image]]));
    expect(buf.toString("latin1")).toContain("word/media/");
  });
});
