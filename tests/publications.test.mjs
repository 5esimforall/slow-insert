import test from "node:test";
import assert from "node:assert/strict";
import { PublicationCatalog, buildPublicationCatalog, parseCitations, publicationKey } from "../module/scripts/publications.mjs";
import { prepareSourceEnvironment, identifySource } from "../module/scripts/source-resolution.mjs";
import { resolveSource } from "../module/scripts/source.mjs";
import { buildFilterOptions, filterItemData, matchesFilters, normalizeFilters, setGroup } from "../module/scripts/filters.mjs";
import { language } from "./localization.mjs";

const item = (source = {}, extra = {}) => ({ uuid: "Item.test", documentType: "Item", subType: "equipment", system: { source }, ...extra });
const resolve = (source, environment) => resolveSource(item(source), { ...language("en"), ...environment });
const catalog = new PublicationCatalog();
const ids = value => catalog.lookup(value).map(book => book.id).sort();

test("bibliographic aliases canonicalize full titles and generated acronym styles", () => {
  for (const [id, aliases] of [
    ["tce", ["TCE", "TCoE", "Tasha’s Cauldron of Everything"]],
    ["xge", ["XGE", "XGtE", "Xanathar's Guide to Everything"]],
    ["egw", ["EGW", "EGtW", "Explorer's Guide to Wildemount"]],
    ["erlw", ["ERLW", "ERftLW", "Eberron: Rising from the Last War"]],
    ["efa", ["EFA", "EFotA"]], ["bmt", ["BMT", "TBoMT"]],
    ["frhof", ["HoF", "FRHoF", "Forgotten Realms: Heroes of Faerun"]]
  ]) for (const alias of aliases) assert.deepEqual(ids(alias), [id], alias);
  assert.deepEqual(ids("PHB"), ["phb14", "phb24"]);
  assert.deepEqual(ids("PHB 2924"), []);
  assert.deepEqual(ids("SACG"), []); // no fuzzy typo repair
});

test("citations parse pages, ranges and multilingual punctuation without creating books per page", () => {
  for (const value of ["PHB pg. 153", "PHB p. 153", "PHB page 153", "PHB，第153页"]) {
    const [citation] = parseCitations(value);
    assert.equal(citation.page, "153", value);
    assert.equal(citation.candidates.length, 2, value);
  }
  const refs = parseCitations("PHB pg. 107; 110, XGE pg 164");
  assert.equal(refs.length, 2);
  assert.equal(refs[0].page, "107; 110");
  assert.equal(refs[1].candidates[0].id, "xge");
  assert.equal(parseCitations("DMG. pg. 187")[0].candidates.length, 2);
  assert.equal(parseCitations("UA 2018 · Races of Eberron，第8—9页")[0].page, "8—9");
  assert.equal(parseCitations("VGM/MPMM").length, 2);
});

test("pages collapse under a book while each result keeps its own citation", () => {
  const entries = [153, 150, 149].map(page => ({ item: item({ custom: `PHB pg. ${page}`, rules: "2014" }, { uuid: `Item.p${page}` }) }));
  const { options, dataCache } = buildFilterOptions(entries, language("en"));
  assert.deepEqual(options.items.source.map(option => [option.value, option.count]), [["book:phb14", 3]]);
  assert.match(dataCache.get(entries[0].item).source.title, /p\. 153/);
  assert.equal(dataCache.get(entries[0].item).source.label, "PHB'14");
  assert.match(dataCache.get(entries[0].item).source.title, /rules version/);
});

test("core editions need evidence; a bare page number does not establish 2014", () => {
  const result = resolve({ custom: "PHB pg. 153" });
  assert.equal(result.status, "edition-unknown");
  assert.deepEqual(result.keys, ["review:edition:phb"]);
  assert.match(result.title, /p\. 153/);
  assert.equal(resolve({ book: "PHB", rules: "2024", page: "153" }).label, "PHB'24");
  assert.equal(resolve({ book: "MM 2024", rules: "2024" }).label, "MM'25");
});

test("conflicting explicit citations and rules never enter confirmed edition filters", () => {
  for (const source of [
    { book: "PHB 2014", rules: "2024", page: "153" },
    { book: "PHB 2024", custom: "PHB 2014 pg. 153" },
    { custom: "SRD 5.1", rules: "2024" },
    { custom: "PHB 2014 / PHB 2024" }
  ]) {
    const result = resolve(source);
    assert.equal(result.status, "edition-conflict");
    assert.deepEqual(result.keys, ["review:edition-conflict"]);
    assert.deepEqual(result.referenceIds, []);
  }
  const fields = resolve({ book: "PHB 2014", custom: "DMG 2014" });
  assert.equal(fields.status, "source-conflict");
  assert.deepEqual(fields.keys, ["review:source-conflict"]);
});

test("implementation notes never override a valid structured book", () => {
  const result = resolve({ book: "SRD 5.2", custom: "Midi 12.4.25", rules: "2024" });
  assert.equal(result.label, "SRD 5.2");
  assert.match(result.title, /Midi 12\.4\.25/);
  assert.equal(result.status, "confirmed");
  // Older publications used with the revised game are not automatically a
  // conflict: only identities with explicit generation semantics enforce it.
  assert.equal(resolve({ book: "TCE", rules: "2024" }).status, "confirmed");
});

test("module names, versions, class names and unknown book text stay out of bibliography", () => {
  for (const name of ["2.1.38", "Midi 12.4.25", "CPR Class Features", "BLFX", "Warlock : The Genie", "DND BEYOND", "My undisclosed book", "PHB 2924"]) {
    const result = resolve({ custom: name });
    assert.deepEqual(result.keys, ["review:unknown"], name);
    assert.equal(result.label, "Source unknown", name);
    assert.ok(result.title.includes(name));
  }
});

test("multiple citations are individual OR-able publications; partial unknowns remain visible", () => {
  const result = resolve({ custom: "VGM/MPMM", rules: "2014" });
  assert.deepEqual(result.keys, ["book:vgm", "book:mpmm"]);
  const data = filterItemData(item({ custom: "VGM/MPMM", rules: "2014" }));
  for (const value of result.keys) assert.equal(matchesFilters(data, setGroup(normalizeFilters(), "source", [value])), true);
  const partial = resolve({ custom: "TCoE / Unknown Publication" });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.keys, ["book:tce", "review:partial"]);
  const repeated = resolve({ custom: "TCE pg 12; TCoE pg 15" });
  assert.deepEqual(repeated.keys, ["book:tce"]);
  assert.match(repeated.title, /p\. 12/);
  assert.match(repeated.title, /p\. 15/);
});

test("container declarations supply missing sources but do not overwrite explicit item editions", () => {
  const env = { packs: new Map([["vendor.spells", { title: "Imported spells", metadata: { packageName: "vendor", flags: { dnd5e: { sourceBook: "PHB 2024" } } } }]]) };
  const get = source => resolveSource(item(source, { package: "vendor.spells" }), { ...language("en"), ...env });
  assert.equal(get({}).label, "PHB'24");
  assert.equal(get({ book: "PHB 2014", rules: "2014" }).label, "PHB'14");
  assert.equal(get({ book: "PHB", rules: "2014" }).status, "edition-conflict");
  assert.equal(get({ custom: "An unregistered setting" }).status, "unknown");
});

test("declarative catalogs and providers add books without changing resolver logic", () => {
  const env = prepareSourceEnvironment({
    ...language("en"), sourceBooks: { "AGT": "A Guide to Tomorrow" },
    modules: new Map([["extra", { active: true, flags: { "slow-insert": { publications: [
      { id: "test-new", label: "TN", title: "Testing New Publications", aliases: ["新品规则"] }
    ] } } }]]),
    publicationProviders: new Map([["test", [{ id: "another", label: "ZX", title: "Zany Xanadus", aliases: ["New Alias"] }]]])
  });
  for (const [name, id] of [["AGT", "agt"], ["A Guide to Tomorrow", "agt"], ["新品规则", "test-new"], ["New Alias", "another"]]) {
    assert.deepEqual(resolveSource(item({ book: name }), env).keys, [`book:${id}`]);
  }
  const unknown = buildPublicationCatalog({ sourceBooks: { "2.1.38": "2.1.38" } });
  assert.deepEqual(unknown.lookup("2.1.38"), []);
});

test("alias collisions are reviewable, not order-dependent guesses", () => {
  const sourceCatalog = new PublicationCatalog([
    { id: "a", label: "A", title: "Alpha Book", aliases: ["shared"] },
    { id: "b", label: "B", title: "Beta Book", aliases: ["shared"] }
  ]);
  const result = resolve({ book: "shared" }, { sourceCatalog });
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.keys, ["review:ambiguous"]);
});

test("external provider codes distinguish editions and never share a world-source filter key", () => {
  const entries = ["phb", "xphb", "xge"].map((source, i) => ({ item: { uuid: `@spell[name${i}|${source}]`, documentType: "Item", subType: "spell", source } }));
  entries.push({ item: item() });
  const { options, dataCache } = buildFilterOptions(entries, language("en"));
  assert.deepEqual(options.items.source.map(option => option.value).sort(), ["book:phb14", "book:phb24", "book:xge", "review:unknown"]);
  assert.match(dataCache.get(entries[0].item).source.label, /External.*PHB'14/);
  assert.equal(resolve({ book: "PHB" }).status, "edition-unknown");
});

test("optional importer metadata expands both native aliases and external source codes safely", () => {
  const env = prepareSourceEnvironment({ externalPublications: {
    titles: { XPHB: "玩家手册(2024)", PHB: "玩家手册", NEW: "A Completely New Adventure" },
    abbreviations: { XPHB: "PHB'24", PHB: "PHB'14", NEW: "NEW" }, dates: { NEW: "2026-04-01" }
  } });
  assert.deepEqual(env.sourceCatalog.lookup("PHB").map(book => book.id), ["phb14", "phb24"]);
  assert.deepEqual(env.sourceCatalog.lookup("NEW").map(book => book.id), ["new"]);
  assert.equal(identifySource({ uuid: "@creature[test|PHB]", source: "PHB" }, env).references[0].record.id, "phb14");
});

test("source resolution does not mutate documents, provider declarations or shared QI index", () => {
  const source = Object.freeze({ book: "PHB", custom: "PHB pg. 153", rules: "2014" });
  const document = Object.freeze({ ...item(source), system: Object.freeze({ source }) });
  const before = JSON.stringify(document), env = prepareSourceEnvironment(language("en"));
  resolveSource(document, env);
  resolveSource(document, env);
  assert.equal(JSON.stringify(document), before);
  assert.equal(env.sourceCache.size, undefined); // weak, not a retained document registry
});

test("v3 source selections reset only that facet, not other schemes and filters", () => {
  const result = normalizeFilters({ version: 3, scheme: "spells", profiles: {
    spells: { source: ["book:phbpg153"], level: ["3"], school: ["evo"] }, magic: { rarity: ["rare"] }
  } });
  assert.equal(result.version, 4);
  assert.equal(result.scheme, "spells");
  assert.equal(result.profiles.spells.source, null);
  assert.deepEqual(result.profiles.spells.level, ["3"]);
  assert.deepEqual(result.profiles.magic.rarity, ["rare"]);
  assert.equal(publicationKey("Faerûn"), publicationKey("Faerun"));
});

test("legacy NPC source fields remain readable without mutating the current source", () => {
  const actor = { uuid: "Actor.npc", documentType: "Actor", system: { source: { rules: "2014" }, details: { source: "MM 2014 pg 332" } } };
  const result = resolveSource(actor, language("en"));
  assert.equal(result.label, "MM'14");
  assert.match(result.title, /p\. 332/);
  assert.equal(actor.system.source.book, undefined);
});

test("registered aliases are searchable without leaking every alias into the visible label", () => {
  const { options } = buildFilterOptions([{ item: item({ book: "TCE" }) }], language("en"));
  assert.equal(options.items.source[0].label, "TCoE");
  assert.match(options.items.source[0].searchText, /TCE/i);
});


test("unrelated dynamically declared books sharing a new abbreviation stay ambiguous", () => {
  const environment = prepareSourceEnvironment({ sourceBooks: { ZZQ: "Zeta Question Almanac" }, modules: new Map([
    ["other", { flags: { dnd5e: { sourceBooks: { ZZQ: "Zoological Query Atlas" } } } }]
  ]) });
  const result = resolveSource(item({ book: "ZZQ" }), environment);
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.keys, ["review:ambiguous"]);
});

test("numeric source pages are retained and shared page fields do not claim a page in every cited book", () => {
  assert.match(resolve({ book: "PHB 2014", page: 153 }).title, /p\. 153/);
  const result = resolve({ custom: "VGM/MPMM", page: "12" });
  assert.ok(result.references.every(ref => ref.page === ""));
  assert.match(result.title, /p\. 12/);
});
