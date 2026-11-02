import test from "node:test";
import assert from "node:assert/strict";
import { GROUPING_REGISTRY } from "../module/data/grouping-registry.mjs";
import { buildGroupingCatalog, groupSearchResults, normalizeGrouping, canonicalUuid, editionEvidence, isSrdSource, GROUP_INDEX_FIELDS } from "../module/scripts/grouping.mjs";

function fixture(uuids=Object.keys(GROUPING_REGISTRY.members)) {
  const environment={system:{id:"dnd5e"},modules:new Map(),packs:new Map()};
  const results=uuids.map(uuid=>{
    const record=GROUPING_REGISTRY.members[uuid],parts=uuid.split("."),packId=parts.slice(1,3).join("."),id=parts.at(-1);
    if(record.package==="dnd5e")environment.system.version=record.packageVersion;
    else environment.modules.set(record.package,{version:record.packageVersion});
    if(!environment.packs.has(packId))environment.packs.set(packId,{index:new Map(),metadata:{packageType:record.package==="dnd5e"?"system":"module",packageName:record.package}});
    if(record.package==="dnd5e")environment.packs.get(packId).metadata.flags={dnd5e:{sourceBook:record.rules==="2024"?"SRD 5.2":"SRD 5.1"}};
    environment.packs.get(packId).index.set(id,{_stats:{modifiedTime:record.modifiedTime}});
    return {item:{uuid,package:packId,name:record.names[0],documentType:"Item",subType:record.type,
      system:{identifier:record.identifier,source:{rules:record.rules},level:record.level,school:record.school},
      get(){throw new Error("Searching must not load full documents");},show(){return uuid;}}};
  });
  return {results,environment,catalog:()=>buildGroupingCatalog(results,environment)};
}
const forceIds=Object.entries(GROUPING_REGISTRY.members).filter(([,r])=>r.identifier==="forcecage").map(([uuid])=>uuid);
test("registry is bounded to audited compendium records, with 179 exact groups and 808 spell families",()=>{
  assert.equal(Object.values(GROUPING_REGISTRY.groups).filter(g=>g.kind==="exact").length,179);
  assert.equal(Object.values(GROUPING_REGISTRY.groups).filter(g=>g.kind==="spell").length,808);
  assert.ok(Object.keys(GROUPING_REGISTRY.members).every(uuid=>uuid.startsWith("Compendium.")));
  const f=fixture(),catalog=f.catalog();
  assert.equal([...catalog.entries.values()].filter(e=>e.warning).length,0);
  assert.equal(groupSearchResults(f.results,catalog).groups.length,987);
});
test("Forcecage forms two edition groups with all 2+4 original implementations",()=>{
  const f=fixture(forceIds),output=groupSearchResults(f.results,f.catalog());
  assert.deepEqual(output.groups.map(g=>[g.rules,g.members.length]).sort(),[["2014",2],["2024",4]]);
  assert.equal(output.rawCount,6);
  assert.equal(new Set(output.groups.flatMap(g=>g.members.map(e=>e.uuid))).size,6);
});
test("SRD is last within each edition group and PHB 2014 becomes the default",()=>{
  for(const lang of ["en","cn"]) {
    const f=fixture(forceIds),output=groupSearchResults(f.results,f.catalog(),{lang});
    const old=output.groups.find(g=>g.rules==="2014"),revised=output.groups.find(g=>g.rules==="2024");
    assert.equal(old.representative.result.item.package,"dnd5e_classpack.new-icon");
    assert.equal(revised.representative.result.item.package,"dnd-players-handbook.spells");
    assert.equal(old.members.at(-1).result.item.package,"dnd5e.spells");
    assert.equal(revised.members.at(-1).result.item.package,"dnd5e.spells24");
    assert.equal(output.rawCount,6);
  }
});
test("manual SRD pins still win, while filters can leave SRD as the only fallback",()=>{
  const f=fixture(forceIds),catalog=f.catalog(),key="spell:2014:forcecage";
  const srd=forceIds.find(id=>id.startsWith("Compendium.dnd5e.spells."));
  const preferences=normalizeGrouping({version:1,pins:{[key]:srd}});
  const pinned=groupSearchResults(f.results,catalog,{preferences}).groups.find(g=>g.key===key);
  assert.equal(pinned.representative.uuid,srd);
  assert.equal(pinned.members[0].uuid,srd);
  const onlySrd=groupSearchResults(f.results,catalog,{accept:r=>r.item.package==="dnd5e.spells"});
  assert.equal(onlySrd.groups.length,1);
  assert.equal(onlySrd.groups[0].representative.uuid,srd);
  assert.equal(onlySrd.rawCount,1);
});
test("SRD detection uses source and pack metadata, not publisher IDs or license flags",()=>{
  assert.equal(isSrdSource({system:{source:{book:"SRD 5.1"}}}),true);
  assert.equal(isSrdSource({system:{source:{custom:"srd5.2"}}}),true);
  assert.equal(isSrdSource({system:{source:"System Reference Document"}}),true);
  assert.equal(isSrdSource({packageName:"法术 (SRD)"}),true);
  assert.equal(isSrdSource({package:"dnd5e.custom",system:{source:{book:"PHB"}},flags:{dnd5e:{srd:true}}}),false);
  const packs=new Map([["vendor.copy",{metadata:{flags:{dnd5e:{sourceBook:"SRD 5.2"}}}}]]);
  assert.equal(isSrdSource({package:"vendor.copy",system:{source:{book:"PHB"}}},{packs}),true);
});
test("translated aliases find a family while retaining only permitted index members",()=>{
  const f=fixture(forceIds),catalog=f.catalog();
  assert.equal(groupSearchResults([],catalog,{query:"力场监牢"}).rawCount,6);
  assert.equal(groupSearchResults([],catalog,{query:"力场监牢",preferences:normalizeGrouping({version:1,enabled:false})}).rawCount,6);
  const permitted=f.results.filter(r=>r.item.package!=="aaatransfer.classes");
  assert.equal(groupSearchResults([],buildGroupingCatalog(permitted,f.environment),{query:"力场监牢"}).rawCount,5);
});
test("preferred and expanded implementations must obey source filters",()=>{
  const f=fixture(forceIds),catalog=f.catalog(),key="spell:2024:forcecage";
  const pin=forceIds.find(id=>id.includes("aaatransfer"));
  const preferences=normalizeGrouping({version:1,pins:{[key]:pin}});
  let group=groupSearchResults(f.results,catalog,{preferences}).groups.find(g=>g.key===key);
  assert.equal(group.representative.uuid,pin);
  group=groupSearchResults(f.results,catalog,{preferences,accept:r=>r.item.package==="dnd-players-handbook.spells"}).groups[0];
  assert.equal(group.members.length,1);assert.equal(group.representative.result.item.package,"dnd-players-handbook.spells");
  assert.equal(preferences.pins[key],pin);
});
test("all-copies toggle and group splits preserve original rows and IDs",()=>{
  const f=fixture(forceIds),catalog=f.catalog();
  assert.equal(groupSearchResults(f.results,catalog,{preferences:normalizeGrouping({version:1,enabled:false})}).groups.length,6);
  assert.equal(groupSearchResults(f.results,catalog,{preferences:normalizeGrouping({version:1,split:["spell:2024:forcecage"]})}).groups.length,5);
});
test("package updates, document changes and absent index stamps fail open",()=>{
  for(const mode of ["package","document","missing"]) {
    const f=fixture(forceIds),target=f.results.find(r=>r.item.package==="dnd-players-handbook.spells");
    const entry=f.environment.packs.get(target.item.package).index.get(target.item.uuid.split(".").at(-1));
    if(mode==="package")f.environment.modules.get("dnd-players-handbook").version="changed";
    else if(mode==="document")entry._stats.modifiedTime=123456789;
    else delete entry._stats.modifiedTime;
    const catalog=f.catalog(),record=catalog.entries.get(target.item.uuid);
    assert.equal(record.key,null);assert.equal(record.warning,mode==="missing"?"unverified":"stale");
    const output=groupSearchResults(f.results,catalog);assert.equal(output.rawCount,6);assert.equal(output.groups.length,3);
  }
});
test("changed school, edition conflicts and changed names are not silently hidden",()=>{
  for(const patch of [item=>{item.system.school="wrong";},item=>{item.system.source.book="SRD 5.1";},item=>{item.name="Forcecage + custom variant";}]){
    const f=fixture(forceIds),target=f.results.find(r=>r.item.package==="dnd-players-handbook.spells");patch(target.item);
    const info=f.catalog().entries.get(target.item.uuid);assert.equal(info.key,null);assert.ok(info.warning);
  }
});
test("unreviewed entries, world copies and generic identifiers never join audited groups",()=>{
  const f=fixture(forceIds),extra=[
    {item:{...f.results[0].item,uuid:"Item.custom"}},
    {item:{...f.results[0].item,uuid:"Compendium.new.pack.Item.custom"}},
    {item:{...f.results[0].item,uuid:"Compendium.new.pack.Item.dash",subType:"feat",system:{identifier:"-"}}}
  ];
  const all=[...f.results,...extra],output=groupSearchResults(all,buildGroupingCatalog(all,f.environment));
  assert.equal(output.groups.length,5);assert.equal(output.rawCount,9);
});
test("legacy QI UUIDs normalize for lookup but original drag/open UUIDs remain untouched",()=>{
  const f=fixture(forceIds);for(const r of f.results)r.item.uuid=r.item.uuid.replace(".Item.",".");
  assert.equal(groupSearchResults(f.results,f.catalog()).groups.length,2);
  assert.ok(f.results.every(r=>!r.item.uuid.includes(".Item.")));
  assert.equal(canonicalUuid({uuid:"Compendium.a.b.doc",documentType:"Actor"}),"Compendium.a.b.Actor.doc");
});
test("missing version is not guessed and package/title metadata conflicts stay visible",()=>{
  assert.deepEqual(editionEvidence({system:{}}),{rules:null,conflict:false});
  assert.equal(editionEvidence({system:{source:{rules:"2024",custom:"SRD 5.1"}}}).conflict,true);
  assert.ok(GROUP_INDEX_FIELDS.every(field=>!/(description|effects|activities)/.test(field)));
});
test("grouping settings sanitize old state and do not inherit prototype preferences",()=>{
  assert.deepEqual(normalizeGrouping({version:0,enabled:false}),{version:1,enabled:true,pins:{},split:[]});
  const state=normalizeGrouping({version:1,pins:{good:4,valid:"Compendium.a.b.Item.x"},split:["a","a",null]});
  assert.deepEqual(state.split,["a"]);assert.deepEqual(state.pins,{valid:"Compendium.a.b.Item.x"});
});

test("panel opening and dragging use the selected original member, including provider payloads", async () => {
  const { SlowInsertPanel } = await import("../module/scripts/panel.mjs");
  const opened=[];
  const native={documentType:"Item",uuid:"Compendium.a.b.original",show(){opened.push(this.uuid);}};
  const external={documentType:"Item",uuid:"@spell[forcecage|xphb]",get dragData(){return {type:"Item",uuid:this.uuid,subType:"hover",page:"spells.html",hash:"forcecage_xphb"};},show(){opened.push(this.uuid);}};
  const panel={allowed:()=>true,results:[{item:native},{item:external}],select(index){this.selected=index;}};
  for(let index=0;index<panel.results.length;index++) {
    await SlowInsertPanel.prototype.openItem.call(panel,index);
    let data;
    const event={target:{closest:()=>({dataset:{index:String(index)}})},dataTransfer:{setData(type,value){assert.equal(type,"text/plain");data=JSON.parse(value);}}};
    SlowInsertPanel.prototype.onDragStart.call(panel,event);
    assert.equal(data.uuid,panel.results[index].item.uuid);
    assert.equal(event.dataTransfer.effectAllowed,"copy");
    if(index===1)assert.deepEqual(data,external.dragData);
  }
  assert.deepEqual(opened,[native.uuid,external.uuid]);
});
