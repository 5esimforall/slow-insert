import test from "node:test";
import assert from "node:assert/strict";
import { SCHEMES, FILTER_INDEX_FIELDS, ACTOR_FILTER_INDEX_FIELDS, activeFilters, buildFilterOptions, filterItemData, isSupportedResult, matchesFilters, normalizeFilters, parseCR, resetProfile, setGroup, setScheme } from "../module/scripts/filters.mjs";
import { lookupReference, makeReferenceLookup, normalizeName, referenceBook } from "../module/scripts/reference.mjs";

const spell = (system = {}, extra = {}) => ({ documentType: "Item", subType: "spell", uuid: "Item.test", name: "Test", system, ...extra });
const monster = (system = {}) => ({ documentType: "Actor", subType: "npc", uuid: "Actor.test", name: "Test", system });
const state = (scheme, group, selected) => group ? setGroup(setScheme(normalizeFilters(), scheme), group, selected) : setScheme(normalizeFilters(), scheme);
const match = (item, filters) => matchesFilters(filterItemData(item), filters);

test("three schemes follow the local quick-reference group order", () => {
  assert.deepEqual(SCHEMES.spells.groups, ["special", "mundane", "casting", "level", "school", "classes", "source"]);
  assert.deepEqual(SCHEMES.magic.groups, ["rarity", "category", "attunement", "source"]);
  assert.deepEqual(SCHEMES.monsters.groups, ["cr", "legendary", "size", "creatureType", "source"]);
});
test("schema migration resets incompatible tri-state filters and sanitizes malformed input", () => {
  assert.deepEqual(normalizeFilters({ type: { include: ["spell"] } }), normalizeFilters());
  assert.deepEqual(normalizeFilters(null), normalizeFilters());
  const result = normalizeFilters({ version: 3, scheme: "__proto__", profiles: { spells: { level: ["0", "0", null] } } });
  assert.equal(result.scheme, "items");
  assert.deepEqual(result.profiles.spells.level, ["0"]);
});
test("normal groups default to all, while Clear means zero matches", () => {
  assert.equal(match(spell(), state("spells")), true);
  assert.equal(match(spell(), state("spells", "level", [])), false);
  assert.equal(match(spell({ level: 3 }), state("spells", "level", null)), true);
});
test("scheme changes preserve separate selections; reset only affects the current scheme", () => {
  const original = state("spells", "level", ["3"]);
  let next = setScheme(original, "magic");
  next = setGroup(next, "rarity", ["rare"]);
  next = resetProfile(next);
  assert.equal(next.profiles.magic.rarity, null);
  assert.deepEqual(setScheme(next, "spells").profiles.spells.level, ["3"]);
  assert.deepEqual(original.profiles.spells.level, ["3"]);
  assert.equal(activeFilters(original).length, 1);
});
test("checkbox choices OR within groups, AND across groups", () => {
  const filters = setGroup(state("spells", "level", ["0", "3"]), "school", ["evo"]);
  assert.equal(match(spell({ level: 0, school: "evo" }), filters), true);
  assert.equal(match(spell({ level: 3, school: "evo" }), filters), true);
  assert.equal(match(spell({ level: 3, school: "abj" }), filters), false);
  assert.equal(match(spell({ level: 2, school: "evo" }), filters), false);
});
test("missing level is unknown, not a cantrip", () => {
  for (const level of [undefined, null, "", "bad", -1, 10]) {
    assert.equal(match(spell({ level }), state("spells", "level", ["0"])), false);
    assert.equal(match(spell({ level }), state("spells", "level", ["unknown"])), true);
  }
  assert.equal(match(spell({ level: "0" }), state("spells", "level", ["0"])), true);
});
test("casting time follows action/bonus/reaction/other and preserves unknown", () => {
  assert.equal(match(spell({ activation: { type: "minute" } }), state("spells", "casting", ["other"])), true);
  assert.equal(match(spell({}), state("spells", "casting", ["other"])), false);
});
test("special and mundane requirements are explicit, including conflicting selections", () => {
  const data = spell({ properties: new Set(["ritual", "vocal"]) });
  let filters = state("spells", "special", ["ritual", "vocal"]);
  assert.equal(match(data, filters), true);
  filters = setGroup(filters, "mundane", ["concentration"]);
  assert.equal(match(data, filters), true);
  filters = setGroup(filters, "mundane", ["ritual"]);
  assert.equal(match(data, filters), false);
  assert.equal(match(spell(), state("spells", "mundane", ["concentration"])), false);
});
test("costly/consumed material uses known fields, not invented negatives", () => {
  const yes = state("spells", "special", ["costly"]);
  const no = state("spells", "mundane", ["costly"]);
  assert.equal(match(spell({ properties: ["material"], materials: { cost: 100, consumed: false } }), yes), true);
  assert.equal(match(spell({ properties: ["material"], materials: { cost: 0, consumed: true } }), yes), true);
  assert.equal(match(spell({ properties: ["material"], materials: { cost: 0, consumed: false } }), no), true);
  assert.equal(match(spell({ properties: ["material"] }), no), false);
  assert.equal(match(spell({ properties: [] }), no), true);
});
test("source filtering distinguishes editions and canonicalizes abbreviation aliases", () => {
  const filters = state("spells", "source", ["book:phb14"]);
  assert.equal(match(spell({ source: { book: "PHB", rules: "2014" } }), filters), true);
  assert.equal(match(spell({ source: { book: "PHB 2024" } }), filters), false);
  assert.equal(referenceBook("TCoE"), referenceBook("TCE"));
  assert.equal(referenceBook("PHB 2024"), "phb24");
});
test("spell classes are matched by bilingual name plus explicit source", () => {
  for (const name of ["Fireball", "火球术", "火球术Fireball"]) {
    const item = spell({ source: { book: "PHB 2024" } }, { name });
    assert.equal(match(item, state("spells", "classes", ["wizard"])), true);
    assert.equal(match(item, state("spells", "classes", ["cleric"])), false);
  }
  assert.equal(match(spell({ source: { book: "My homebrew" } }, { name: "Fireball" }), state("spells", "classes", ["wizard"])), false);
  assert.equal(match(spell({ sourceClass: "wizard" }), state("spells", "classes", ["unknown"])), true);
});
test("reference matching never fuzzy-matches a name or combines conflicting records", () => {
  const lookup = makeReferenceLookup([
    { kind: "spell", book: "PHB14", names: ["Same"], classes: ["wizard"] },
    { kind: "spell", book: "PHB24", names: ["Same"], classes: ["cleric"] },
    { kind: "spell", book: "TCE", names: ["Conflict"], classes: ["wizard"] },
    { kind: "spell", book: "TCE", names: ["Conflict"], classes: ["cleric"] }
  ]);
  assert.deepEqual(lookup(spell({}, { name: "Same" }), { kind: "book", label: "PHB'14" }).classes, ["wizard"]);
  assert.deepEqual(lookup(spell({}, { name: "Same" }), { kind: "book", label: "PHB'24" }).classes, ["cleric"]);
  assert.equal(lookup(spell({}, { name: "Same" }), { kind: "book", label: "PHB" }), null);
  assert.equal(lookup(spell({}, { name: "Sam" }), { kind: "book", label: "PHB'14" }), null);
  assert.equal(lookup(spell({}, { name: "Conflict" }), { kind: "book", label: "TCoE" }), null);
  assert.equal(normalizeName("Melf’s Acid Arrow"), "melfsacidarrow");
});
test("magic-item categories and attunement respect actual metadata", () => {
  const wand = spell({ rarity: "rare", type: { value: "wand" }, attunement: "required" }, { subType: "equipment" });
  const filters = setGroup(state("magic", "category", ["wand"]), "attunement", ["yes"]);
  assert.equal(match(wand, filters), true);
  assert.equal(match({ ...wand, system: { ...wand.system, attunement: "optional" } }, state("magic", "attunement", ["special"])), true);
  assert.equal(match(spell({}, { subType: "weapon" }), state("magic")), false);
  assert.equal(match(spell({ rarity: "rare" }), state("magic")), false);
});
test("local magic-item factual classification is available without loading documents", () => {
  const reference = lookupReference(spell({}, { subType: "weapon", name: "Acheron Blade" }), { kind: "book", label: "EGW" });
  assert.equal(reference.category, "weapon");
  assert.equal(reference.rarity, "rare");
  const item = spell({ source: { book: "EGW" } }, { subType: "weapon", name: "Acheron Blade" });
  assert.equal(match(item, state("magic", "rarity", ["rare"])), true);
});
test("NPC-only monster scheme never includes player characters or items", () => {
  assert.equal(match(monster(), state("monsters")), true);
  assert.equal(match({ ...monster(), subType: "character" }, state("monsters")), false);
  assert.equal(match(spell(), state("monsters")), false);
  assert.equal(match(monster(), state("items")), false);
  assert.equal(isSupportedResult({ item: { ...monster(), subType: "character" } }), false);
});
test("CR range compares fractions numerically and includes both boundaries", () => {
  const filters = state("monsters", "cr", { min: 0.125, max: 0.5 });
  assert.equal(parseCR("1/8"), 0.125);
  for (const cr of [0.125, "1/4", 0.5]) assert.equal(match(monster({ details: { cr } }), filters), true);
  for (const cr of [0, 1, null, undefined]) assert.equal(match(monster({ details: { cr } }), filters), false);
  assert.equal(match(monster(), state("monsters")), true);
  assert.deepEqual(state("monsters", "cr", { min: 10, max: 2 }).profiles.monsters.cr, { min: 2, max: 10 });
});
test("monster size, creature type and legendary actions combine correctly", () => {
  const dragon = monster({ details: { cr: 20, type: { value: "dragon" } }, traits: { size: "grg" }, resources: { legact: { max: 3 } } });
  let filters = state("monsters", "legendary", ["yes"]);
  filters = setGroup(filters, "size", ["grg"]);
  filters = setGroup(filters, "creatureType", ["dragon"]);
  assert.equal(match(dragon, filters), true);
  assert.equal(match(monster(), state("monsters", "legendary", ["no"])), false);
  assert.equal(match(monster({ resources: { legact: { max: 0 } } }), state("monsters", "legendary", ["no"])), true);
});
test("catalogs use the full permitted index and keep source lists scheme-specific", () => {
  const a = spell({ level: 0 }, { package: "a.spells", packageName: "Spells" });
  const b = spell({ level: 3, source: { book: "TCoE" } });
  const npc = monster({ source: { book: "MM 2025" } });
  const results = [...Array.from({ length: 120 }, () => ({ item: a })), { item: b }, { item: npc }];
  const { options, dataCache } = buildFilterOptions(results);
  assert.ok(options.spells.source.some(x => x.value === "book:tce"));
  assert.ok(!options.spells.source.some(x => x.value === "book:mm25"));
  assert.ok(options.monsters.source.some(x => x.value === "book:mm25"));
  assert.equal(options.spells.source.find(x => x.value === "pack:a.spells").count, 120);
  assert.equal(dataCache.get(npc).monster, true);
});
test("untrusted names and type labels remain text, never prototype properties", () => {
  const item = spell({ source: { book: '<img onerror="bad()">' } }, { subType: "constructor" });
  const { options } = buildFilterOptions([{ item }]);
  assert.equal(options.items.type[0].label, "constructor");
  assert.equal(options.items.source[0].label, '<img onerror="bad()">');
});
test("index extensions are metadata only and include NPC fields", () => {
  assert.ok(FILTER_INDEX_FIELDS.includes("system.materials.cost"));
  assert.ok(ACTOR_FILTER_INDEX_FIELDS.includes("system.details.cr"));
  assert.ok([...FILTER_INDEX_FIELDS, ...ACTOR_FILTER_INDEX_FIELDS].every(field => !/description|items|activities/.test(field)));
});
