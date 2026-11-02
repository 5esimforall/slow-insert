import { GROUPING_REGISTRY } from "../data/grouping-registry.mjs";
import { identifySource, prepareSourceEnvironment } from "./source-resolution.mjs";

// Small index fields only. No descriptions, activities, effects or full-document reads.
export const GROUP_INDEX_FIELDS = Object.freeze(["_stats.modifiedTime", "system.source.revision"]);
export const GROUP_ACTOR_INDEX_FIELDS = Object.freeze(["system.details.source"]);
const text = value => typeof value === "string" ? value.trim() : "";
const own = (value,key) => Object.hasOwn(value ?? {},key);
export function canonicalUuid(item) {
  const uuid = text(typeof item === "string" ? item : item?.uuid);
  const type = typeof item === "string" ? "Item" : item?.documentType;
  if (/^Compendium\.[^.]+\.[^.]+\.[^.]+$/.test(uuid) && ["Item","Actor"].includes(type)) {
    const parts=uuid.split("."); parts.splice(3,0,type); return parts.join(".");
  }
  return uuid;
}
export function normalizeGrouping(value) {
  const saved=value?.version===1?value:{};
  const pins=Object.fromEntries(Object.entries(saved.pins??{}).filter(([key,uuid])=>key.length<300&&typeof uuid==="string"&&uuid.length<500).slice(0,2000));
  const split=Array.isArray(saved.split)?[...new Set(saved.split.filter(key=>typeof key==="string"&&key.length<300))].slice(0,2000):[];
  return {version:1,enabled:saved.enabled!==false,pins,split};
}
export function editionEvidence(item, environment={}) {
  const source=identifySource(item,environment);
  return {rules:source.rules,conflict:source.status==="edition-conflict"};
}
export function isSrdSource(item, environment={}) {
  const packId=item.package || canonicalUuid(item).match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1];
  const pack=environment.packs?.get(packId);
  const pkg=pack?.metadata?.packageType==="system"?environment.system:environment.modules?.get(pack?.metadata?.packageName);
  const books=Object.keys(pkg?.flags?.dnd5e?.sourceBooks??{});
  const source=item.system?.source ?? item.system?.details?.source;
  // Identify the actual source, not all content shipped by a publisher. A
  // third-party SRD copy is still SRD; an SRD license flag alone is not a source.
  return [source,source?.book,source?.custom,pack?.metadata?.flags?.dnd5e?.sourceBook,
    books.length===1?books[0]:null,pack?.title,pack?.metadata?.label,item.packageName]
    .some(value=>/\bsrd(?:\b|\d)|\bsystem reference document\b/i.test(text(value)));
}
const normalName = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s()（）]/g,"");
function nameMatches(name, names) {
  const normalized=normalName(name);
  return names.some(a=>normalName(a)===normalized) || names.some(a=>names.some(b=>a!==b&&normalName(a+b)===normalized));
}
function currentMember(item,record,environment) {
  if(item.documentType!=="Item"||item.subType!==record.type)return "stale";
  const packId=item.package || canonicalUuid(item).match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1];
  const pack=environment.packs?.get(packId);
  const pkg=record.package===environment.system?.id?environment.system:environment.modules?.get(record.package);
  if(!pkg || pkg.version!==record.packageVersion)return "stale";
  const id=canonicalUuid(item).split(".").at(-1);
  const entry=pack?.index?.get(id);
  if(!entry || !own(entry._stats,"modifiedTime"))return "unverified";
  if(entry._stats.modifiedTime!==record.modifiedTime)return "stale";
  const system=item.system??{};
  if(!nameMatches(item.name,record.names)||system.identifier!==record.identifier||system.source?.rules!==record.rules)return "stale";
  if(record.type==="spell"&&(system.level!==record.level||system.school!==record.school))return "spell";
  return null;
}

/** Only records present in Quick Insert's permitted index can enter a group.
 * The audit registry is bounded, not a global name/identifier equivalence rule.
 * Package versions + modification stamps invalidate stale approvals; search never
 * loads full documents, runs migrations, mutates indexes or invents a new UUID.
 */
export function buildGroupingCatalog(results,environment={},registry=GROUPING_REGISTRY) {
  environment=prepareSourceEnvironment(environment);
  const entries=new Map(),groups=new Map();
  for(const result of results) {
    const item=result.item,uuid=canonicalUuid(item);
    if(entries.has(uuid))continue;
    const member=registry.members[uuid],edition=editionEvidence(item,environment);
    let warning=edition.conflict?"edition":identifySource(item,environment).status==="source-conflict"?"source":registry.review[uuid]??null;
    let key=null;
    if(member&&!warning) {
      warning=currentMember(item,member,environment);
      if(!warning&&registry.groups[member.group])key=member.group;
    }
    const entry={result,uuid,key,warning,rules:edition.rules,srd:isSrdSource(item,environment),tags:member?.tags??[],names:member&&!warning?member.names:[],
      kind:key?registry.groups[key].kind:null};
    entries.set(uuid,entry);
    if(key) {if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);}
  }
  return {entries,groups};
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
  // above SRD. Within non-SRD, audited automation markers outrank publisher
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
  // Showing copies or splitting a group changes presentation, not which family
  // aliases matched. Keep the same permitted, filter-matching member set.
  for(const entry of seeds)if(entry.key)for(const sibling of catalog.groups.get(entry.key)??[])add(sibling.result);
  const output=[],emitted=new Set(),split=new Set(preferences.split);
  for(const entry of seeds) {
    const grouped=preferences.enabled&&entry.key&&!split.has(entry.key);
    const key=grouped?entry.key:entry.uuid;
    if(emitted.has(key))continue;emitted.add(key);
    const eligible=grouped?(catalog.groups.get(entry.key)??[entry]).filter(e=>accept(e.result)):[entry];
    const members=prioritizeMembers(eligible,key,preferences,lang);
    const preferred=members[0];
    output.push({key,kind:members.length>1?entry.kind:null,rules:entry.rules,members,representative:preferred,
      warning:entry.warning,splitKey:entry.key,pinned:preferences.pins[key]===preferred.uuid});
  }
  return {groups:output,rawCount:new Set(output.flatMap(g=>g.members.map(e=>e.uuid))).size};
}
