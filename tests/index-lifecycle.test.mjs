import test from 'node:test';
import assert from 'node:assert/strict';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

function fixture(t, {ready=true, delay=-1}={}) {
  const old={game:globalThis.game,QuickInsert:globalThis.QuickInsert};
  t.after(()=>Object.assign(globalThis,old));
  t.mock.timers.enable({apis:['setTimeout']});
  globalThis.game={ready,settings:{get:()=>delay}};
  let starts=0,refreshes=0;
  globalThis.QuickInsert={hasIndex:false,forceIndex:async()=>{starts++;}};
  const panel=Object.assign(Object.create(SlowInsertPanel.prototype),{
    visible:true,allowed:()=>true,reindexButton:{disabled:false},status:{},
    refresh:()=>refreshes++
  });
  return {panel,counts:()=>({starts,refreshes})};
}
test('sidebar never starts indexing before ready; repeated activation schedules one build',async t=>{
  const {panel,counts}=fixture(t,{ready:false});
  panel.scheduleInitialIndex();t.mock.timers.tick(1);assert.equal(counts().starts,0);
  game.ready=true;panel.scheduleInitialIndex();panel.scheduleInitialIndex();
  t.mock.timers.tick(1);assert.equal(counts().starts,1);
  await Promise.resolve();assert.equal(panel.indexing,true);
});
test('QI automatic indexing remains the only startup owner',t=>{
  const {panel,counts}=fixture(t,{delay:3000});
  panel.scheduleInitialIndex();t.mock.timers.tick(4000);assert.equal(counts().starts,0);
});
test('resolved forceIndex promise does not complete an in-flight index; hook refreshes once',async t=>{
  const {panel,counts}=fixture(t);
  await panel.buildIndex();assert.equal(panel.indexing,true);
  QuickInsert.hasIndex=true;panel.onIndexCompleted();
  t.mock.timers.tick(1);assert.equal(panel.indexing,false);assert.equal(counts().refreshes,2);
  t.mock.timers.tick(60001);assert.equal(panel.indexFailed,false);
});
test('lost startup index recovers once, then fails without a retry loop',async t=>{
  const {panel,counts}=fixture(t);
  panel.onIndexCompleted();t.mock.timers.tick(1);await Promise.resolve();
  assert.equal(counts().starts,1);assert.equal(panel.indexRecoveryUsed,true);
  panel.onIndexCompleted();t.mock.timers.tick(1);
  assert.equal(panel.indexFailed,true);assert.equal(counts().starts,1);
  panel.scheduleInitialIndex();t.mock.timers.tick(60001);assert.equal(counts().starts,1);
});
test('missing completion times out without automatically retrying',async t=>{
  const {panel,counts}=fixture(t);await panel.buildIndex();
  t.mock.timers.tick(60001);assert.equal(panel.indexFailed,true);
  assert.equal(panel.reindexButton.disabled,false);assert.equal(counts().starts,1);
});
test('destroyed panels do not start deferred builds or respond to completion',t=>{
  const {panel,counts}=fixture(t);panel.scheduleInitialIndex();panel.destroyed=true;
  t.mock.timers.tick(1);panel.onIndexCompleted();t.mock.timers.tick(1);
  assert.deepEqual(counts(),{starts:0,refreshes:0});
});
