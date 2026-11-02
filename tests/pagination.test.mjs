import test from 'node:test';
import assert from 'node:assert/strict';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

function fixture(total=245) {
  const calls=[];
  const page={groups:Array.from({length:total},(_,i)=>({key:String(i)})),shown:100,query:'fire',scheme:'items',environment:{}};
  const panel={visible:true,page,input:{value:'fire'},filters:{scheme:'items'},
    renderGroups:(groups,env,append)=>calls.push({keys:groups.map(x=>x.key),append}),updateResultCount:()=>{}};
  return {panel,calls};
}
test('continuation appends bounded batches without repeating existing groups',()=>{
  const {panel,calls}=fixture();
  SlowInsertPanel.prototype.loadMore.call(panel);
  assert.equal(panel.page.shown,200);assert.equal(calls[0].append,true);
  assert.equal(calls[0].keys[0],'100');assert.equal(calls[0].keys.at(-1),'199');
  SlowInsertPanel.prototype.loadMore.call(panel);
  assert.equal(panel.page.shown,245);assert.equal(calls[1].keys.length,45);
  SlowInsertPanel.prototype.loadMore.call(panel);assert.equal(calls.length,2);
});
test('continuation ignores stale queries, changed schemes, closed panels and empty state',()=>{
  for(const change of [p=>p.input.value='new',p=>p.filters.scheme='spells',p=>p.visible=false,p=>p.page=null]) {
    const {panel,calls}=fixture();change(panel);SlowInsertPanel.prototype.loadMore.call(panel);assert.equal(calls.length,0);
  }
});
