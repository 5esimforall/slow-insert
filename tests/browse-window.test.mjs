import test from 'node:test';
import assert from 'node:assert/strict';
import { browseWindowPosition, createBrowseWindow, normalizeBrowsePosition } from '../module/scripts/browse-window.mjs';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';
test('floating window opens beside sidebar and clamps saved bounds to current viewport',()=>{
 assert.deepEqual(browseWindowPosition({width:1384,height:988},{left:1084}),{width:740,height:760,left:328,top:64});
 const p=browseWindowPosition({width:600,height:500},{left:300},{width:900,height:800,left:2000,top:1000});
 assert.deepEqual(p,{width:576,height:468,left:12,top:16});
 const saved={width:680,height:580,left:100,top:80};assert.deepEqual(browseWindowPosition({width:1384,height:988},null,saved),saved);
});
test('native frame preserves the same live controls and remembers position without resetting preferences',t=>{
 const old=globalThis.foundry;t.after(()=>{globalThis.foundry=old;});
 class Native {constructor(options){this.options=options;this.position={width:700,height:620,left:200,top:50};this.element={setAttribute(){}};} _onRender(){} _onPosition(){} _onClose(){} }
 globalThis.foundry={applications:{api:{ApplicationV2:Native}}};
 let expanded,focused=0,content;const saved=[];
 const panel={updateLayoutControls(){expanded=app.rendered?'true':'false';},sidebarHost:{app:{isPopout:true}},save(key,value){saved.push({key,value});},idPrefix:'test',visible:true,browseContent:{sentinel:true},filterControls:{scheme:{focus(){focused++;}}},browseButton:{setAttribute(k,v){expanded=v;},focus(){focused++;}}};
 const app=createBrowseWindow(panel);
 assert.ok(app instanceof Native);assert.equal(app.options.id,'test-browse');
 app._replaceHTML(panel.browseContent,{replaceChildren(c){content=c;}});assert.equal(content,panel.browseContent);
 app.rendered=true;app._onRender({}, {isFirstRender:true});assert.equal(expanded,'true');assert.equal(focused,1);
 app._onPosition({...app.position,zIndex:100,scale:1});assert.deepEqual(saved,[{key:'browsePosition',value:app.position}]);
 app._onPosition(app.position);assert.equal(saved.length,1);
 app.rendered=false;app._onClose({});assert.equal(saved.length,1);assert.equal(expanded,'false');assert.deepEqual(panel.browsePosition,app.position);assert.equal(focused,2);
 panel.destroyed=true;app._onClose({});assert.equal(focused,2);
});
test('existing floating window is raised rather than duplicated',async()=>{
 let raised=0;
 const panel={sidebarHost:{app:{isPopout:true}},allowed:()=>true,browseWindow:{rendered:true,bringToFront(){raised++;}}};
 await SlowInsertPanel.prototype.openBrowseWindow.call(panel);assert.equal(raised,1);
});
test('geometry normalization drops transient native state and invalid numbers',()=>{
 assert.deepEqual(normalizeBrowsePosition({left:42,top:0,width:740,height:760,zIndex:99,scale:2}),{width:740,height:760,left:42,top:0});
 assert.deepEqual(normalizeBrowsePosition({left:NaN,top:Infinity,width:-1,height:'760'}),{});
 assert.deepEqual(browseWindowPosition({width:1384,height:988},{left:1084},{left:NaN,width:-1}),{width:740,height:760,left:328,top:64});
});

test('closing browse window only restores focus to a visible native host', t => {
 const old = { foundry: globalThis.foundry, ui: globalThis.ui };
 t.after(() => Object.assign(globalThis, old));
 class Native { constructor() { this.position = {}; } _onClose() {} }
 globalThis.foundry = { applications: { api: { ApplicationV2: Native } } };
 globalThis.ui = { sidebar: { expanded: false } };
 let focused = 0;
 const panel = { updateLayoutControls() {}, idPrefix: 'test', visible: true, sidebarHost: { app: { isPopout: false } },
   browseButton: { setAttribute() {}, focus() { focused++; } } };
 const app = createBrowseWindow(panel);
 app._onClose({}); assert.equal(focused, 0);
 ui.sidebar.expanded = true; app._onClose({}); assert.equal(focused, 1);
 panel.visible = false; app._onClose({}); assert.equal(focused, 1);
 panel.visible = true; app._onClose({ restoreFocus: false }); assert.equal(focused, 1);
 panel.sidebarHost.app.isPopout = true; ui.sidebar.expanded = false;
 app._onClose({}); assert.equal(focused, 2);
});

test('overlapping opens await the same native render and preserve its live content', async t => {
  const previous = globalThis.window;
  t.after(() => { globalThis.window = previous; });
  globalThis.window = { innerWidth: 1384, innerHeight: 988 };
  let complete, renders = 0, focused = 0;
  const app = { rendered: false, bringToFront() {}, render() {
    renders++;
    return new Promise(resolve => { complete = () => { this.rendered = true; resolve(this); }; });
  } };
  const panel = Object.assign(Object.create(SlowInsertPanel.prototype), {
    allowed: () => true, searchInWindow: true, browseWindow: app,
    root: { getBoundingClientRect: () => ({ left: 1084 }) }, input: { focus() { focused++; } }
  });
  const first = panel.openBrowseWindow(), second = panel.openBrowseWindow();
  assert.equal(renders, 1);
  complete(); await Promise.all([first, second]);
  assert.equal(renders, 1); assert.equal(focused, 1); assert.equal(panel.windowRender, null);
});

test('floating search visibility follows its window independently of sidebar activation', () => {
  const panel = Object.assign(Object.create(SlowInsertPanel.prototype), { visible: false, searchInWindow: true });
  assert.equal(panel.searchVisible, false);
  panel.browseWindow = { rendered: true }; assert.equal(panel.searchVisible, true);
  panel.browseWindow.rendered = false; panel.visible = true; assert.equal(panel.searchVisible, false);
  panel.searchInWindow = false; assert.equal(panel.searchVisible, true);
});
