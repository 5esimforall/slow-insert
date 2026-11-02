import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dictionaries, language } from "./localization.mjs";
import { t, currentLocale } from "../module/scripts/i18n.mjs";
import { SCHEMES, GROUPS, buildFilterOptions, filterItemData, itemTypeLabel } from "../module/scripts/filters.mjs";
import { resolveSource } from "../module/scripts/source.mjs";

test("English and Chinese have matching keys, placeholders, and all static UI messages", () => {
  const en = dictionaries.en, cn = dictionaries.cn;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(cn).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual([...en[key].matchAll(/\{[^}]+\}/g)].map(x => x[0]).sort(),
      [...cn[key].matchAll(/\{[^}]+\}/g)].map(x => x[0]).sort(), key);
  }
  const directory = new URL("../module/scripts/", import.meta.url);
  for (const path of readdirSync(directory)) {
    const source = readFileSync(new URL(path, directory), "utf8");
    for (const [, key] of source.matchAll(/\bt\("([^"]+)"/g)) assert.ok(en[`SLOWINSERT.${key}`], key);
  }
  for (const { label } of Object.values(SCHEMES)) assert.ok(en[`SLOWINSERT.${label}`]);
  for (const { label, options = [] } of Object.values(GROUPS)) {
    assert.ok(en[`SLOWINSERT.${label}`]);
    for (const option of options) assert.ok(en[`SLOWINSERT.${option.label}`]);
  }
});

test("options and tooltips follow Foundry localization while stable filter values remain unchanged", () => {
  const item = { documentType: "Item", subType: "spell", name: "Fireball", uuid: "Item.test", system: { source: { book: "PHB", rules: "2024", page: "241" }, level: 3 } };
  const english = buildFilterOptions([{ item }], language("en")).options;
  const chinese = buildFilterOptions([{ item }], language("cn")).options;
  assert.equal(english.spells.school.find(x => x.value === "evo").label, "Evocation");
  assert.equal(chinese.spells.school.find(x => x.value === "evo").label, "塑能");
  assert.equal(english.spells.level.find(x => x.value === "3").label, "Level 3");
  assert.equal(chinese.spells.level.find(x => x.value === "3").label, "3环");
  assert.equal(english.items.type[0].label, "Spell");
  assert.equal(chinese.items.type[0].label, "法术");
  assert.deepEqual(filterItemData(item, language("en")).values, filterItemData(item, language("cn")).values);
  assert.match(resolveSource(item, language("en")).title, /p\. 241.*2024 rules/);
  assert.match(resolveSource(item, language("cn")).title, /第 241 页.*2024 版规则/);
  assert.equal(resolveSource({ uuid: "Item.x" }, language("cn")).label, "来源书籍未知");
  assert.equal(item.name, "Fireball");
});

test("system type translations take precedence and Foundry cn maps to Chinese collation", () => {
  assert.equal(itemTypeLabel("spell", { spell: "TYPES.Item.spell" }, language("cn", { "TYPES.Item.spell": "系统法术" })), "系统法术");
  assert.equal(currentLocale(language("cn")), "zh-CN");
  assert.equal(currentLocale(language("en")), "en");
  assert.equal(t("Filter.SelectedCount", { count: 3 }, language("cn")), "3 项");
  assert.equal(t("Filter.SelectedCount", { count: 3 }, language("en")), "3 selected");
});
