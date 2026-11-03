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
 const panel={save(key,value){saved.push({key,value});},idPrefix:'test',visible:true,browseContent:{sentinel:true},filterControls:{scheme:{focus(){focused++;}}},browseButton:{setAttribute(k,v){expanded=v;},focus(){focused++;}}};
 const app=createBrowseWindow(panel);
 assert.ok(app instanceof Native);assert.equal(app.options.id,'test-browse');
 app._replaceHTML(panel.browseContent,{replaceChildren(c){content=c;}});assert.equal(content,panel.browseContent);
 app._onRender({}, {isFirstRender:true});assert.equal(expanded,'true');assert.equal(focused,1);
 app._onPosition({...app.position,zIndex:100,scale:1});assert.deepEqual(saved,[{key:'browsePosition',value:app.position}]);
 app._onPosition(app.position);assert.equal(saved.length,1);
 app._onClose({});assert.equal(saved.length,1);assert.equal(expanded,'false');assert.deepEqual(panel.browsePosition,app.position);assert.equal(focused,2);
 panel.destroyed=true;app._onClose({});assert.equal(focused,2);
});
test('existing floating window is raised rather than duplicated',async()=>{
 let raised=0;
 const panel={allowed:()=>true,browseWindow:{rendered:true,bringToFront(){raised++;}}};
 await SlowInsertPanel.prototype.openBrowseWindow.call(panel);assert.equal(raised,1);
});
test('native Escape priority also applies when the owning sidebar is inactive or collapsed',t=>{
 const old={ui:globalThis.ui,foundry:globalThis.foundry,game:globalThis.game};t.after(()=>Object.assign(globalThis,old));
 const app={rendered:true,hasFrame:true};let dismissed=0;
 globalThis.ui={sidebar:{expanded:false},windows:{}};
 globalThis.foundry={applications:{instances:new Map([['browse',app]])}};
 globalThis.game={keyboard:{constructor:{getKeyboardEventContext:event=>({event})}},keybindings:{actions:new Map([['core.dismiss',{onDown(){dismissed++;}}]])}};
 const panel={visible:false,sidebarHost:{app:{isPopout:false}},browseWindow:app,close(){throw Error('sidebar must not close');}};
 const event={preventDefault(){},stopPropagation(){}};
 assert.equal(SlowInsertPanel.prototype.onEscape.call(panel,event,{forwardNative:true}),true);assert.equal(dismissed,1);
});

test('geometry normalization drops transient native state and invalid numbers',()=>{
 assert.deepEqual(normalizeBrowsePosition({left:42,top:0,width:740,height:760,zIndex:99,scale:2}),{width:740,height:760,left:42,top:0});
 assert.deepEqual(normalizeBrowsePosition({left:NaN,top:Infinity,width:-1,height:'760'}),{});
 assert.deepEqual(browseWindowPosition({width:1384,height:988},{left:1084},{left:NaN,width:-1}),{width:740,height:760,left:328,top:64});
});
