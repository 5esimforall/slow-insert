import test from "node:test";
import assert from "node:assert/strict";
import { hidesRevisedContent, registerRulesDisplay, rulesPredicate } from "../module/scripts/rules-visibility.mjs";
import { prepareSourceEnvironment } from "../module/scripts/source-resolution.mjs";
import { buildGroupingCatalog } from "../../fvtt-zh-aliases/modules/truesight/scripts/catalog/identity.mjs";
import { groupSearchResults } from "../module/scripts/grouping.mjs";
import { buildFilterOptions } from "../module/scripts/filters.mjs";

const id = "slow-insert";
function gameFor(mode, rules, system = "dnd5e") {
  return { system: { id: system }, settings: { get(namespace, key) {
    if (namespace === id && key === "rulesDisplay") return mode;
    if (namespace === "dnd5e" && key === "rulesVersion") return rules;
    assert.fail(key);
  } } };
}
test("rules display registers a client preference on dnd5e and leaves other systems alone", () => {
  const calls = [];
  for (const system of ["dnd5e", "other"])
    registerRulesDisplay({system:{id:system}, settings:{register:(...args)=>calls.push(args)}}, id);
  assert.equal(calls.length, 1);
  const [namespace,key,config] = calls[0];
  assert.deepEqual([namespace,key,config.scope,config.config,config.default],[id,"rulesDisplay","client",true,"system"]);
  assert.deepEqual(Object.keys(config.choices),["system","5e","5r"]);
});
test("world legacy and modern resolve independently of explicit overrides", () => {
  for (const world of ["legacy","modern"]) for (const mode of ["system","5e","5r"])
    assert.equal(hidesRevisedContent(gameFor(mode, world),id),mode === "5e" || (mode === "system" && world === "legacy"));
  assert.equal(hidesRevisedContent(gameFor("5e","legacy","other"),id),false);
});
test("edition visibility reaches facet counts and grouped and ungrouped result totals", () => {
  const env = prepareSourceEnvironment();
  const rows = [["old",{rules:"2014"}],["revised",{rules:"2024"}],["bookOnly",{book:"PHB 2024"}],
    ["unknown",{}],["conflict",{book:"PHB 2014",rules:"2024"}]].map(([name,source]) =>
    ({item:{uuid:"Item."+name,name,documentType:"Item",subType:"spell",system:{source,level:1}}}));
  rows.push({item:{uuid:"Actor.npc",name:"npc",documentType:"Actor",subType:"npc",system:{details:{source:{rules:"2024"}}}}});
  for(const hide of [true,false]) {
    const accept = rulesPredicate(hide,env);
    const visible = rows.filter(accept);
    if (hide) assert.deepEqual(visible.map(r=>r.item.name),["old","unknown","conflict"]);
    else assert.deepEqual(visible,rows);
    const { options } = buildFilterOptions(visible,env);
    assert.equal(options.spells.level.find(x=>x.value==="1").count,hide ? 3 : 5);
    const catalog = buildGroupingCatalog(visible,env);
    for (const enabled of [true,false]) {
      const output = groupSearchResults(rows,catalog,{accept,preferences:{enabled,pins:{}}});
      assert.equal(output.rawCount,visible.length);
      assert.deepEqual(output.groups.map(g=>g.representative.uuid),visible.map(r=>r.item.uuid));
    }
  }
});
