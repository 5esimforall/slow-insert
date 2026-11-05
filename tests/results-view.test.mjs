import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultsView } from '../module/scripts/results-view.mjs';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

function node(id) {
  return { id, attributes: {}, scrolls: [], setAttribute(k,v) { this.attributes[k]=v; },
    removeAttribute(k) { delete this.attributes[k]; }, scrollIntoView(options) { this.scrolls.push(options); } };
}

test('result view selection maintains one active descendant and does not scroll on preserved refresh', () => {
  const input = node('input'), list = { replaceChildren() {} };
  const view = new ResultsView({ input, list, idPrefix: 'test' });
  view.rowElements = [node('row-0'), node('row-1')];
  view.select(0);
  assert.equal(input.attributes['aria-activedescendant'], 'row-0');
  assert.deepEqual(view.rowElements[0].scrolls, [{ block: 'nearest' }]);
  view.select(1, false);
  assert.equal(view.rowElements[0].attributes['aria-selected'], 'false');
  assert.equal(view.rowElements[1].attributes['aria-selected'], 'true');
  assert.equal(input.attributes['aria-activedescendant'], 'row-1');
  assert.equal(view.rowElements[1].scrolls.length, 0);
  view.select(-1);
  assert.equal(view.rowElements[1].attributes['aria-selected'], 'false');
  assert.equal(input.attributes['aria-activedescendant'], undefined);
});

test('clearing unavailable results removes operable rows while retaining expansion intent', () => {
  let cleared = 0;
  const input = node('input');
  const view = new ResultsView({ input, list: { replaceChildren() { cleared++; } }, idPrefix: 'test' });
  view.results = [{ item: { uuid: 'Item.old' } }];
  view.rowElements = [node('row-0')];
  view.expandedGroups.add('family');
  view.select(0); view.clear();
  assert.equal(cleared, 1);
  assert.deepEqual(view.results, []); assert.deepEqual(view.rowElements, []);
  assert.equal(view.selected, -1);
  assert.equal(input.attributes['aria-expanded'], 'false');
  assert.equal(input.attributes['aria-activedescendant'], undefined);
  assert.ok(view.expandedGroups.has('family'));
});

test('Enter flushes a pending query before choosing the row to open', () => {
  const opened = [], input = { value: 'new' };
  const panel = { input, renderedQuery: 'old', view: { results: [{ item: { uuid: 'Item.old' } }], selected: 0 },
    refresh() { this.view.results = [{ item: { uuid: 'Item.new' } }]; this.renderedQuery = 'new'; },
    openItem(index) { opened.push(this.view.results[index].item.uuid); } };
  let prevented = 0, stopped = 0;
  SlowInsertPanel.prototype.onKeydown.call(panel, { target: input, key: 'Enter', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.deepEqual(opened, ['Item.new']); assert.equal(prevented, 1); assert.equal(stopped, 1);
});

test('opening and dragging refuse revoked access or missing rows without changing a target', async () => {
  let prevented = 0;
  const item = { uuid: 'Item.private', documentType: 'Item', show() { assert.fail('must not open'); } };
  const panel = { allowed: () => false, view: { results: [{ item }], select() { assert.fail('must not select'); } } };
  await SlowInsertPanel.prototype.openItem.call(panel, 0);
  const event = { target: { closest: () => ({ dataset: { index: '0' } }) },
    dataTransfer: { setData() { assert.fail('must not drag'); } }, preventDefault() { prevented++; } };
  SlowInsertPanel.prototype.onDragStart.call(panel, event);
  panel.allowed = () => true; panel.view.results = [];
  await SlowInsertPanel.prototype.openItem.call(panel, 0);
  SlowInsertPanel.prototype.onDragStart.call(panel, event);
  assert.equal(prevented, 2);
});
