import { t, currentLocale } from './i18n.mjs';
import { GROUPS, crLabel, itemTypeLabel } from './filters.mjs';

export const SORT_FIELDS = Object.freeze({
  items: ['name', 'type', 'source'],
  spells: ['name', 'level', 'school', 'source'],
  magic: ['name', 'rarity', 'category', 'source'],
  monsters: ['name', 'cr', 'size', 'creatureType', 'source']
});
export const DEFAULT_SORT = Object.freeze({ items:'name', spells:'level', magic:'rarity', monsters:'cr' });
const ORDER = { rarity:['common','uncommon','rare','veryRare','legendary','artifact'], size:['tiny','sm','med','lg','huge','grg'] };
export function normalizeSorting(value) {
  return { version:1, profiles:Object.fromEntries(Object.keys(SORT_FIELDS).map(scheme => {
    const raw = value?.profiles?.[scheme] ?? {};
    const used = new Set();
    const keys = (Array.isArray(raw.keys) ? raw.keys : []).filter(k => {
      if (!k || !['relevance', ...SORT_FIELDS[scheme]].includes(k.field) || used.has(k.field)) return false;
      used.add(k.field); return true;
    }).slice(0,3).map(k => ({field:k.field, direction:k.field==='relevance' ? 'asc' : k.direction==='desc'?'desc':'asc'}));
    return [scheme, { mode:raw.mode==='manual' && keys.length?'manual':'auto', keys:keys.length?keys:[{field:DEFAULT_SORT[scheme],direction:'asc'}], nameOrder:raw.nameOrder==='english'?'english':'local' }];
  })) };
}
export function effectiveSort(profile, scheme, query) {
  return profile.mode==='auto' ? [{field:query.trim()?'relevance':DEFAULT_SORT[scheme],direction:'asc'}] : profile.keys;
}
export function sortFieldLabel(field, environment={}) {
  return t(['name','relevance','source'].includes(field)?`Sort.${field}`:`Group.${field}`,{},environment);
}
export function sortValue(field, item, data, environment={}) {
  if (field==='name') return item.name?.trim() || null;
  if (field==='source') {
    const books = data?.source?.options?.filter(o=>o.section==='books');
    return books?.length ? books.map(o=>o.title).sort().join(' / ') : null;
  }
  if (field==='cr') return data?.cr ?? null;
  const raw = data?.values?.[field]?.[0];
  if (!raw || raw==='unknown') return null;
  if (field==='level') return Number.isFinite(Number(raw))?Number(raw):null;
  if (ORDER[field]) { const rank=ORDER[field].indexOf(raw); return rank<0?null:rank; }
  if (field==='type') return itemTypeLabel(raw,environment.typeLabels,environment);
  const option=GROUPS[field]?.options?.find(o=>o.value===raw);
  return option ? t(option.label,option.data,environment) : raw;
}
function nameKey(name, english) {
  if (!english || !/[\u3400-\u9fff]/u.test(name)) return name;
  // Only use a visible Latin title; do not invent translations for Chinese-only names.
  return name.match(/[A-Za-z][A-Za-z0-9\s'’:,/()\-]*/gu)?.map(s=>s.trim()).sort((a,b)=>b.length-a.length)[0] || name;
}
function isEnglishOnlyName(name) {
  // Classify visible letters only; digits and punctuation do not imply a language.
  const letters = name.match(/\p{Letter}/gu) ?? [];
  return letters.length > 0 && letters.every(letter => /\p{Script=Latin}/u.test(letter));
}
export function sortGroups(groups, {profile,scheme,query='',dataFor,environment={}}) {
  const keys=effectiveSort(profile,scheme,query);
  const locale=profile.nameOrder==='english'?'en':currentLocale(environment);
  const collator=new Intl.Collator(locale,{numeric:true,sensitivity:'base'});
  const rows=groups.map((group,rank)=> {
    const item=group.representative.result.item, data=dataFor(item);
    const name=nameKey(item.name||'',profile.nameOrder==='english');
    const englishOnly=isEnglishOnlyName(item.name||'');
    return {group,rank,name,englishOnly,values:keys.map(k=>k.field==='relevance'?(query.trim()?rank:null):k.field==='name'?(name||null):sortValue(k.field,item,data,environment))};
  });
  rows.sort((a,b)=> {
    if(a.englishOnly!==b.englishOnly)return Number(a.englishOnly)-Number(b.englishOnly);
    for(let i=0;i<keys.length;i++) {
      const av=a.values[i],bv=b.values[i];
      if(av===null && bv===null)continue;
      if(av===null)return 1; if(bv===null)return -1; // Unknown always last, including descending.
      const c=typeof av==='number'&&typeof bv==='number'?av-bv:collator.compare(String(av),String(bv));
      if(c)return keys[i].direction==='desc'?-c:c;
    }
    return collator.compare(a.name,b.name) || String(a.group.key).localeCompare(String(b.group.key),'en');
  });
  return rows.map(r=>r.group);
}
export function sortValueLabel(field,item,data,environment={}) {
  if (['name','relevance','source'].includes(field)) return '';
  const value=sortValue(field,item,data,environment);
  if(field==='rarity' && data?.values?.rarity?.[0]==='varies')return t('Option.rarity.varies',{},environment);
  if(value===null)return `${sortFieldLabel(field,environment)}: ${t('Unknown',{},environment)}`;
  if(field==='level')return value===0?t('Cantrip',{},environment):t('Level',{level:value},environment);
  if(field==='cr')return `CR ${crLabel(value)}`;
  if(ORDER[field])return t(`Option.${field}.${data.values[field][0]}`,{},environment);
  return String(value);
}
