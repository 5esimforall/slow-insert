import {canonicalUuid} from "./catalog-api.mjs";
const text = value => typeof value === "string" ? value.trim() : "";
const normalName = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s()（）]/g, "");
export function normalizeGrouping(value) {
  const saved=value?.version===2?value:{};
  const pins=Object.fromEntries(Object.entries(saved.pins??{}).filter(([key,uuid])=>key.length<500&&typeof uuid==="string"&&uuid.length<500).slice(0,5000));
  const hidden=[...new Set((Array.isArray(saved.hidden)?saved.hidden:[]).filter(id=>typeof id==="string"&&id.length<500))];
  return {version:2,enabled:saved.enabled!==false,pins,hidden};
}

// Reapplying a review can merge or split groups; reconcile current pins by membership.
export function reconcilePins(pins, entries) {
  const next = {}, conflicts = new Set();
  for (const uuid of new Set(Object.values(pins))) {
    const key = entries.get(uuid)?.key;
    if (!key || conflicts.has(key)) continue;
    if (next[key] && next[key] !== uuid) { delete next[key]; conflicts.add(key); }
    else next[key] = uuid;
  }
  return next;
}
function prioritizeMembers(entries,key,preferences,lang) {
  const pin=preferences.pins[key];
  const chinese=/^(cn|zh)/i.test(lang??"");
  const automated=entry=>!entry.srd && entry.tags?.includes("automation")===true;
  const publisher=entry=>{
    const pack=entry.result.item.package || entry.uuid.match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1] || "";
    return /^(dnd-players-handbook|dnd-monster-manual|dnd-dungeon-masters-guide)\./.test(pack)?0:pack.startsWith("dnd5e.")?1:2;
  };
  // An explicit client pin wins; otherwise every non-SRD implementation ranks
  // above SRD. Within non-SRD, indexed automation markers outrank publisher
  // and language. Dependency tags alone do not imply automation.
  return entries.slice().sort((a,b)=>Number(b.uuid===pin)-Number(a.uuid===pin)
    || Number(Boolean(a.srd))-Number(Boolean(b.srd))
    || Number(automated(b))-Number(automated(a))
    || publisher(a)-publisher(b)
    || (chinese?Number(!/[\u3400-\u9fff]/.test(a.result.item.name))-Number(!/[\u3400-\u9fff]/.test(b.result.item.name)):0)
    || a.uuid.localeCompare(b.uuid));
}
export function groupSearchResults(matches,catalog,{preferences=normalizeGrouping(),accept=()=>true,query="",lang="en"}={}) {
  const seeds=[],seen=new Set();
  const add=result=>{const id=canonicalUuid(result.item);if(!seen.has(id)&&accept(result)){seen.add(id);seeds.push(catalog.entries.get(id)??{result,uuid:id,key:null,warning:null,rules:null,tags:[],names:[]});}};
  for(const result of matches)add(result);
  // Exact substring aliases supplement QI's name search without fuzzy name joins.
  const needle=normalName(query);
  if(needle)for(const entry of catalog.entries.values())if(entry.names.some(name=>normalName(name).includes(needle)))add(entry.result);
  // Showing copies changes presentation, not which family
  // aliases matched. Keep the same permitted, filter-matching member set.
  for(const entry of seeds)if(entry.key)for(const sibling of catalog.groups.get(entry.key)??[])add(sibling.result);
  const output=[],emitted=new Set();
  for(const entry of seeds) {
    const grouped=preferences.enabled&&entry.key;
    const key=grouped?entry.key:entry.uuid;
    if(emitted.has(key))continue;emitted.add(key);
    const eligible=grouped?(catalog.groups.get(entry.key)??[entry]).filter(e=>accept(e.result)):[entry];
    const members=prioritizeMembers(eligible,key,preferences,lang);
    const preferred=members[0];
    output.push({key,kind:members.length>1?entry.kind:null,rules:entry.rules,members,representative:preferred,
      warning:entry.warning,pinned:preferences.pins[key]===preferred.uuid});
  }
  return {groups:output,rawCount:new Set(output.flatMap(g=>g.members.map(e=>e.uuid))).size};
}
