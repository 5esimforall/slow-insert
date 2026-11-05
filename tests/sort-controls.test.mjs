import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SortControls } from '../module/scripts/sort-controls.mjs';
import { language } from './localization.mjs';

// Minimal DOM contract for control/event wiring; not a browser layout or drag test.
function installDOM(t) {
  const previous = { document: globalThis.document, game: globalThis.game };
  t.after(() => Object.assign(globalThis, previous));
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.attributes = new Map(); this.className = ''; }
    get classList() { return { add: cls => { this.className += ` ${cls}`; } }; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('[')) return this.attributes.has(selector.slice(1, -1));
      return this.tagName === selector;
    }
    querySelectorAll(selector) {
      const [first, rest] = selector.split(' ');
      return this.children.flatMap(child => [
        ...(child.matches(first) ? rest ? child.querySelectorAll(rest) : [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  }
  globalThis.document = { activeElement: null, createElement: tag => new Element(tag) };
  globalThis.game = { i18n: language('en') };
}
function setup(t, keys = [{ field: 'level', direction: 'desc' }, { field: 'school', direction: 'asc' }, { field: 'name', direction: 'desc' }]) {
  installDOM(t);
  const changes = [];
  const controls = new SortControls({ scheme: 'spells', state: { profiles: { spells: { mode: 'manual', keys, nameOrder: 'english' } } }, onChange: state => changes.push(structuredClone(state)) });
  const rows = () => controls.root.querySelectorAll('.si-sort-rule');
  const handles = () => controls.root.querySelectorAll('.si-sort-number');
  return { controls, changes, rows, handles };
}
function fire(element, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  element.dispatchEvent(event);
  return event;
}
function transfer() {
  return { types: [], setData(type, value) { this.types.push(type); this.value = value; } };
}
function change(select, value) { select.value = value; fire(select, 'change'); }
const fields = controls => controls.keys.map(key => key.field);

test('editor has only per-rule fields and name order, without the primary dropdown, up buttons or help paragraph', t => {
  const { controls, rows, handles } = setup(t);
  assert.equal(controls.root.querySelectorAll('select').length, 4);
  assert.equal(rows().length, 3);
  assert.ok(rows().every(row => row.children.length === 4));
  assert.deepEqual(handles().map(handle => handle.textContent), ['1', '2', '3']);
  assert.ok(handles().every(handle => handle.draggable && handle.tagName === 'button'));
  assert.equal(controls.root.querySelector('p'), null);
  assert.equal(controls.select, undefined);
  assert.equal(controls.more, undefined);
  const panel = readFileSync(new URL('../module/scripts/panel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /sorting\.(drawer|more|setExpanded)/);
  for (const lang of ['en', 'cn']) {
    const labels = JSON.parse(readFileSync(new URL(`../module/lang/${lang}.json`, import.meta.url), 'utf8'));
    assert.ok(labels['SLOWINSERT.Sort.Reorder'].includes('{n}'));
    assert.equal(labels['SLOWINSERT.Sort.MoveUp'], undefined);
    assert.equal(labels['SLOWINSERT.Sort.Help'], undefined);
  }
});

test('number-handle drop moves the whole rule down or up, retains directions/name order and focuses its new number', t => {
  const { controls, changes, rows, handles } = setup(t);
  const original = structuredClone(controls.keys);
  let dataTransfer = transfer();
  fire(handles()[0], 'dragstart', { dataTransfer });
  assert.equal(dataTransfer.effectAllowed, 'move');
  assert.equal(rows()[0].getAttribute('data-dragging'), 'true');
  assert.equal(fire(rows()[2], 'dragover', { dataTransfer }).defaultPrevented, true);
  assert.equal(rows()[2].getAttribute('data-drop-position'), 'after');
  fire(rows()[2], 'drop', { dataTransfer });
  assert.deepEqual(controls.keys, [original[1], original[2], original[0]]);
  assert.equal(controls.profile.nameOrder, 'english');
  assert.equal(document.activeElement, handles()[2]);
  assert.equal(changes.length, 1);
  dataTransfer = transfer();
  fire(handles()[2], 'dragstart', { dataTransfer });
  fire(rows()[0], 'dragover', { dataTransfer });
  assert.equal(rows()[0].getAttribute('data-drop-position'), 'before');
  fire(rows()[0], 'drop', { dataTransfer });
  assert.deepEqual(controls.keys, original);
  assert.equal(document.activeElement, handles()[0]);
  assert.equal(controls.draggedRuleIndex, null);
  assert.ok(rows().every(row => row.getAttribute('data-drop-position') === null));
});

test('foreign drops, same-position drops, cancelled drags and invalid moves leave sorting untouched', t => {
  const { controls, changes, rows, handles } = setup(t);
  const original = structuredClone(controls.state);
  assert.equal(fire(rows()[1], 'drop', { dataTransfer: { types: ['text/plain'] } }).defaultPrevented, false);
  const otherEditorData = transfer(); otherEditorData.setData('application/x-slow-insert-sort-rule', '0');
  assert.equal(fire(rows()[1], 'drop', { dataTransfer: otherEditorData }).defaultPrevented, false);
  const dataTransfer = transfer();
  fire(handles()[0], 'dragstart', { dataTransfer });
  fire(rows()[0], 'drop', { dataTransfer });
  fire(handles()[0], 'dragstart', { dataTransfer });
  fire(rows()[2], 'dragover', { dataTransfer });
  fire(rows()[2], 'dragleave', { relatedTarget: null });
  assert.equal(rows()[2].getAttribute('data-drop-position'), null);
  fire(handles()[0], 'dragend');
  fire(rows()[2], 'drop', { dataTransfer });
  for (const [from, to] of [[-1, 0], [0, 3], [0, 0], [NaN, 1], [0, 1.5], ['0', 1]]) controls.moveRule(from, to);
  assert.equal(changes.length, 0);
  assert.deepEqual(controls.state, original);
  assert.ok(rows().every(row => row.getAttribute('data-dragging') === null));
});

test('query or scheme refresh cancels a pending drag, and scheme profiles stay independent', t => {
  const { controls, changes, rows, handles } = setup(t);
  const original = structuredClone(controls.profile);
  const dataTransfer = transfer();
  fire(handles()[0], 'dragstart', { dataTransfer });
  controls.update('spells', 'fire');
  fire(rows()[2], 'drop', { dataTransfer });
  assert.equal(changes.length, 0);
  fire(handles()[0], 'dragstart', { dataTransfer });
  controls.update('items', '');
  fire(rows()[0], 'drop', { dataTransfer });
  assert.equal(changes.length, 0);
  assert.equal(controls.profile.mode, 'auto');
  assert.equal(handles()[0].disabled, true);
  assert.equal(fire(handles()[0], 'dragstart', { dataTransfer }).defaultPrevented, true);
  controls.update('spells', '');
  assert.deepEqual(controls.profile, original);
});

test('keyboard reordering supports both directions and endpoints without consuming unrelated keys', t => {
  const { controls, changes, handles } = setup(t);
  handles()[0].focus();
  assert.equal(fire(handles()[0], 'keydown', { key: 'ArrowUp' }).defaultPrevented, true);
  assert.equal(changes.length, 0);
  fire(handles()[0], 'keydown', { key: 'ArrowDown' });
  assert.deepEqual(fields(controls), ['school', 'level', 'name']);
  assert.equal(document.activeElement, handles()[1]);
  fire(handles()[1], 'keydown', { key: 'End' });
  assert.deepEqual(fields(controls), ['school', 'name', 'level']);
  fire(handles()[2], 'keydown', { key: 'Home' });
  assert.deepEqual(fields(controls), ['level', 'school', 'name']);
  fire(handles()[2], 'keydown', { key: 'ArrowUp' });
  assert.deepEqual(fields(controls), ['level', 'name', 'school']);
  assert.equal(fire(handles()[1], 'keydown', { key: 'Escape' }).defaultPrevented, false);
});

test('rule edits, three-rule limit, removal, auto reset and name order still work through the single editor', t => {
  const { controls, rows, handles } = setup(t, [{ field: 'level', direction: 'asc' }]);
  assert.equal(handles()[0].draggable, false);
  assert.equal(rows()[0].children[3].disabled, true);
  change(rows()[0].children[1], 'source');
  rows()[0].children[2].click();
  assert.deepEqual(controls.keys, [{ field: 'source', direction: 'desc' }]);
  let actions = () => controls.root.querySelector('.si-sort-actions').children;
  actions()[0].click(); actions()[0].click();
  assert.equal(rows().length, 3);
  assert.equal(actions()[0].disabled, true);
  assert.deepEqual(fields(controls), ['source', 'name', 'level']);
  assert.equal(rows()[0].children[1].children.some(option => option.value === 'name'), false);
  rows()[1].children[3].click();
  assert.deepEqual(fields(controls), ['source', 'level']);
  controls.update('spells', 'fire');
  actions()[1].click();
  assert.equal(controls.profile.mode, 'auto');
  assert.deepEqual(fields(controls), ['relevance']);
  assert.equal(rows()[0].children[2].disabled, true);
  assert.equal(document.activeElement, rows()[0].children[1]);
  change(controls.root.querySelector('.si-sort-language select'), 'local');
  assert.equal(controls.profile.nameOrder, 'local');
  controls.update('spells', '');
  assert.deepEqual(fields(controls), ['level']);
});
