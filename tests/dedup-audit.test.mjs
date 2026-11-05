import test from "node:test";
import assert from "node:assert/strict";
import { digest, withoutLocation, hydrate, canonicalUuid } from "../tools/audit-dedup.mjs";
import { validIdentifier, editionEvidence, analyze } from "../tools/analyze-dedup-audit.mjs";

const record = (overrides={}) => ({uuid:"Compendium.dnd5e.spells24.Item.example",pack:"dnd5e.spells24",package:"dnd5e",world:false,
  documentType:"Item",type:"spell",name:"Example",nameKey:"example",identifier:"example",rules:"2024",source:{rules:"2024"},
  packageSourceBooks:[],aliases:[],parent:{},provenance:[],grants:[],flags:[],activityCount:1,effectCount:0,
  hashes:{strict:"identical"},fields:{level:"hash"},basics:{level:1,school:"evo"},...overrides});

test("audit hash ignores root location metadata, not rules, effects or functional flags",()=>{
  const a={_id:"one",folder:"a",sort:1,_stats:{modifiedTime:1},ownership:{default:0},name:"Spell",system:{level:1},flags:{automation:{enabled:true}},effects:[{_id:"effect",changes:[{value:2}]}]};
  const b={...a,_id:"two",folder:"b",sort:20,_stats:{modifiedTime:99},ownership:{default:3}};
  assert.equal(digest(withoutLocation(a)),digest(withoutLocation(b)));
  for(const patch of [{system:{level:2}},{flags:{automation:{enabled:false}}},{effects:[]}])assert.notEqual(digest(withoutLocation(a)),digest(withoutLocation({...b,...patch})));
});
test("hydrate resolves nested actor items and effects; dangling references are reported",()=>{
  const {documents,missing}=hydrate([
    ["!actors!a",{_id:"a",items:["i"],effects:["missing"]}],
    ["!actors.items!a.i",{_id:"i",name:"Sword",effects:["e"]}],
    ["!actors.items.effects!a.i.e",{_id:"e",changes:[{key:"test",value:2}]}]
  ],"actors");
  assert.equal(documents[0].items[0].effects[0].changes[0].value,2);
  assert.deepEqual(missing,["!actors.effects!a.missing"]);
});
test("Quick Insert UUID normalization preserves document type and embedded references",()=>{
  assert.equal(canonicalUuid("Compendium.dnd5e.monsters.abc","Actor"),"Compendium.dnd5e.monsters.Actor.abc");
  assert.equal(canonicalUuid("Compendium.dnd5e.spells.Item.abc"),"Compendium.dnd5e.spells.Item.abc");
  assert.equal(canonicalUuid("not a source"),null);
});
test("placeholder identifiers are not family identities; variant numbers are retained",()=>{
  for(const value of [null,"","-","-mpmm","-ftd"])assert.equal(validIdentifier(value),false);
  assert.equal(validIdentifier("longsword-1"),true);
});
test("edition evidence exposes conflicts and never guesses unknown as 2014",()=>{
  assert.equal(editionEvidence(record({rules:null,source:{},packSource:null})).status,"unknown");
  assert.equal(editionEvidence(record({source:{rules:"2024",custom:"SRD 5.1"}})).status,"conflict");
  assert.equal(editionEvidence(record({rules:null,source:{},packSource:"SRD 5.2"})).edition,"2024");
});
test("exact allowlist requires audited publisher pair and same original ID",()=>{
  const a=record(),b=record({uuid:"Compendium.dnd-players-handbook.spells.Item.example",pack:"dnd-players-handbook.spells",package:"dnd-players-handbook"});
  assert.equal(analyze([a,b]).exactAllowlist.length,1);
  assert.equal(analyze([a,{...b,uuid:b.uuid+"other"}]).exactAllowlist.length,0);
  assert.equal(analyze([a,{...b,world:true}]).exactAllowlist.length,0);
  assert.equal(analyze([a,{...b,package:"unreviewed-copy"}]).exactAllowlist.length,0);
});
test("spell candidates separate editions and quarantine mismatched or absent school",()=>{
  const a=record(),b=record({uuid:"Compendium.other.spells.Item.b",pack:"other.spells",package:"other"});
  assert.equal(analyze([a,b]).spellCandidates.length,1);
  assert.equal(analyze([a,{...b,rules:"2014",source:{rules:"2014"}}]).spellCandidates.length,0);
  for(const school of ["abj",""]) {
    const result=analyze([a,{...b,basics:{level:1,school}}]);
    assert.equal(result.spellCandidates.length,0);assert.equal(result.spellProblems.length,1);
  }
});
test("copy lineage is not proof of equality and cross-edition links remain conflicts",()=>{
  const a=record(),b=record({uuid:"Item.copy",world:true,rules:"2014",source:{rules:"2014"},hashes:{strict:"changed"},provenance:[{field:"source",uuid:a.uuid}]});
  const result=analyze([a,b]);assert.equal(result.provenanceConflicts.length,1);assert.equal(result.summary.provenance.strictPayloadEqual,0);
});

test("source-confirmed bilingual suffix suggests review without changing identity or merging generations",()=>{
  const a=record({name:"Summon Construct",identifier:"summon-construct",rules:"2014",basics:{level:4,school:"con"},source:{rules:"2014"}});
  const b={...a,uuid:"Compendium.classpack.spells.Item.b",name:"构装召唤术 Summon Construct (TCE)",identifier:"summon-construct-tce",source:{book:"TCoE",custom:"TCE"}};
  const newer={...a,uuid:"Compendium.new.spells.Item.c",rules:"2024",source:{rules:"2024"}};
  const records=[a,b,newer,{...newer,uuid:newer.uuid+"2"}];
  const original=structuredClone(records);
  const result=analyze(records);
  assert.deepEqual(result.spellSourceSuffixReview.map(g=>g.members.map(r=>r.uuid)),[[a.uuid,b.uuid]]);
  assert.deepEqual(result.spellCandidates.map(g=>g.members.map(r=>r.uuid)),[[newer.uuid,newer.uuid+"2"]]);
  assert.deepEqual(records,original);
  for(const patch of [{source:{}},{source:{book:"XGE"}},{source:{book:"TCE",custom:"XGE"}},
    {name:"构装召唤术 Greater Summon Construct (TCE)"},{name:"构装召唤术 Summon Construct (Greater)"},
    {rules:"2024"},{rules:null},{basics:{level:5,school:"con"}},{basics:{level:4,school:"evo"}},
    {basics:{level:null,school:"con"}},{world:true}]) {
    assert.deepEqual(analyze([a,{...b,...patch}]).spellSourceSuffixReview,[],JSON.stringify(patch));
  }
});
