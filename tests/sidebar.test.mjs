import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSidebar, SIDEBAR_TAB } from '../module/scripts/sidebar.mjs';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

test('search precedes settings without reordering other tabs, including repeated registration', t => {
  const previous = { foundry: globalThis.foundry, CONFIG: globalThis.CONFIG, game: globalThis.game };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.foundry = { applications: { sidebar: { AbstractSidebarTab: class {} } } };
  globalThis.game = { settings: { get: () => false } };
  for (const names of [['chat', 'compendium', 'settings'], ['chat', 'custom', 'settings', 'other'], ['chat']]) {
    const original = Object.fromEntries(names.map(name => [name, { tooltip: name }]));
    globalThis.CONFIG = { ui: { sidebar: { TABS: { ...original } } } };
    const expected = [...names];
    const settingsIndex = expected.indexOf('settings');
    expected.splice(settingsIndex < 0 ? expected.length : settingsIndex, 0, SIDEBAR_TAB);
    for (let pass = 0; pass < 2; pass++) {
      registerSidebar();
      assert.deepEqual(Object.keys(CONFIG.ui.sidebar.TABS), expected);
      for (const name of names) assert.equal(CONFIG.ui.sidebar.TABS[name], original[name]);
      assert.equal(CONFIG.ui.sidebar.TABS[SIDEBAR_TAB].gmOnly, false);
    }
  }
});

test('native sidebar registration preserves core tabs and respects GM-only discovery',()=>{
  const previous={foundry:globalThis.foundry,CONFIG:globalThis.CONFIG,game:globalThis.game};
  try {
    class Base {}
    globalThis.foundry={applications:{sidebar:{AbstractSidebarTab:Base}}};
    globalThis.CONFIG={ui:{sidebar:{TABS:{chat:{documentName:'ChatMessage'}}}}};
    globalThis.game={settings:{get:()=>true}};
    registerSidebar();
    assert.ok(CONFIG.ui[SIDEBAR_TAB].prototype instanceof Base);
    assert.equal(CONFIG.ui[SIDEBAR_TAB].tabName,SIDEBAR_TAB);
    assert.equal(CONFIG.ui.sidebar.TABS[SIDEBAR_TAB].gmOnly,true);
    assert.equal(CONFIG.ui.sidebar.TABS.chat.documentName,'ChatMessage');
    const tab=new CONFIG.ui[SIDEBAR_TAB]();let activated=0,deactivated=0;
    tab.panel={activateSidebar:()=>activated++,deactivateSidebar:()=>deactivated++};
    tab._onActivate();tab._onDeactivate();assert.equal(activated,1);assert.equal(deactivated,1);
  } finally { Object.assign(globalThis,previous); }
});
test('native activation preserves loaded results when query and index are unchanged',()=>{
  const previous=globalThis.QuickInsert;const index={};let refreshes=0;
  globalThis.QuickInsert={hasIndex:true,searchLib:{index}};
  try {
    const panel={index:{identity:index,scheduleInitialIndex:()=>{}},allowed:()=>true,root:{hidden:true},session:{page:{shown:200},catalog:{index}},renderedQuery:'fire',input:{value:'fire'},refresh:()=>refreshes++};
    SlowInsertPanel.prototype.activateSidebar.call(panel);
    assert.equal(refreshes,0);assert.equal(panel.session.page.shown,200);assert.equal(panel.visible,true);
    panel.input.value='ice';SlowInsertPanel.prototype.activateSidebar.call(panel);assert.equal(refreshes,1);
  } finally {globalThis.QuickInsert=previous;}
});

test('panel requires a sidebar host instead of mounting a body overlay', () => {
  assert.throws(() => SlowInsertPanel.prototype.mount.call({}, undefined), TypeError);
});

test('native open, toggle and close delegate geometry and focus to the host', t => {
  const old = globalThis.ui; t.after(() => { globalThis.ui = old; });
  let activated = 0, focused = 0, blurred = 0, closed = 0;
  globalThis.ui = { sidebar: { expanded: false, collapse() { this.expanded = false; } } };
  const panel = Object.assign(Object.create(SlowInsertPanel.prototype), {
    allowed: () => true,
    sidebarHost: { app: { active: true, isPopout: false, activate() { ui.sidebar.expanded = true; } } },
    activateSidebar() { activated++; }, input: { focus() { focused++; }, blur() { blurred++; } }
  });
  panel.toggle(); assert.equal(ui.sidebar.expanded, true); assert.equal(activated, 1); assert.equal(focused, 1);
  panel.toggle(); assert.equal(ui.sidebar.expanded, false); assert.equal(blurred, 1);
  panel.allowed = () => false; panel.open(); assert.equal(activated, 1);
  panel.sidebarHost.app = { isPopout: true, close() { closed++; } };
  panel.close(); assert.equal(closed, 1); assert.equal(blurred, 1);
});

test('tab deactivation saves query without discarding loaded state; popouts stay visible', async () => {
  const saved = [], page = { shown: 200 };
  const panel = { sidebarHost: { app: { isPopout: false } }, visible: true,
    input: { value: 'fire' }, session: { page }, save: async (...args) => saved.push(args) };
  SlowInsertPanel.prototype.deactivateSidebar.call(panel);
  assert.equal(panel.visible, false); assert.deepEqual(saved, [['query', 'fire']]); assert.equal(panel.session.page, page);
  panel.visible = true; panel.sidebarHost.app.isPopout = true;
  SlowInsertPanel.prototype.deactivateSidebar.call(panel);
  assert.equal(panel.visible, true); assert.equal(saved.length, 1);
});

test('registered host reattaches an existing panel and destroys it on close', async t => {
  const old = { foundry: globalThis.foundry, CONFIG: globalThis.CONFIG, game: globalThis.game };
  t.after(() => Object.assign(globalThis, old));
  let baseClosed = 0, destroyed = 0;
  class Native { _onClose() { baseClosed++; } }
  globalThis.foundry = { applications: { sidebar: { AbstractSidebarTab: Native } } };
  globalThis.CONFIG = { ui: { sidebar: { TABS: {} } } };
  globalThis.game = { settings: { get: () => false } };
  registerSidebar();
  const tab = new CONFIG.ui[SIDEBAR_TAB](), root = {};
  const panel = { root, destroy() { destroyed++; } }; tab.panel = panel;
  const attached = []; tab._replaceHTML(null, { append: node => attached.push(node) });
  assert.deepEqual(attached, [root]); assert.equal(tab.panel, panel);
  await tab._onClose({});
  assert.equal(tab.panel, null); assert.equal(destroyed, 1); assert.equal(baseClosed, 1);
});
