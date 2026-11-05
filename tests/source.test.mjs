import test from "node:test";
import assert from "node:assert/strict";
import { sourceBadge, resolveSource as resolveWithLocale, SOURCE_INDEX_FIELDS, isItemResult } from "../module/scripts/source.mjs";
import { language } from "./localization.mjs";
const resolveSource = (item, environment = {}) => resolveWithLocale(item, { ...language("en"), ...environment });

test("source badge normalizes core book names and explicit editions", () => {
  assert.equal(sourceBadge("Player’s Handbook (2014)"), "PHB'14");
  assert.equal(sourceBadge("PHB 2024", "2014"), "PHB'24");
  assert.equal(sourceBadge("PHB'14"), "PHB'14");
  assert.equal(sourceBadge("玩家手册", "2024"), "PHB'24");
  assert.equal(sourceBadge("Dungeon Master's Guide", "2014"), "DMG'14");
  assert.equal(sourceBadge("Monster Manual 2025", "2024"), "MM'25");
  assert.equal(sourceBadge("XPHB"), "PHB'24");
  assert.equal(sourceBadge("XMM"), "MM'25");
});

test("missing or unrecognized edition is not guessed", () => {
  assert.equal(sourceBadge("PHB"), "PHB");
  assert.equal(sourceBadge("PHB", "unknown"), "PHB");
  assert.equal(sourceBadge("My Book", "2024"), "My Book");
  assert.equal(sourceBadge("Tasha's Cauldron of Everything", "2014"), "TCoE");
  assert.equal(sourceBadge("constructor"), "constructor");
  assert.equal(sourceBadge("__proto__"), "__proto__");
});

const pack = {
  title: "Spells",
  metadata: { packageType: "module", packageName: "test-module", flags: {} }
};
const env = {
  packs: new Map([["test-module.spells", pack]]),
  modules: new Map([["test-module", { flags: { dnd5e: { sourceBooks: { "PHB 2024": "Book title" } } } }]])
};
const item = { uuid: "Compendium.test-module.spells.Item.abc", documentType: "Item", package: "test-module.spells" };

test("explicit item edition takes precedence over container metadata", () => {
  const result = resolveSource({ ...item, system: { source: { book: "PHB 2014", rules: "2014", page: "241" } } }, env);
  assert.equal(result.label, "PHB'14");
  assert.equal(result.kind, "book");
  assert.match(result.title, /p\. 241/);
  assert.match(result.title, /Spells/);
});

test("custom and legacy source strings are supported", () => {
  assert.match(resolveSource({ ...item, system: { source: { book: "PHB", custom: "My setting" } } }, env).title, /My setting/);
  assert.equal(resolveSource({ ...item, system: { source: "PHB 2014" } }, env).label, "PHB'14");
});

test("single module sourcebook and UUID pack lookup work", () => {
  assert.equal(resolveSource(item, env).label, "PHB'24");
  assert.equal(resolveSource({ ...item, package: undefined }, env).label, "PHB'24");
});

test("pack sourcebook wins over module sourcebook", () => {
  const packs = new Map([[item.package, { ...pack, metadata: { ...pack.metadata, flags: { dnd5e: { sourceBook: "TCoE" } } } }]]);
  assert.equal(resolveSource(item, { ...env, packs }).label, "TCoE");
});

test("a module with multiple books is ambiguous, not arbitrarily assigned", () => {
  const modules = new Map([["test-module", { flags: { dnd5e: { sourceBooks: { PHB: "PHB", DMG: "DMG" } } } }]]);
  const result = resolveSource(item, { ...env, modules });
  assert.equal(result.label, "Source unknown");
  assert.match(result.title, /Spells/);
  assert.equal(result.kind, "fallback");
  assert.match(result.title, /Source unknown/);
});

test("missing data is not mislabeled as homebrew or a particular edition", () => {
  assert.equal(resolveSource({ uuid: "Item.abc" }).label, "Source unknown");
  assert.equal(resolveSource({ uuid: "Compendium.unknown.spells.Item.abc" }).label, "Source unknown");
  assert.equal(resolveSource({ ...item, system: { source: { rules: "2024" } } }).kind, "fallback");
});

test("source data stays text, never trusted HTML", () => {
  const book = '<img src=x onerror="alert(1)">';
  const result = resolveSource({ system: { source: { book } } });
  assert.equal(result.label, "Source unknown");
  assert.ok(result.title.includes(book));
});

test("index requests include only the small source metadata fields", () => {
  assert.deepEqual(SOURCE_INDEX_FIELDS, ["system.source.book", "system.source.rules", "system.source.custom", "system.source.page"]);
});

test("Quick Insert filters receive wrapped results", () => {
  assert.equal(isItemResult({ item }), true);
  assert.equal(isItemResult({ item: { ...item, documentType: "Actor" } }), false);
  assert.equal(isItemResult({ item: { documentType: "Item" } }), false);
  assert.equal(isItemResult(null), false);
});

test("external integration handles are not mislabeled as world documents", () => {
  const result = resolveSource({ uuid: "@spell[forcecage|xphb|Forcecage]", source: "xphb" });
  assert.equal(result.origin, "external");
  assert.equal(result.kind, "book");
  assert.match(result.label, /PHB'24/);
});

test("drag preserves provider import data and falls back to native UUIDs", async () => {
  const { documentDragData } = await import("../module/scripts/source.mjs");
  const payload = { type: "Item", uuid: "@spell[forcecage|xphb]", subType: "hover", page: "spells.html", hash: "forcecage_xphb" };
  assert.deepEqual(documentDragData({ documentType: "Item", dragData: payload }), payload);
  assert.deepEqual(documentDragData({ documentType: "Item", uuid: "Compendium.a.b.c" }), { type: "Item", uuid: "Compendium.a.b.c" });
});
