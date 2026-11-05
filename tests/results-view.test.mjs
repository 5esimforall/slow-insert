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

test('players retain expansion and personal pins but have no identity-exclusion controls', t => {
  const old={document:globalThis.document,game:globalThis.game};t.after(()=>Object.assign(globalThis,old));
  const element=()=>({children:[],dataset:{},classList:{add(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
  globalThis.document={createElement:element,createDocumentFragment:element};
  globalThis.game={user:{isGM:false},i18n:{format:k=>k,localize:k=>k}};
  const list=element(),view=new ResultsView({list,input:element(),idPrefix:'test'});
  view.renderRow=()=>element();view.expandedGroups.add('g');
  const members=[{uuid:'a',result:{item:{name:'A'}}},{uuid:'b',result:{item:{name:'B'}}}];
  const group={key:'g',members,representative:members[0],kind:'family'};
  const all=n=>[n,...n.children.flatMap(all)];
  const actions=()=>all(list).map(n=>n.dataset?.groupAction).filter(Boolean);
  view.render([group],{environment:{},pins:{}});
  assert.deepEqual(actions(),['expand','pin','pin']);
  game.user.isGM=true;view.render([group],{environment:{},pins:{}});
  assert.deepEqual(actions(),['expand','pin','exclude','pin','exclude']);
});

test('GM identity warnings use shared Truesight localization rather than a consumer-owned copy', t => {
  const before={document:globalThis.document,game:globalThis.game};t.after(()=>Object.assign(globalThis,before));
  const element=()=>({children:[],dataset:{},setAttribute(){},addEventListener(){},append(...children){this.children.push(...children);}});
  globalThis.document={createElement:element};globalThis.game={user:{isGM:true},i18n:{localize:k=>k}};
  const view=new ResultsView({list:element(),input:element(),idPrefix:'test'});
  const environment={localize:key=>key==='TRUESIGHT.Grouping.Review.owner-context'?'SHARED OWNER DIAGNOSTIC':key};
  view.context={environment,dataFor:()=>null,typeLabels:{Item:{}},sortKeys:[]};
  const entry={uuid:'Item.a',warning:'owner-context',tags:[],result:{item:{uuid:'Item.a',documentType:'Item',subType:'feat',name:'Indomitable',system:{}}}};
  const group={members:[entry],representative:entry};
  const row=view.renderRow(entry,group,environment);
  const descendants=n=>[n,...n.children.flatMap(descendants)];
  assert.equal(descendants(row).find(n=>n.className==='si-warning').textContent,'SHARED OWNER DIAGNOSTIC');
  game.user.isGM=false;
  assert.equal(descendants(view.renderRow(entry,group,environment)).some(n=>n.className==='si-warning'),false);
});
