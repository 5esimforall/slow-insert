import test from 'node:test';
import assert from 'node:assert/strict';
import { QuickInsertIndex, affectsSearch } from '../module/scripts/quick-insert-index.mjs';

function fixture(t, {ready=true, delay=-1}={}) {
  const old={game:globalThis.game,QuickInsert:globalThis.QuickInsert};
  t.after(()=>Object.assign(globalThis,old));
  t.mock.timers.enable({apis:['setTimeout']});
  globalThis.game={ready,user:{isGM:true},modules:new Map([["quick-insert",{active:true}]]),settings:{get:()=>delay}};
  let starts=0,refreshes=0;
  globalThis.QuickInsert={hasIndex:false,forceIndex:async()=>{starts++;}};
  const index=new QuickInsertIndex({
    isVisible:()=>true,onInvalidate:()=>{},onRefresh:()=>refreshes++,onStateChange:()=>{},onFailure:()=>{}
  });
  return {index,counts:()=>({starts,refreshes})};
}
test('sidebar never starts indexing before ready; repeated activation schedules one build',async t=>{
  const {index,counts}=fixture(t,{ready:false});
  index.scheduleInitialIndex();t.mock.timers.tick(1);assert.equal(counts().starts,0);
  game.ready=true;index.scheduleInitialIndex();index.scheduleInitialIndex();
  t.mock.timers.tick(1);assert.equal(counts().starts,1);
  await Promise.resolve();assert.equal(index.indexing,true);
});
test('QI automatic indexing remains the only startup owner',t=>{
  const {index,counts}=fixture(t,{delay:3000});
  index.scheduleInitialIndex();t.mock.timers.tick(4000);assert.equal(counts().starts,0);
});
test('resolved forceIndex promise does not complete an in-flight index; hook refreshes once',async t=>{
  const {index,counts}=fixture(t);
  await index.buildIndex();assert.equal(index.indexing,true);
  QuickInsert.hasIndex=true;index.onIndexCompleted();
  t.mock.timers.tick(1);assert.equal(index.indexing,false);assert.equal(counts().refreshes,2);
  t.mock.timers.tick(60001);assert.equal(index.failed,false);
});
test('lost startup index recovers once, then fails without a retry loop',async t=>{
  const {index,counts}=fixture(t);
  index.onIndexCompleted();t.mock.timers.tick(1);await Promise.resolve();
  assert.equal(counts().starts,1);assert.equal(index.recoveryUsed,true);
  index.onIndexCompleted();t.mock.timers.tick(1);
  assert.equal(index.failed,true);assert.equal(counts().starts,1);
  index.scheduleInitialIndex();t.mock.timers.tick(60001);assert.equal(counts().starts,1);
});
test('missing completion times out without automatically retrying',async t=>{
  const {index,counts}=fixture(t);await index.buildIndex();
  t.mock.timers.tick(60001);assert.equal(index.failed,true);
  assert.equal(index.indexing,false);assert.equal(counts().starts,1);
});
test('destroyed adapters do not start deferred builds or respond to completion',t=>{
  const {index,counts}=fixture(t);index.scheduleInitialIndex();index.destroyed=true;
  t.mock.timers.tick(1);index.onIndexCompleted();t.mock.timers.tick(1);
  assert.deepEqual(counts(),{starts:0,refreshes:0});
});

test('index adapter keeps unbounded QI search and checks current access',t=>{
 const {index}=fixture(t);let received;
 QuickInsert.search=(...args)=>{received=args;return ['sentinel'];};
 const accept=()=>true;
 assert.deepEqual(index.search('fire',accept),['sentinel']);
 assert.deepEqual(received,['fire',accept,Number.MAX_SAFE_INTEGER]);
 assert.equal(index.allowed(),true);
 game.user.isGM=false;game.settings.get=()=>true;
 assert.equal(index.allowed(),false);
 game.settings.get=()=>false;
 assert.equal(index.allowed(),true);
 game.modules.get('quick-insert').active=false;
 assert.equal(index.allowed(),false);
});

test('document hooks invalidate immediately, coalesce refreshes and disconnect on destroy',t=>{
 const old=globalThis.Hooks;t.after(()=>{globalThis.Hooks=old;});
 const callbacks=new Map();let nextId=0;
 globalThis.Hooks={on:(name,fn)=>{const id=++nextId;callbacks.set(id,{name,fn});return id;},off:(_name,id)=>callbacks.delete(id)};
 const {index,counts}=fixture(t);let invalidations=0;
 index.onInvalidate=()=>invalidations++;
 index.connect();
 const emit=name=>{for(const entry of callbacks.values())if(entry.name===name)entry.fn();};
 emit('updateItem');emit('deleteActor');
 assert.equal(invalidations,2);assert.equal(counts().refreshes,0);
 t.mock.timers.tick(1);assert.equal(counts().refreshes,1);
 emit('createItem');index.destroy();
 t.mock.timers.tick(1);
 assert.equal(callbacks.size,0);assert.equal(counts().refreshes,1);
 emit('ready');t.mock.timers.tick(1);assert.equal(counts().starts,0);
});

test('rejected build reports failure, but an in-flight rejection after destroy is ignored',async t=>{
 const {index}=fixture(t);const failures=[];index.onFailure=e=>failures.push(e.message);
 QuickInsert.forceIndex=async()=>{throw Error('offline');};
 await index.buildIndex();assert.equal(index.failed,true);assert.deepEqual(failures,['offline']);
 let reject;QuickInsert.forceIndex=()=>new Promise((_,no)=>{reject=no;});
 const pending=index.buildIndex();index.destroy();reject(Error('late'));await pending;
 assert.deepEqual(failures,['offline']);
});


test('search updates ignore HP and spent resources but retain filter metadata changes', () => {
 for (const delta of [{'system.attributes.hp.value':1},{system:{uses:{spent:1}}},{'system.resources.legact.value':0}]) assert.equal(affectsSearch(delta),false);
 for (const delta of [{name:'New'},{system:{resources:{legact:{max:3}}}},{'system.school':'abj'},{'system.-=source':null},{system:null},{ownership:{default:0}}]) assert.equal(affectsSearch(delta),true);
 assert.equal(affectsSearch(undefined),true);
});
