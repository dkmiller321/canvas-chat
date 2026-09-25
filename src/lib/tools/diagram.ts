import { applyPreset, arrowStyle, paletteIndex, shapeStyle } from "@/lib/diagram-style";
import { ToolError } from "./document";
import type { DiagramOperation } from "./schemas";
import { labelOf, type Scene, type SceneElement } from "./scene";

/** Pure diagram tool: (operations, current scene) → new scene (PRD G4). Ids of untouched elements never change. */

type Box = { x: number; y: number; width: number; height: number };

const DEFAULT_SIZE = { rectangle: [160, 70], ellipse: [160, 80], diamond: [160, 100], text: [120, 30] } as const;
const GAP = 90;
const FONT_SIZE = 20;
const LINE_HEIGHT = 1.25;

const rand = () => Math.floor(Math.random() * 2 ** 31);
const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 20);

function base(type: string, box: Box, extra: Partial<SceneElement> = {}): SceneElement {
  return {
    id: newId(),
    type,
    ...box,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" || type === "diamond" ? { type: 3 } : type === "arrow" ? { type: 2 } : null,
    seed: rand(),
    version: 1,
    versionNonce: rand(),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

function textBox(text: string): { width: number; height: number } {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  return { width: Math.max(10, longest * FONT_SIZE * 0.55), height: lines.length * FONT_SIZE * LINE_HEIGHT };
}

function textElement(text: string, box: Box, containerId: string | null): SceneElement {
  const size = textBox(text);
  return base(
    "text",
    {
      x: box.x + (box.width - size.width) / 2,
      y: box.y + (box.height - size.height) / 2,
      ...size,
    },
    {
      text,
      originalText: text,
      fontSize: FONT_SIZE,
      fontFamily: 5,
      textAlign: "center",
      verticalAlign: "middle",
      containerId,
      autoResize: true,
      lineHeight: LINE_HEIGHT,
      strokeColor: "#1e1e1e",
    },
  );
}

function touch(el: SceneElement) {
  el.version = (typeof el.version === "number" ? el.version : 1) + 1;
  el.versionNonce = rand();
  el.updated = Date.now();
}

function center(b: Box) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Point where the ray from the box centre towards `toward` leaves the box. */
function edgePoint(b: Box, toward: { x: number; y: number }) {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : b.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : b.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function overlaps(a: Box, b: Box, margin = 20) {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

export function applyDiagramOps(scene: Scene, operations: DiagramOperation[]): Scene {
  const elements: SceneElement[] = structuredClone(scene.elements);
  const byId = new Map(elements.filter((e) => !e.isDeleted).map((e) => [e.id, e]));
  const tempIds = new Map<string, string>();

  const resolve = (ref: string, opIndex: number): SceneElement => {
    const el = byId.get(tempIds.get(ref) ?? ref);
    if (!el) throw new ToolError(`Operation ${opIndex + 1} failed: no element with id "${ref}".`);
    return el;
  };
  const shapes = () =>
    elements.filter((e) => !e.isDeleted && e.type !== "arrow" && !(e.type === "text" && e.containerId));
  const add = (el: SceneElement) => {
    elements.push(el);
    byId.set(el.id, el);
  };

  /** Free spot for a new shape: below the element it will connect to, else right of everything. */
  function place(opIndex: number, tempId: string | undefined, size: { width: number; height: number }): Box {
    let anchor: SceneElement | undefined;
    if (tempId) {
      for (const later of operations.slice(opIndex + 1)) {
        if (later.op !== "add" || later.type !== "arrow") continue;
        const other = later.to === tempId ? later.from : later.from === tempId ? later.to : undefined;
        if (other && byId.has(tempIds.get(other) ?? other)) {
          anchor = byId.get(tempIds.get(other) ?? other);
          break;
        }
      }
    }
    const all = shapes();
    let box: Box;
    if (anchor) {
      box = { x: anchor.x + (anchor.width - size.width) / 2, y: anchor.y + anchor.height + GAP, ...size };
    } else if (all.length > 0) {
      const right = Math.max(...all.map((e) => e.x + e.width));
      const top = Math.min(...all.map((e) => e.y));
      box = { x: right + GAP, y: top, ...size };
    } else {
      box = { x: 0, y: 0, ...size };
    }
    while (all.some((e) => overlaps(e, box))) box = { ...box, y: box.y + size.height + GAP / 2 };
    return box;
  }

  function connect(arrow: SceneElement, from: SceneElement, to: SceneElement) {
    const start = edgePoint(from, center(to));
    const end = edgePoint(to, center(from));
    Object.assign(arrow, {
      x: start.x,
      y: start.y,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      points: [
        [0, 0],
        [end.x - start.x, end.y - start.y],
      ],
      startBinding: { elementId: from.id, focus: 0, gap: 8 },
      endBinding: { elementId: to.id, focus: 0, gap: 8 },
    });
    for (const shape of [from, to]) {
      shape.boundElements = [...(shape.boundElements ?? []), { id: arrow.id, type: "arrow" }];
      touch(shape);
    }
  }

  function setLabel(el: SceneElement, label: string) {
    if (el.type === "text") {
      Object.assign(el, { text: label, originalText: label, ...textBox(label) });
      touch(el);
      return;
    }
    const boundId = el.boundElements?.find((b) => b.type === "text")?.id;
    const bound = boundId ? byId.get(boundId) : undefined;
    if (bound) {
      const size = textBox(label);
      Object.assign(bound, {
        text: label,
        originalText: label,
        ...size,
        x: el.x + (el.width - size.width) / 2,
        y: el.y + (el.height - size.height) / 2,
      });
      touch(bound);
      return;
    }
    const text = textElement(label, el, el.id);
    el.boundElements = [...(el.boundElements ?? []), { id: text.id, type: "text" }];
    touch(el);
    add(text);
  }

  operations.forEach((op, i) => {
    switch (op.op) {
      case "add": {
        if (op.type === "arrow") {
          if (!op.from || !op.to) throw new ToolError(`Operation ${i + 1} failed: an arrow needs from and to.`);
          const from = resolve(op.from, i);
          const to = resolve(op.to, i);
          const arrow = base(
            "arrow",
            { x: 0, y: 0, width: 0, height: 0 },
            {
              ...arrowStyle,
              startArrowhead: null,
              endArrowhead: "arrow",
              elbowed: false,
              lastCommittedPoint: null,
            },
          );
          if (op.strokeColor) arrow.strokeColor = op.strokeColor;
          connect(arrow, from, to);
          add(arrow);
          if (op.label) setLabel(arrow, op.label);
          if (op.id) tempIds.set(op.id, arrow.id);
          break;
        }
        const [w, h] = DEFAULT_SIZE[op.type];
        const size = { width: op.width ?? w, height: op.height ?? h };
        const box = op.x !== undefined && op.y !== undefined ? { x: op.x, y: op.y, ...size } : place(i, op.id, size);
        const el =
          op.type === "text"
            ? textElement(op.label ?? "", box, null)
            : base(op.type, box, {
                // New shapes continue the diagram's palette unless the model picked colours.
                ...shapeStyle(paletteIndex(elements)),
                ...(op.strokeColor && { strokeColor: op.strokeColor }),
                ...(op.backgroundColor && { backgroundColor: op.backgroundColor }),
              });
        add(el);
        if (op.label && op.type !== "text") setLabel(el, op.label);
        if (op.id) tempIds.set(op.id, el.id);
        break;
      }
      case "remove": {
        const el = resolve(op.id, i);
        const doomed = new Set([el.id]);
        for (const b of el.boundElements ?? []) doomed.add(b.id);
        for (const e of elements) {
          if (e.containerId === el.id || e.startBinding?.elementId === el.id || e.endBinding?.elementId === el.id) {
            doomed.add(e.id);
            for (const b of e.boundElements ?? []) if (b.type === "text") doomed.add(b.id);
          }
        }
        for (const e of elements) {
          if (doomed.has(e.id)) {
            e.isDeleted = true;
            touch(e);
            byId.delete(e.id);
          } else if (e.boundElements?.some((b) => doomed.has(b.id))) {
            e.boundElements = e.boundElements.filter((b) => !doomed.has(b.id));
            touch(e);
          }
        }
        break;
      }
      case "relabel":
        setLabel(resolve(op.id, i), op.label);
        break;
      case "restyle": {
        const el = resolve(op.id, i);
        const { op: _op, id: _id, ...style } = op;
        for (const [k, v] of Object.entries(style)) if (v !== undefined) el[k] = v;
        touch(el);
        break;
      }
      case "preset": {
        // Whole-diagram restyle (G7); ids and positions are unchanged.
        const styled = applyPreset(elements, op.preset);
        elements.splice(0, elements.length, ...styled);
        byId.clear();
        for (const e of elements) if (!e.isDeleted) byId.set(e.id, e);
        break;
      }
    }
  });

  return { ...scene, elements };
}

/** Labels of every live element, for tests and summaries. */
export function sceneLabelList(scene: Scene): string[] {
  return scene.elements
    .filter((e) => !e.isDeleted && !(e.type === "text" && e.containerId))
    .map((e) => labelOf(scene, e))
    .filter((l): l is string => Boolean(l));
}
