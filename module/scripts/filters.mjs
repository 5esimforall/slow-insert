import { t, currentLocale, localizeValue } from "./i18n.mjs";
import { resolveSource } from "./source.mjs";
import { lookupReference } from "./reference.mjs";
import { prepareSourceEnvironment } from "./source-resolution.mjs";

export const FILTER_INDEX_FIELDS = Object.freeze([
  "system.level", "system.school", "system.activation.type", "system.properties", "system.identifier",
  "system.materials.cost", "system.materials.consumed", "system.rarity", "system.type.value", "system.attunement"
]);
export const ACTOR_FILTER_INDEX_FIELDS = Object.freeze([
  "system.details.cr", "system.details.type.value", "system.traits.size", "system.resources.legact.max"
]);
const pairs = (group, values) => values.map(value => ({ value, label: `Option.${group}.${value}` }));
const unknown = { value: "unknown", label: "Unknown" };
const special = [ "concentration", "ritual", "vocal", "somatic", "material", "costly" ];
export const GROUPS = Object.freeze({
  type: { label: "Group.type" },
  source: { label: "Group.source" },
  special: { label: "Group.special", optional: true, options: pairs("special", special) },
  mundane: { label: "Group.mundane", optional: true, options: pairs("mundane", special) },
  casting: { label: "Group.casting", options: [...pairs("casting", [ "action", "bonus", "reaction", "other" ]), unknown] },
  level: { label: "Group.level", options: [...Array.from({ length: 10 }, (_, n) => ({ value: String(n), label: n ? "Level" : "Cantrip", data: { level: n } })), unknown] },
  school: { label: "Group.school", options: [...pairs("school", [ "abj", "con", "div", "enc", "evo", "ill", "nec", "trs" ]), unknown] },
  classes: { label: "Group.classes", options: [...pairs("classes", [ "bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "wizard", "warlock", "artificer", "none" ]), unknown] },
  rarity: { label: "Group.rarity", options: [...pairs("rarity", [ "common", "uncommon", "rare", "veryRare", "legendary", "artifact", "varies" ]), unknown] },
  category: { label: "Group.category", options: [...pairs("category", [ "armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous" ]), unknown] },
  attunement: { label: "Group.attunement", options: [...pairs("attunement", [ "no", "yes", "special" ]), unknown] },
  cr: { label: "Group.cr", range: true },
  legendary: { label: "Group.legendary", options: [...pairs("legendary", [ "yes", "no" ]), unknown] },
  size: { label: "Group.size", options: [...pairs("size", [ "tiny", "sm", "med", "lg", "huge", "grg" ]), unknown] },
  creatureType: { label: "Group.creatureType", options: [...pairs("creatureType", [ "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead" ]), unknown] },
});
export const SCHEMES = Object.freeze({
  items: { label: "Scheme.items", groups: ["type", "source"] },
  spells: { label: "Scheme.spells", groups: ["casting", "level", "school", "classes", "source", "special", "mundane"] },
  magic: { label: "Scheme.magic", groups: ["rarity", "category", "attunement", "source"] },
  monsters: { label: "Scheme.monsters", groups: ["cr", "legendary", "size", "creatureType", "source"] },
});
export const CR_OPTIONS = Object.freeze([0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, n) => n + 1)]);
export const crLabel = value => ({ "0.125": "1/8", "0.25": "1/4", "0.5": "1/2" })[value] || String(value);
const ITEM_TYPES = new Set(["spell", "weapon", "equipment", "consumable", "feat", "class", "subclass", "race", "background", "tool", "loot", "container", "unknown"]);
const text = value => typeof value === "string" ? value.trim() : "";
const own = (value, key) => Object.hasOwn(value ?? {}, key) ? value[key] : undefined;
const list = value => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === "string" && v))] : [];
const number = value => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) ? Number(value) : null;

export function parseCR(value) {
  const fractions = { "1/8": 0.125, "1/4": 0.25, "1/2": 0.5 };
  const result = own(fractions, value) ?? number(value);
  return result !== null && result >= 0 ? result : null;
}

/** Normalize the current filter schema at the storage boundary. */
export function normalizeFilters(value) {
  const saved = value?.version === 4 ? value : {};
  const profiles = Object.fromEntries(Object.entries(SCHEMES).map(([scheme, { groups }]) => [scheme,
    Object.fromEntries(groups.map(id => {
      const current = own(saved.profiles?.[scheme], id);
      if (GROUPS[id].range) {
        let min = parseCR(current?.min), max = parseCR(current?.max);
        if (min !== null) min = Math.min(30, min);
        if (max !== null) max = Math.min(30, max);
        if (min !== null && !CR_OPTIONS.includes(min)) min = null;
        if (max !== null && !CR_OPTIONS.includes(max)) max = null;
        if (min !== null && max !== null && min > max) [min, max] = [max, min];
        return [id, { min, max }];
      }
      return [id, GROUPS[id].optional ? list(current) : Array.isArray(current) ? list(current) : null];
    }))
  ]));
  return { version: 4, includeExternal: saved.includeExternal === true, scheme: Object.hasOwn(SCHEMES, saved.scheme) ? saved.scheme : "items", profiles };
}
export function setScheme(state, scheme) {
  const next = normalizeFilters(state);
  if (Object.hasOwn(SCHEMES, scheme)) next.scheme = scheme;
  return next;
}
export function setGroup(state, group, selected) {
  const next = normalizeFilters(state);
  if (!SCHEMES[next.scheme].groups.includes(group)) return next;
  next.profiles[next.scheme][group] = selected;
  return normalizeFilters(next);
}
export function resetProfile(state) {
  const next = normalizeFilters(state);
  next.profiles[next.scheme] = normalizeFilters().profiles[next.scheme];
  return next;
}
export function activeFilters(state) {
  return SCHEMES[state.scheme].groups.filter(id => {
    const selected = state.profiles[state.scheme][id];
    return GROUPS[id].range ? selected.min !== null || selected.max !== null
      : GROUPS[id].optional ? selected.length > 0 : selected !== null;
  }).map(id => ({ group: id, selected: state.profiles[state.scheme][id] }));
}
export function isSupportedResult(result) {
  const item = result?.item;
  return typeof item?.uuid === "string" && (item.documentType === "Item" || (item.documentType === "Actor" && item.subType === "npc"));
}

function magicCategory(item, reference) {
  if (reference?.category) return reference.category;
  const type = item.system?.type?.value;
  if (["light", "medium", "heavy", "shield", "armor"].includes(type)) return "armor";
  if (["potion", "ring", "rod", "scroll", "staff", "wand"].includes(type)) return type;
  if (item.subType === "weapon" || type === "ammo") return "weapon";
  if (["trinket", "clothing", "wondrous"].includes(type)) return "wondrous";
  return "unknown";
}

export function filterItemData(item, environment = {}) {
  const source = resolveSource(item, environment);
  const sourceKey = source.keys[0];
  const system = item.system ?? {};
  const isItem = item.documentType === "Item";
  const spell = isItem && item.subType === "spell";
  const monster = item.documentType === "Actor" && item.subType === "npc";
  const physical = isItem && !["spell", "feat", "class", "subclass", "race", "background"].includes(item.subType);
  const reference = (spell || physical) ? (environment.referenceLookup ?? lookupReference)(item, source) : null;
  const propertiesKnown = system.properties instanceof Set || Array.isArray(system.properties);
  const properties = propertiesKnown ? new Set(system.properties) : new Set();
  const flags = Object.fromEntries(special.map(key => [key, propertiesKnown ? properties.has(key) : null]));
  const cost = number(system.materials?.cost);
  const consumed = system.materials?.consumed;
  flags.costly = flags.material === false ? false
    : (cost !== null && cost > 0) || consumed === true ? true
      : cost !== null && cost === 0 && consumed === false ? false : null;
  const level = number(system.level);
  const casting = text(system.activation?.type);
  const rawAttunement = system.attunement;
  const attunement = ["required", 1, 2].includes(rawAttunement) ? "yes"
    : ["optional", "special"].includes(rawAttunement) ? "special"
      : ["", "none", 0].includes(rawAttunement) ? "no" : reference?.attunement || "unknown";
  const legendary = number(system.resources?.legact?.max);
  const classes = reference?.classes?.length ? reference.classes : ["unknown"];
  const rarity = text(system.rarity) || reference?.rarity || "unknown";
  return {
    isItem, spell, monster, magic: physical && (rarity !== "unknown" || properties.has("mgc") || reference?.kind === "magic"),
    source, sourceKey, cr: monster ? parseCR(system.details?.cr) : null,
    referenceMatched: Boolean(reference),
    values: {
      source: source.keys, type: [text(item.subType) || "unknown"],
      special: spell ? Object.keys(flags).filter(key => flags[key] === true) : [],
      mundane: spell ? Object.keys(flags).filter(key => flags[key] === false) : [],
      level: [level !== null && Number.isInteger(level) && level >= 0 && level <= 9 ? String(level) : "unknown"],
      school: [text(system.school) || "unknown"],
      casting: [!casting ? "unknown" : ["action", "bonus", "reaction"].includes(casting) ? casting : "other"],
      classes, rarity: [rarity], category: [magicCategory(item, reference)], attunement: [attunement],
      legendary: [legendary === null ? "unknown" : legendary > 0 ? "yes" : "no"],
      size: [text(system.traits?.size) || "unknown"],
      creatureType: [text(system.details?.type?.value) || "unknown"]
    }
  };
}
export function matchesScheme(data, scheme) {
  return scheme === "spells" ? data.spell : scheme === "magic" ? data.magic : scheme === "monsters" ? data.monster : data.isItem;
}
export function matchesFilters(data, state) {
  if (data.source?.external && state.includeExternal !== true) return false;
  if (!matchesScheme(data, state.scheme)) return false;
  for (const id of SCHEMES[state.scheme].groups) {
    const selected = state.profiles[state.scheme][id];
    if (GROUPS[id].range) {
      if (selected.min === null && selected.max === null) continue;
      if (data.cr === null || (selected.min !== null && data.cr < selected.min) || (selected.max !== null && data.cr > selected.max)) return false;
    } else if (GROUPS[id].optional) {
      if (!selected.every(key => data.values[id].includes(key))) return false;
    } else if (selected !== null && !selected.some(key => data.values[id].includes(key))) return false;
  }
  return true;
}

/** Options are scheme-specific and use the entire permission-filtered index. */
export function buildFilterOptions(results, environment = {}, config = {}) {
  environment = prepareSourceEnvironment(environment);
  const options = Object.fromEntries(Object.entries(SCHEMES).map(([scheme, { groups }]) => [scheme,
    Object.fromEntries(groups.filter(id => !GROUPS[id].range).map(id => [id,
      new Map((GROUPS[id].options ?? []).map(option => [option.value, { ...option, label: t(option.label, option.data, environment), title: t(option.label, option.data, environment), count: 0 }]))]))]));
  const dataCache = new WeakMap();
  const add = (scheme, id, value, label, title = label, section, searchText) => {
    const option = options[scheme][id].get(value);
    if (option) option.count++;
    else options[scheme][id].set(value, { value, label, title, section, searchText, count: 1 });
  };
  for (const result of results) {
    if (!isSupportedResult(result)) continue;
    const item = result.item;
    const data = filterItemData(item, environment);
    dataCache.set(item, data);
    for (const [scheme, { groups }] of Object.entries(SCHEMES)) {
      if (!matchesScheme(data, scheme)) continue;
      for (const id of groups) {
        if (GROUPS[id].range) continue;
        for (const value of data.values[id]) {
          if (id === "source") {
            const option = data.source.options.find(option => option.value === value);
            add(scheme, id, value, option.label, option.title, option.section, option.searchText);
          }
          else if (id === "type") add(scheme, id, value, itemTypeLabel(value, config.typeLabels, environment));
          else add(scheme, id, value, options[scheme][id].get(value)?.label || value);
        }
      }
    }
  }
  for (const groups of Object.values(options)) for (const [id, values] of Object.entries(groups)) {
    groups[id] = [...values.values()];
    if (!GROUPS[id].options) groups[id].sort((a, b) => (Number(a.section === "review") - Number(b.section === "review"))
      || a.label.localeCompare(b.label, currentLocale(environment), { numeric: true }));
  }
  return { options, dataCache };
}

/** Prefer the system's own type labels, including active translation modules. */
export function itemTypeLabel(value, typeLabels, environment = {}) {
  const key = own(typeLabels, value);
  if (typeof key === "string" && key) {
    const label = localizeValue(key, environment);
    if (label !== key || !key.includes(".")) return label;
  }
  return ITEM_TYPES.has(value) ? t(`Type.${value}`, {}, environment) : value;
}
