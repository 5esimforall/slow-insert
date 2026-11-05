import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSidebar, SIDEBAR_TAB } from '../module/scripts/sidebar.mjs';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

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
