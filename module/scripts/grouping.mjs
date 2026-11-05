import { identifySource, prepareSourceEnvironment } from "./source-resolution.mjs";

// Metadata only: never load documents, descriptions, activities or effects.
export const GROUP_INDEX_FIELDS = Object.freeze(["originalName", "flags.babele.originalName", "flags.chris-premades.info.identifier", "flags.gambits-premades.gpsUuid"]);
export const GROUP_ACTOR_INDEX_FIELDS = Object.freeze(["system.details.source"]);
export const GROUP_RULE_VERSION = 1;
const text = value => typeof value === "string" ? value.trim() : "";
const normalName = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s()（）]/g, "");
const english = value => /^[A-Za-z][A-Za-z0-9\s'’:,()&.!+/-]*$/.test(text(value));
const nameKey = value => text(value).normalize("NFKC").toLowerCase().replace(/’/g,"'").replace(/\s+/g," ");
const slug = value => nameKey(value).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const identifier = value => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(text(value)) && !["none","unknown","undefined","null","spell","item"].includes(value) ? value : null;
export function canonicalUuid(item) {
  const uuid = text(typeof item === "string" ? item : item?.uuid);
  const type = typeof item === "string" ? "Item" : item?.documentType;
  if (/^Compendium\.[^.]+\.[^.]+\.[^.]+$/.test(uuid) && ["Item","Actor"].includes(type)) {
    const parts=uuid.split("."); parts.splice(3,0,type); return parts.join(".");
  }
  return uuid;
}
export function normalizeGrouping(value) {
  const saved=[1,2].includes(value?.version)?value:{};
  const pins=Object.fromEntries(Object.entries(saved.pins??{}).filter(([key,uuid])=>key.length<500&&typeof uuid==="string"&&uuid.length<500).slice(0,5000));
  const excluded=[...new Set((Array.isArray(saved.excluded)?saved.excluded:[]).filter(id=>typeof id==="string"&&id.length<500))];
  return {version:2,enabled:saved.enabled!==false,pins,excluded};
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
  return [source,source?.book,source?.custom,pack?.metadata?.flags?.dnd5e?.sourceBook,
    books.length===1?books[0]:null,pack?.title,pack?.metadata?.label,item.packageName]
    .some(value=>/\bsrd(?:\b|\d)|\bsystem reference document\b/i.test(text(value)));
}
function indexEntry(item, environment) {
  const packId=item.package || canonicalUuid(item).match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1];
  return environment.packs?.get(packId)?.index?.get(canonicalUuid(item).split(".").at(-1)) ?? item;
}
function originalName(item, entry) {
  const original=[entry.originalName,entry.flags?.babele?.originalName,item.originalName,item.flags?.babele?.originalName].find(english);
  if(original)return text(original);
  // For untranslated or natively bilingual packs without originalName, require
  // the COMPLETE English segment to reproduce the COMPLETE stored identifier.
  // A bilingual prefix may contain only Han text/separators, never skipped
  // English qualifiers. This is corroboration, not arbitrary tail stripping.
  const name=text(item.name);
  const bilingual=name.match(/^[\p{Script=Han}\s·，、：:（）()《》“”「」『』—-]+\s+([A-Za-z][A-Za-z0-9\s'’:,()&.!+/-]*)$/u);
  const candidate=english(name)?name:bilingual?.[1];
  return candidate&&slug(candidate)===item.system?.identifier?text(candidate):"";
}
function describe(result, environment) {
  const item=result.item,uuid=canonicalUuid(item),source=identifySource(item,environment),system=item.system??{},indexed=indexEntry(item,environment);
  const id=identifier(system.identifier),name=originalName(item,indexed);
  const suffix=name.match(/^(.+?)\s+\(([^()]+)\)$/);
  let base=nameKey(name),suffixBook=null;
  if(suffix) {
    const candidates=environment.sourceCatalog.lookup(suffix[2]);
    const references=source.references.filter(ref=>ref.record).map(ref=>ref.record.id);
    const matched=candidates.filter(book=>references.includes(book.id));
    if(matched.length===1){base=nameKey(suffix[1]);suffixBook=matched[0].id;}
  }
  const spell=item.documentType==="Item"&&item.subType==="spell";
  const warning=source.status==="edition-conflict"?"edition":source.status==="source-conflict"?"source":
    !spell?null:!source.rules?"rules":!id?"identifier":
    !Number.isInteger(system.level)||system.level<0||system.level>9||!["abj","con","div","enc","evo","ill","nec","trs"].includes(system.school)?"spell":null;
  const fingerprint=JSON.stringify([item.documentType,item.subType,id,source.rules,system.level??null,system.school??null,
    source.status==="edition-conflict"||source.status==="source-conflict"?source.status:null]);
  const nameFingerprint=JSON.stringify([base,suffixBook]);
  const automated=Boolean(indexed.flags?.["chris-premades"]?.info?.identifier || indexed.flags?.["gambits-premades"]?.gpsUuid);
  return {result,uuid,spell,id,rules:source.rules,level:system.level,school:system.school,warning,fingerprint,nameFingerprint,
    base,suffixBook,names:[item.name,name].filter(Boolean),tags:automated?["automation"]:[],srd:isSrdSource(item,environment),key:null,risk:null,kind:null};
}
export function describeGroupingIndex(results, environment={}) {
  environment=prepareSourceEnvironment(environment);
  return new Map(results.map(result=>{const entry=describe(result,environment);return [entry.uuid,entry];}));
}
function addTo(map,key,value) {if(!map.has(key))map.set(key,[]);map.get(key).push(value);}

/** Explicit computation, never invoked by ordinary search/index refresh. */
export function calculateGrouping(results,environment={},preferences=normalizeGrouping(),{includeRisk=false}={}) {
  const entries=describeGroupingIndex(results,environment),buckets=new Map(),excluded=new Set(preferences.excluded??[]);
  for(const entry of entries.values()) if(entry.spell&&!entry.warning&&!excluded.has(entry.uuid))addTo(buckets,`spell:${entry.rules}:${entry.id}`,entry);
  const candidates=new Map(),names=new Map();
  for(const [key,members] of buckets) {
    if(new Set(members.map(e=>`${e.level}:${e.school}`)).size!==1){for(const e of members)e.warning="spell";continue;}
    const candidate={key,members,risk:null,reason:"identifier"};candidates.set(key,candidate);
    for(const base of new Set(members.map(e=>e.base).filter(Boolean)))addTo(names,`${members[0].rules}:${base}`,candidate);
  }
  if(includeRisk) for(const related of names.values()) {
    const clusters=[...new Set(related)].filter(c=>candidates.has(c.key));
    if(clusters.length<2)continue;
    const members=clusters.flatMap(c=>c.members);
    // No transitive name chains or ambiguous roots. Every member must have
    // the same corroborated full base name when available; at least one suffix
    // and exactly one unsuffixed identifier family are required. Missing names
    // in that root family inherit only its already validated identifier link.
    if(new Set(members.map(e=>e.base).filter(Boolean)).size!==1||new Set(members.map(e=>`${e.level}:${e.school}`)).size!==1)continue;
    const roots=clusters.filter(c=>c.members.some(e=>e.base&&!e.suffixBook));
    if(roots.length!==1||!members.some(e=>e.suffixBook))continue;
    if(clusters.filter(c=>c!==roots[0]).some(c=>c.members.some(e=>!e.suffixBook)))continue;
    const root=roots[0];
    for(const c of clusters)if(c!==root)candidates.delete(c.key);
    root.members=members;root.risk="implementation";root.reason="source-suffix";
  }
  const groups=Object.create(null),records=Object.create(null);
  for(const candidate of candidates.values())if(candidate.members.length>1) {
    groups[candidate.key]={kind:"spell",risk:candidate.risk,reason:candidate.reason,members:candidate.members.map(e=>e.uuid).sort()};
    for(const e of candidate.members){e.key=candidate.key;e.risk=candidate.risk;}
  }
  for(const e of entries.values())if(e.spell)records[e.uuid]={fingerprint:e.fingerprint,nameFingerprint:e.risk?e.nameFingerprint:null,key:e.key,warning:excluded.has(e.uuid)?"excluded":e.warning};
  return {version:1,ruleVersion:GROUP_RULE_VERSION,createdAt:Date.now(),includeRisk,records,groups};
}

/** Applied membership only. New/changed/unauthorized records never acquire a
 * family during refresh; names and package versions are not identities. */
export function buildGroupingCatalog(results,environment={},snapshot=null,preferences=normalizeGrouping()) {
  const entries=describeGroupingIndex(results,environment),groups=new Map(),excluded=new Set(preferences.excluded??[]);
  let changed=0;
  for(const entry of entries.values()) {
    const previous=snapshot?.records?.[entry.uuid];
    const current=previous&&previous.fingerprint===entry.fingerprint&&(!previous.nameFingerprint||previous.nameFingerprint===entry.nameFingerprint);
    if(entry.spell&&(!current||snapshot?.ruleVersion!==GROUP_RULE_VERSION||(previous?.warning==="excluded")!==excluded.has(entry.uuid)))changed++;
    if(previous&&!current)entry.warning=entry.warning||"identity";
    if(excluded.has(entry.uuid))entry.warning="excluded";
    const group=previous?.key&&snapshot?.groups?.[previous.key];
    if(snapshot?.ruleVersion===GROUP_RULE_VERSION&&current&&!entry.warning&&!excluded.has(entry.uuid)&&group?.members.includes(entry.uuid)) {
      entry.key=previous.key;entry.risk=group.risk;entry.kind=group.kind;addTo(groups,entry.key,entry);
    } else if(previous?.warning&&previous.warning!=="excluded"&&!entry.warning)entry.warning=previous.warning;
  }
  for(const uuid of Object.keys(snapshot?.records??{}))if(!entries.has(uuid))changed++;
  return {entries,groups,changed};
}

export function groupingDiff(previous,next,preferences=normalizeGrouping()) {
  const old=previous?.groups??{},groups=next.groups;
  const membership=snapshot=>new Map(Object.entries(snapshot).flatMap(([key,g])=>g.members.map(id=>[id,key])));
  const before=membership(old),after=membership(groups);
  let added=0,merged=0,split=0;
  for(const g of Object.values(groups)) {
    const parents=new Set(g.members.map(id=>before.get(id)).filter(Boolean));
    if(!parents.size)added++;
    if(parents.size>1)merged++;
  }
  for(const g of Object.values(old))if(new Set(g.members.map(id=>after.get(id)??id)).size>1)split++;
  const retained=new Set(Object.values(migratePins(preferences.pins,next)));
  const lostPins=Object.values(preferences.pins??{}).filter(id=>!retained.has(id));
  return {added,merged,split,groups:Object.keys(groups).length,joined:after.size,
    independent:Object.values(next.records).filter(r=>!r.key).length,risky:Object.values(groups).filter(g=>g.risk).length,lostPins};
}
export function migratePins(pins,snapshot) {
  const result=Object.create(null),conflicts=new Set();
  for(const uuid of Object.values(pins??{})) {
    const key=snapshot.records[uuid]?.key;
    if(!key||conflicts.has(key))continue;
    if(result[key]&&result[key]!==uuid){delete result[key];conflicts.add(key);}else result[key]=uuid;
  }
  return result;
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
