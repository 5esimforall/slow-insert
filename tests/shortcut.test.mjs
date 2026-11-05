import test from 'node:test';
import assert from 'node:assert/strict';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

function fixture(t) {
  const previous = { ui: globalThis.ui, game: globalThis.game };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.ui = { sidebar: { expanded: true } };
  const calls = [];
  const panel = Object.assign(Object.create(SlowInsertPanel.prototype), {
    allowed: () => true, sidebarHost: { app: { active: true, rendered: true } },
    open() { calls.push('open'); }, swapLayout() { calls.push('swap'); }
  });
  return { panel, calls };
}

test('shortcut opens a hidden workspace and swaps either visible region in sidebar or native windows', t => {
  const { panel, calls } = fixture(t);
  const app = panel.sidebarHost.app;
  assert.equal(panel.openOrSwap(), true);
  ui.sidebar.expanded = false; panel.openOrSwap();
  ui.sidebar.expanded = true; app.active = false; panel.openOrSwap();
  app.isPopout = true; panel.openOrSwap();
  app.rendered = false; panel.openOrSwap();
  panel.searchInWindow = true; panel.browseWindow = { rendered: true }; panel.openOrSwap();
  panel.browseWindow.rendered = false; panel.openOrSwap();
  app.isPopout = false; app.active = true; panel.openOrSwap();
  panel.searchInWindow = false; app.active = false; panel.browseWindow.rendered = true; panel.openOrSwap();
  assert.deepEqual(calls, ['swap', 'open', 'open', 'swap', 'open', 'swap', 'open', 'swap', 'swap']);
});

test('shortcut rejects denied, destroyed and composing contexts; held keys and in-flight swaps are consumed once', t => {
  const { panel, calls } = fixture(t);
  assert.equal(panel.openOrSwap({ isComposing: true }), false);
  assert.equal(panel.openOrSwap({ repeat: true }), true);
  panel.swappingLayout = true; assert.equal(panel.openOrSwap(), true);
  panel.swappingLayout = false;
  panel.allowed = () => false; assert.equal(panel.openOrSwap(), false);
  panel.allowed = () => true; panel.destroyed = true; assert.equal(panel.openOrSwap(), false);
  assert.deepEqual(calls, []);
});

test('local shortcut uses native binding matches, consumes only its action and honors changed or removed bindings', t => {
  const { panel, calls } = fixture(t);
  let matches = [], prevented = 0, stopped = 0, contexts = 0;
  const event = { preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
  globalThis.game = { keyboard: { constructor: {
    getKeyboardEventContext(value) { assert.equal(value, event); contexts++; return value; },
    _getMatchingActions(value) { assert.equal(value, event); return matches; }
  } } };
  panel.onShortcut(event);
  matches = [{ action: 'core.dismiss' }]; panel.onShortcut(event);
  matches = [{ action: 'slow-insert.toggle' }]; panel.onShortcut(event);
  event.repeat = true; panel.onShortcut(event); delete event.repeat;
  panel.allowed = () => false; panel.onShortcut(event);
  panel.allowed = () => true;
  matches = []; panel.onShortcut(event);
  assert.deepEqual(calls, ['swap']); assert.equal(prevented, 2); assert.equal(stopped, 2);
  const before = contexts;
  event.isComposing = true; panel.onShortcut(event); delete event.isComposing;
  event.defaultPrevented = true; panel.onShortcut(event);
  assert.equal(contexts, before);
});
