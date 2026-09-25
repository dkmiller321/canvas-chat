/**
 * Where to put a drawing in the canvas. Excalidraw's own fit-to-viewport uses the
 * whole canvas, but its toolbars float over the top and bottom of it, so a fitted
 * drawing ended up half hidden under them (found in real-model testing, 2026-09-25).
 * This fits the drawing into the area the toolbars leave free, never zooming in
 * past 100%.
 */

export type Bounds = { x0: number; y0: number; x1: number; y1: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/** The shape toolbar (top), the menu and undo bar (bottom) and the side tools (right). */
export const TOOLBAR_INSETS: Insets = { top: 76, right: 64, bottom: 76, left: 24 };

export function fitView(bounds: Bounds, viewport: { width: number; height: number }, insets: Insets = TOOLBAR_INSETS) {
  const freeW = Math.max(1, viewport.width - insets.left - insets.right);
  const freeH = Math.max(1, viewport.height - insets.top - insets.bottom);
  const w = Math.max(1, bounds.x1 - bounds.x0);
  const h = Math.max(1, bounds.y1 - bounds.y0);
  const zoom = Math.max(0.1, Math.min(1, freeW / w, freeH / h));
  // Screen = (scene + scroll) × zoom: put the drawing's centre at the free area's centre.
  const cx = insets.left + freeW / 2;
  const cy = insets.top + freeH / 2;
  return {
    zoom,
    scrollX: cx / zoom - (bounds.x0 + w / 2),
    scrollY: cy / zoom - (bounds.y0 + h / 2),
  };
}

type Positioned = { x: number; y: number; width: number; height: number; points?: unknown };

/** Where an element really is. An arrow's points are relative to (x, y) and can go up or left of it. */
function extent(e: Positioned): Bounds {
  if (Array.isArray(e.points) && e.points.length) {
    const pts = e.points as [number, number][];
    return {
      x0: e.x + Math.min(...pts.map((p) => p[0])),
      y0: e.y + Math.min(...pts.map((p) => p[1])),
      x1: e.x + Math.max(...pts.map((p) => p[0])),
      y1: e.y + Math.max(...pts.map((p) => p[1])),
    };
  }
  return { x0: e.x, y0: e.y, x1: e.x + e.width, y1: e.y + e.height };
}

export function sceneBounds(elements: readonly Positioned[]): Bounds | null {
  if (!elements.length) return null;
  const all = elements.map(extent);
  return {
    x0: Math.min(...all.map((b) => b.x0)),
    y0: Math.min(...all.map((b) => b.y0)),
    x1: Math.max(...all.map((b) => b.x1)),
    y1: Math.max(...all.map((b) => b.y1)),
  };
}
