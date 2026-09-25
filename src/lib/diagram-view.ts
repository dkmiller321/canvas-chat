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

export function sceneBounds(
  elements: readonly { x: number; y: number; width: number; height: number }[],
): Bounds | null {
  if (!elements.length) return null;
  return {
    x0: Math.min(...elements.map((e) => e.x)),
    y0: Math.min(...elements.map((e) => e.y)),
    x1: Math.max(...elements.map((e) => e.x + e.width)),
    y1: Math.max(...elements.map((e) => e.y + e.height)),
  };
}
