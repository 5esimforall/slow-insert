/** Native dismiss targets must get Escape before our persistent search panel. */
export function hasPriorityEscapeTarget({
  ui = globalThis.ui,
  foundry = globalThis.foundry,
  canvas = globalThis.canvas
} = {}) {
  if (canvas?.currentMouseManager || ui?.menu?.rendered || ui?.context?.element
    || foundry?.nue?.Tour?.tourInProgress) return true;

  // Keep yielding during close animations, even after rendered becomes false.
  // V1 elements are jQuery wrappers; V2 elements are HTMLElements.
  const open = app => Boolean(app?.rendered || (app?.element?.[0] ?? app?.element)?.isConnected);
  return Object.values(ui?.windows ?? {}).some(open)
    || [...(foundry?.applications?.instances?.values() ?? [])].some(app => app.hasFrame && open(app));
}
