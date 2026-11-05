import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupingCatalog, calculateGrouping, canonicalUuid, editionEvidence, isSrdSource, GROUP_INDEX_FIELDS, groupingDiff } from '../../truesight/module/scripts/catalog/identity.mjs';
import {groupSearchResults, normalizeGrouping} from '../module/scripts/grouping.mjs';
import {validSnapshot} from '../../truesight/module/scripts/catalog/state.mjs';
import { spell, groupingFixture } from './grouping-fixture.mjs';
const calculated=(rows,environment={},preferences=normalizeGrouping(),includeRisk=true)=>calculateGrouping(rows,environment,preferences,{includeRisk});
const catalog=(rows,environment={},preferences=normalizeGrouping(),includeRisk=true)=>buildGroupingCatalog(rows,environment,calculated(rows,environment,preferences,includeRisk),preferences);
const count=(rows,cat)=>groupSearchResults(rows,cat).groups.length;

test('no initial cache means no grouping; computation does not mutate or apply',()=>{
 const {rows,environment}=groupingFixture(),before=JSON.stringify(rows);
 assert.equal(count(rows,buildGroupingCatalog(rows,environment)),6);
 const snapshot=calculated(rows,environment);assert.equal(Object.keys(snapshot.groups).length,3);
 assert.equal(JSON.stringify(rows),before);assert.equal(count(rows,buildGroupingCatalog(rows,environment)),6);
});
test('unlisted spell copies and world spells use general identity rules and separate generations',()=>{
 const {rows,environment}=groupingFixture();rows.push(spell('world',{uuid:'Item.new-world-copy'}));
 const result=groupSearchResults(rows,catalog(rows,environment));
 assert.equal(result.groups.length,3);assert.equal(result.rawCount,7);
 assert.deepEqual(result.groups.filter(g=>g.key.endsWith('example-spell')).map(g=>[g.rules,g.members.length]),[['2014',3],['2024',2]]);
});
test('unknown rules, generic identifiers, missing level/school and conflicting sources stay independent',()=>{
 const invalid=[{identifier:'-'},{identifier:'spell'},{identifier:''},{identifier:'unknown'}, {level:null},{level:10},{school:'wrong'},{source:{}},{source:{rules:'2024',book:'PHB 2014'}},{source:{rules:'2014',book:'TCE',custom:'XGE'}}];
 for(const patch of invalid){const rows=[spell('a'),spell('b',{system:patch})],cat=catalog(rows);assert.equal(count(rows,cat),2,JSON.stringify(patch));assert.ok(cat.entries.get(rows[1].item.uuid).warning);}
});
test('identifier clusters with conflicting levels or schools reject the entire cluster',()=>{
 for(const patch of [{level:5},{school:'evo'}]) {const rows=[spell('a'),spell('b'),spell('c',{system:patch})],snap=calculated(rows);assert.equal(Object.keys(snap.groups).length,0);assert.ok(Object.values(snap.records).every(r=>r.warning==='spell'));}
});
test('nonspell, external incomplete and equal Chinese display names never imply grouping',()=>{
 const rows=[spell('a',{subType:'equipment'}),spell('b',{subType:'equipment'}),spell('c',{name:'同名',system:{identifier:'different'}}),spell('d',{name:'同名'}),{item:{uuid:'@spell[example|phb]',name:'同名',documentType:'Item',subType:'spell'}}];
 assert.equal(count(rows,catalog(rows)),5);
});
test('source suffix matching requires original-name provenance, known matching citation, fields and unique unsuffixed root',()=>{
 const {rows}=groupingFixture();const base=rows.slice(4);assert.equal(count(base,catalog(base)),1);
 assert.equal(count(base,catalog(base,{},normalizeGrouping(),false)),2);
 for(const patch of [{originalName:'Conjure Example (XGE)'},{originalName:'Greater Conjure Example (TCE)'},{originalName:'Conjure Example (Greater)'},{originalName:'',name:'例示召唤 Greater Conjure Example (TCE)'},{system:{...base[1].item.system,source:{rules:'2014',book:'XGE'}}},{system:{...base[1].item.system,level:5}}]){
   const changed=[base[0],{item:{...base[1].item,...patch}}];assert.equal(count(changed,catalog(changed)),2,JSON.stringify(patch));
 }
 const ambiguous=[...base,spell('extra',{name:'Conjure Example',originalName:'Conjure Example',system:{identifier:'another-id',source:{rules:'2014',book:'TCE'}}})];
 assert.equal(count(ambiguous,catalog(ambiguous)),3);
});
test('Babele index originalName is available even when QI omits it',()=>{
 const {rows,environment}=groupingFixture(),pair=rows.slice(4);
 const target=pair[1].item;delete target.originalName;
 environment.packs.set('fixture.spells',{index:new Map([['risk2',{originalName:'Conjure Example (TCE)'}]])});
 assert.equal(count(pair,catalog(pair,environment)),1);
 environment.packs.get('fixture.spells').index.get('risk2').originalName='';
 target.name='不匹配 Conjure Other (TCE)';
 assert.equal(count(pair,catalog(pair,environment)),2);
});
test('risk markers survive filtering and all-copies view without becoming blocking warnings',()=>{
 const {rows}=groupingFixture(),cat=catalog(rows),risk=rows.slice(4);
 for(const row of risk){const e=cat.entries.get(row.item.uuid);assert.equal(e.risk,'implementation');assert.equal(e.warning,null);}
 const only=groupSearchResults(rows,cat,{accept:r=>r===risk[1]});assert.equal(only.rawCount,1);assert.equal(only.groups[0].representative.risk,'implementation');
 const all=groupSearchResults(rows,cat,{preferences:normalizeGrouping({version:2,enabled:false})});assert.equal(all.groups.length,6);
});
test('translation, bilingual concatenation, package versions and modification stamps do not change normal identity',()=>{
 const {rows,environment}=groupingFixture(),snap=calculated(rows,environment);
 rows[0].item.name='新译名 Example Spell Example Spell';rows[0].item._stats={modifiedTime:99};environment.modules.set('fixture',{version:'changed'});
 const cat=buildGroupingCatalog(rows,environment,snap);assert.equal(count(rows,cat),3);assert.equal(cat.changed,0);
});
test('risk name evidence changes detach a member, translations with stable provenance do not',()=>{
 const {rows}=groupingFixture(),snap=calculated(rows);rows[5].item.name='构装召唤术 新显示';
 assert.equal(buildGroupingCatalog(rows,{},snap).changed,0);
 rows[5].item.originalName='Changed Name (TCE)';const cat=buildGroupingCatalog(rows,{},snap);assert.equal(cat.entries.get(rows[5].item.uuid).key,null);assert.equal(cat.changed,1);
});
test('new members await application; changed identities detach without finding another group',()=>{
 const {rows}=groupingFixture(),snap=calculated(rows);const newer=[...rows,spell('new-copy')];
 let cat=buildGroupingCatalog(newer,{},snap);assert.equal(cat.entries.get(newer.at(-1).item.uuid).key,null);assert.equal(cat.changed,1);
 rows[0].item.system.level=5;cat=buildGroupingCatalog(newer,{},snap);assert.equal(cat.entries.get(rows[0].item.uuid).key,null);assert.equal(cat.entries.get(rows[0].item.uuid).warning,'identity');
 assert.equal(cat.changed,2);
});
test('deleted or denied members disappear immediately; cached aliases cannot resurrect them',()=>{
 const {rows}=groupingFixture(),snap=calculated(rows),allowed=rows.slice(1);const cat=buildGroupingCatalog(allowed,{},snap);
 assert.equal(cat.changed,1);assert.equal(cat.entries.has(rows[0].item.uuid),false);
 const found=groupSearchResults([],cat,{query:'Example Spell'});assert.equal(found.rawCount,3);assert.ok(found.groups.flatMap(g=>g.members).every(e=>e.uuid!==rows[0].item.uuid));
});
test('source filters and all-copies retain the same permitted matching family members',()=>{
 const {rows}=groupingFixture(),cat=catalog(rows);rows[0].item.name='独特译名';
 // Rebuild display aliases but not membership.
 const fresh=buildGroupingCatalog(rows,{},calculated(rows));
 for(const enabled of [true,false]){const output=groupSearchResults([],fresh,{query:'独特译名',preferences:normalizeGrouping({version:2,enabled}),accept:r=>r!==rows[1]});assert.equal(output.rawCount,1);assert.equal(output.groups[0].representative.uuid,rows[0].item.uuid);}
 assert.equal(groupSearchResults([],cat,{query:'missing'}).groups.length,0);
});
test('SRD sorts last unless manually preferred, indexed automation ranks ahead of ordinary non-SRD',()=>{
 const rows=[spell('a'),spell('b',{flags:{'chris-premades':{info:{identifier:'spell'}}}}),spell('c',{system:{source:{book:'SRD 5.1',rules:'2014'}}})];
 const cat=catalog(rows),key='spell:2014:example-spell';let group=groupSearchResults(rows,cat).groups[0];assert.equal(group.representative.uuid,rows[1].item.uuid);assert.equal(group.members.at(-1).uuid,rows[2].item.uuid);
 const preferences=normalizeGrouping({version:2,pins:{[key]:rows[2].item.uuid}});group=groupSearchResults(rows,cat,{preferences}).groups[0];assert.equal(group.representative.uuid,rows[2].item.uuid);
 group=groupSearchResults(rows,cat,{preferences,accept:r=>r!==rows[2]}).groups[0];assert.equal(group.representative.uuid,rows[1].item.uuid);assert.equal(preferences.pins[key],rows[2].item.uuid);
});
test('a Chinese or bilingual name wins within an eligible group unless the user pins another member',()=>{
 const english=spell('a',{package:'dnd-players-handbook.spells',flags:{'chris-premades':{info:{identifier:'spell'}}}});
 for(const name of ['示例法术','示例法术 Example Spell']) {
  const translated=spell('b',{name,system:{source:{book:'SRD 5.1',rules:'2014'}}});
  const rows=[english,translated],cat=catalog(rows);
  const {groups:[group],rawCount}=groupSearchResults([english],cat,{query:'Example Spell'});
  assert.equal(rawCount,2);
  assert.equal(group.representative.result.item,translated.item);
  assert.deepEqual(group.members.map(e=>e.result.item),[translated.item,english.item]);
  assert.equal(group.pinned,false);
  const preferences=normalizeGrouping({version:2,pins:{[group.key]:english.item.uuid}});
  const pinned=groupSearchResults(rows,cat,{preferences}).groups[0];
  assert.equal(pinned.representative.result.item,english.item);
  assert.equal(pinned.pinned,true);
  const filtered=groupSearchResults(rows,cat,{accept:r=>r!==translated}).groups[0];
  assert.equal(filtered.representative.result.item,english.item);
  assert.deepEqual(filtered.members.map(e=>e.uuid),[english.item.uuid]);
 }
});
test('SRD relies on source evidence, not publisher identity or license flags',()=>{
 assert.equal(isSrdSource({system:{source:{book:'SRD 5.1'}}}),true);
 assert.equal(isSrdSource({system:{source:{custom:'srd5.2'}}}),true);
 assert.equal(isSrdSource({package:'dnd5e.custom',system:{source:{book:'PHB'}},flags:{dnd5e:{srd:true}}}),false);
});
test('current Quick Insert UUIDs normalize for membership but original open/drag objects are untouched',()=>{
 const {rows}=groupingFixture();for(const r of rows)r.item.uuid=r.item.uuid.replace('.Item.','.');
 const cat=catalog(rows);assert.equal(count(rows,cat),3);assert.ok(rows.every(r=>!r.item.uuid.includes('.Item.')));
 assert.equal(canonicalUuid({uuid:'Compendium.a.b.doc',documentType:'Actor'}),'Compendium.a.b.Actor.doc');
});
test('exclusions persist through recalculation; restoring them is explicit',()=>{
 const {rows}=groupingFixture(),preferences={excluded:[rows[0].item.uuid]};const snap=calculated(rows,{},preferences);
 assert.equal(snap.records[rows[0].item.uuid].warning,'excluded');assert.equal(snap.records[rows[0].item.uuid].key,null);
 const cat=buildGroupingCatalog(rows,{},calculated(rows),preferences);assert.equal(cat.entries.get(rows[0].item.uuid).key,null);
 assert.ok(calculated(rows).records[rows[0].item.uuid].key);
});


test('diff counts new, merged, split and independent spells',()=>{
 const {rows}=groupingFixture(),safe=calculated(rows,{},normalizeGrouping(),false),risk=calculated(rows);
 assert.equal(groupingDiff(null,safe).added,2);assert.equal(groupingDiff(safe,risk).added,1);assert.equal(groupingDiff(risk,safe).split,1);
 const old=structuredClone(risk);const ids=old.groups['spell:2014:example-spell'].members;old.groups.other={members:[ids[1]]};old.groups['spell:2014:example-spell'].members=[ids[0]];
 assert.equal(groupingDiff(old,risk).merged,1);
});

test('search never loads documents; required metadata fields exclude payloads',()=>{
 const rows=[spell('a'),spell('b')];for(const r of rows)r.item.get=()=>assert.fail('document read');
 assert.equal(count(rows,catalog(rows)),1);assert.ok(GROUP_INDEX_FIELDS.every(f=>!/(description|effects|activities)/.test(f)));
 assert.deepEqual(editionEvidence({system:{}}),{rules:null,conflict:false});
});
test("panel opening and dragging use the selected original member, including provider payloads", async () => {
  const { SlowInsertPanel } = await import("../module/scripts/panel.mjs");
  const opened=[];
  const native={documentType:"Item",uuid:"Compendium.a.b.original",show(){opened.push(this.uuid);}};
  const external={documentType:"Item",uuid:"@spell[forcecage|xphb]",get dragData(){return {type:"Item",uuid:this.uuid,subType:"hover",page:"spells.html",hash:"forcecage_xphb"};},show(){opened.push(this.uuid);}};
  const panel={allowed:()=>true,view:{results:[{item:native},{item:external}],select(index){this.selected=index;}}};
  for(let index=0;index<panel.view.results.length;index++) {
    await SlowInsertPanel.prototype.openItem.call(panel,index);
    let data;
    const event={target:{closest:()=>({dataset:{index:String(index)}})},dataTransfer:{setData(type,value){assert.equal(type,"text/plain");data=JSON.parse(value);}}};
    SlowInsertPanel.prototype.onDragStart.call(panel,event);
    assert.equal(data.uuid,panel.view.results[index].item.uuid);
    assert.equal(event.dataTransfer.effectAllowed,"copy");
    if(index===1)assert.deepEqual(data,external.dragData);
  }
  assert.deepEqual(opened,[native.uuid,external.uuid]);
});



test('bilingual names without original metadata require whole-segment identifier and source corroboration',()=>{
 const {rows}=groupingFixture(),pair=rows.slice(4);delete pair[1].item.originalName;
 assert.equal(count(pair,catalog(pair)),1);
 for(const name of ['例示召唤 Greater Conjure Example (TCE)','Extra 例示召唤 Conjure Example (TCE)','例示召唤 Conjure Example (XGE)','例示召唤 Conjure Example (TCE) custom']){
   pair[1].item.name=name;assert.equal(count(pair,catalog(pair)),2,name);
 }
});

test('other systems do not inherit dnd5e spell identity rules',()=>{
 const rows=[spell('a'),spell('b')];const snap=calculated(rows,{system:{id:'other'}});
 assert.equal(Object.keys(snap.groups).length,0);assert.equal(Object.keys(snap.records).length,2);
 assert.ok(Object.values(snap.records).every(record=>record.reason==='origin'));
});

test('review reapplication reconciles pins by shared membership, drops ambiguous merged pins and never creates groups', async () => {
 const {reconcilePins}=await import('../module/scripts/grouping.mjs');
 const entries=new Map([['a',{key:'merged'}],['b',{key:'merged'}],['c',{key:'separate'}]]);
 assert.deepEqual(reconcilePins({old:'a'},entries),{merged:'a'});
 assert.deepEqual(reconcilePins({old:'a',other:'b',third:'c',lost:'gone'},entries),{separate:'c'});
 assert.deepEqual([...entries.keys()],['a','b','c']);
});


test('reviewed class features collapse through the public grouping consumer without changing selected names or UUIDs',()=>{
 const parent=spell('fighter',{name:'Fighter',originalName:'Fighter',subType:'class',system:{identifier:'fighter',source:{rules:'2024'}}});
 const rows=[parent,...['不屈','不屈 Indomitable','Indomitable'].map((name,index)=>spell('feature'+index,{name,originalName:'Indomitable',subType:'feat',system:{identifier:'indomitable',source:{rules:'2024'},type:{value:'class'},requirements:'Fighter',prerequisites:{level:9}}}))];
 const reviewed=catalog(rows),features=rows.slice(1);
 const output=groupSearchResults(features,reviewed,{query:'不屈'});
 assert.equal(output.groups.length,1);assert.equal(output.groups[0].kind,'feat');
 assert.deepEqual(output.groups[0].members.map(e=>e.result.item.name).sort(),features.map(e=>e.item.name).sort());
 assert.deepEqual(output.groups[0].members.map(e=>e.uuid).sort(),features.map(e=>e.item.uuid).sort());
});
