// @ts-check

import {canonicalUuid} from "./catalog-api.mjs";

/**
 * @typedef {import('../../types/slow-insert.d.ts').BrowseCatalog} BrowseCatalog
 * @typedef {import('../../types/slow-insert.d.ts').BrowseCatalogEntry} BrowseCatalogEntry
 * @typedef {import('../../types/slow-insert.d.ts').GroupedResultSet} GroupedResultSet
 * @typedef {import('../../types/slow-insert.d.ts').GroupingPreferences} GroupingPreferences
 * @typedef {import('../../types/slow-insert.d.ts').SearchResultWrapper} SearchResultWrapper
 */

/** @param {unknown} value @returns {string} */
const text = value => typeof value === "string" ? value.trim() : "";
/** @param {unknown} value @returns {string} */
const normalName = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s()（）]/g, "");

/**
 * @param {any} [value]
 * @returns {GroupingPreferences}
 */
export function normalizeGrouping(value) {
  const saved=value?.version===2?value:{};
  const pins=Object.fromEntries(Object.entries(saved.pins??{}).filter(([key,uuid])=>key.length<500&&typeof uuid==="string"&&uuid.length<500).slice(0,5000));
  const hidden=[...new Set((Array.isArray(saved.hidden)?saved.hidden:[]).filter((/** @type {unknown} */ id)=>typeof id==="string"&&id.length<500))];
  return {version:2,enabled:saved.enabled!==false,pins,hidden};
}

/**
 * Reapplying a review can merge or split groups; reconcile current pins by membership.
 * @param {Record<string, string>} pins
 * @param {Map<string, BrowseCatalogEntry>} entries
 * @returns {Record<string, string>}
 */
export function reconcilePins(pins, entries) {
  /** @type {Record<string, string>} */
  const next = {};
  /** @type {Set<string>} */
  const conflicts = new Set();
  for (const uuid of new Set(Object.values(pins))) {
    const key = entries.get(uuid)?.key;
    if (!key || conflicts.has(key)) continue;
    if (next[key] && next[key] !== uuid) { delete next[key]; conflicts.add(key); }
    else next[key] = uuid;
  }
  return next;
}

/**
 * @param {BrowseCatalogEntry[]} entries
 * @param {string} key
 * @param {GroupingPreferences} preferences
 * @returns {BrowseCatalogEntry[]}
 */
function prioritizeMembers(entries,key,preferences) {
  const pin=preferences.pins[key];
  /** @param {BrowseCatalogEntry} entry */
  const hasHanName=entry=>/\p{Script=Han}/u.test(entry.result.item.name ?? "");
  /** @param {BrowseCatalogEntry} entry */
  const automated=entry=>!('srd' in entry && entry.srd) && 'tags' in entry && entry.tags?.includes("automation")===true;
  /** @param {BrowseCatalogEntry} entry */
  const publisher=entry=>{
    const pack=entry.result.item.package || entry.uuid.match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1] || "";
    return /^(dnd-players-handbook|dnd-monster-manual|dnd-dungeon-masters-guide)\./.test(pack)?0:pack.startsWith("dnd5e.")?1:2;
  };
  // An explicit client pin wins, then a visible name containing Han characters.
  // Within the same name priority, keep the existing implementation ranking.
  return entries.slice().sort((a,b)=>Number(b.uuid===pin)-Number(a.uuid===pin)
    || Number(hasHanName(b))-Number(hasHanName(a))
    || Number(Boolean('srd' in a && a.srd))-Number(Boolean('srd' in b && b.srd))
    || Number(automated(b))-Number(automated(a))
    || publisher(a)-publisher(b)
    || a.uuid.localeCompare(b.uuid));
}

/**
 * @param {readonly SearchResultWrapper[]} matches
 * @param {BrowseCatalog} catalog
 * @param {{ preferences?: GroupingPreferences, accept?: (result: SearchResultWrapper) => boolean, query?: string }} [options]
 * @returns {{ groups: GroupedResultSet[], rawCount: number }}
 */
export function groupSearchResults(matches,catalog,{preferences=normalizeGrouping(),accept=()=>true,query=""}={}) {
  /** @type {BrowseCatalogEntry[]} */
  const seeds=[];
  /** @type {Set<string>} */
  const seen=new Set();
  /** @param {SearchResultWrapper} result */
  const add=result=>{const id=canonicalUuid(result.item);if(!seen.has(id)&&accept(result)){seen.add(id);seeds.push(catalog.entries.get(id)??{result,uuid:id,key:null,warning:null,rules:null,tags:[],names:[]});}};
  for(const result of matches)add(result);
  // Exact substring aliases supplement QI's name search without fuzzy name joins.
  const needle=normalName(query);
  if(needle)for(const entry of catalog.entries.values())if('names' in entry && entry.names.some(name=>normalName(name).includes(needle)))add(entry.result);
  // Showing copies changes presentation, not which family
  // aliases matched. Keep the same permitted, filter-matching member set.
  for(const entry of seeds)if(entry.key)for(const sibling of catalog.groups.get(entry.key)??[])add(sibling.result);
  /** @type {GroupedResultSet[]} */
  const output=[];
  /** @type {Set<string>} */
  const emitted=new Set();
  for(const entry of seeds) {
    const groupedKey=preferences.enabled&&entry.key?entry.key:null;
    const key=groupedKey??entry.uuid;
    if(emitted.has(key))continue;emitted.add(key);
    const eligible=groupedKey?(catalog.groups.get(groupedKey)??[entry]).filter(e=>accept(e.result)):[entry];
    const members=prioritizeMembers(eligible,key,preferences);
    const preferred=members[0];
    output.push({key,kind:members.length>1 && 'kind' in entry ? entry.kind ?? null : null,rules:'rules' in entry ? entry.rules ?? null : null,members,representative:preferred,
      warning:entry.warning,pinned:preferences.pins[key]===preferred.uuid});
  }
  return {groups:output,rawCount:new Set(output.flatMap(g=>g.members.map(e=>e.uuid))).size};
}
