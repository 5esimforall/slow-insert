import test from "node:test";
import assert from "node:assert/strict";
import { hasPriorityEscapeTarget } from "../module/scripts/escape.mjs";
import { SlowInsertPanel } from "../module/scripts/panel.mjs";

const environment = () => ({ ui: { windows: {} }, foundry: { applications: { instances: new Map() } }, canvas: {} });
function setup(t) {
  const env = environment();
  for (const [key, value] of Object.entries({ ...env, game: {} })) {
    const previous = globalThis[key];
    globalThis[key] = value;
    t.after(() => { previous === undefined ? delete globalThis[key] : globalThis[key] = previous; });
  }
  const panel = Object.assign(Object.create(SlowInsertPanel.prototype), {
    visible: true, closed: 0, allowed: () => true,
    filterControls: { expanded: true, setExpanded() { throw new Error("Do not spend an Escape press on filters"); } },
    close() { this.closed++; this.visible = false; }
  });
  return { ...env, panel };
}
const escape = (properties = {}) => ({
  key: "Escape", code: "Escape", defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties
});

test("Escape yields to V1/V2 windows, including closing animations but not frameless UI", () => {
  const env = environment();
  assert.equal(hasPriorityEscapeTarget(env), false);
  env.ui.windows.one = { rendered: true };
  assert.equal(hasPriorityEscapeTarget(env), true);
  env.ui.windows.one = { rendered: false, element: [{ isConnected: true }] };
  assert.equal(hasPriorityEscapeTarget(env), true);
  env.ui.windows.one.element[0].isConnected = false;
  assert.equal(hasPriorityEscapeTarget(env), false);
  env.foundry.applications.instances.set("two", { hasFrame: false, rendered: true });
  assert.equal(hasPriorityEscapeTarget(env), false);
  env.foundry.applications.instances.set("two", { hasFrame: true, rendered: false, element: { isConnected: true } });
  assert.equal(hasPriorityEscapeTarget(env), true);
});

test("native menus, context menus, tours and drags have priority", () => {
  for (const update of [
    env => env.ui.menu = { rendered: true },
    env => env.ui.context = { element: {} },
    env => env.foundry.nue = { Tour: { tourInProgress: true } },
    env => env.canvas.currentMouseManager = {}
  ]) {
    const env = environment(); update(env);
    assert.equal(hasPriorityEscapeTarget(env), true);
  }
});

test("global Escape leaves the first press to the window and closes the panel on the next press", t => {
  const { panel, ui } = setup(t);
  ui.windows.sheet = { rendered: true };
  assert.equal(panel.onEscape(escape()), false);
  assert.equal(panel.closed, 0);
  delete ui.windows.sheet; // Native dismiss completes.
  assert.equal(panel.onEscape(escape()), true);
  assert.equal(panel.closed, 1);
  assert.equal(panel.filterControls.expanded, true);
});

test("document Escape is forwarded once with force regardless of focus, never closing both layers", t => {
  const { panel, ui } = setup(t);
  ui.windows.sheet = { rendered: true };
  let forwarded = 0;
  globalThis.game.keyboard = { constructor: { emulateKeypress(up, code, options) {
    assert.equal(up, false); assert.equal(code, "Escape"); assert.deepEqual(options, { force: true });
    forwarded++;
    assert.equal(panel.onEscape(escape()), false); // Our registered action yields to core.
    delete ui.windows.sheet; // Core closes it synchronously in this regression case.
  } } };
  const first = escape({ target: { id: "outside-input" } });
  panel.onDocumentKeydown(first);
  assert.equal(forwarded, 1);
  assert.equal(first.defaultPrevented && first.stopped, true);
  assert.equal(panel.closed, 0);
  panel.onDocumentKeydown(escape({ target: { id: "outside-input" } }));
  assert.equal(panel.closed, 1);
});

test("already-handled, IME, modified and repeated Escape presses are ignored", t => {
  const { panel } = setup(t);
  for (const flag of ["defaultPrevented", "isComposing", "repeat", "ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    assert.equal(panel.onEscape(escape({ [flag]: true })), false, flag);
  }
  panel.visible = false;
  assert.equal(panel.onEscape(escape()), false);
  assert.equal(panel.closed, 0);
  panel.visible = true; panel.allowed = () => false;
  assert.equal(panel.onEscape(escape()), true); // Revoked search permission must not trap an open panel.
  assert.equal(panel.closed, 1);
});

test("missing native forwarding API fails open without swallowing Escape or closing the panel", t => {
  const { panel, ui } = setup(t);
  ui.windows.sheet = { rendered: true };
  const event = escape();
  panel.onDocumentKeydown(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(panel.closed, 0);
});

test("document listener ignores non-Escape and already handled events", t => {
  const { panel } = setup(t);
  const other = escape({ key: "Enter", code: "Enter" });
  panel.onDocumentKeydown(other);
  assert.equal(other.defaultPrevented, false);
  panel.onDocumentKeydown(escape({ defaultPrevented: true }));
  assert.equal(panel.closed, 0);
});
