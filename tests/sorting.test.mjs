import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSorting, effectiveSort, sortGroups, sortValue, sortValueLabel, SORT_FIELDS, sortFieldLabel } from '../module/scripts/sorting.mjs';
import { language, dictionaries } from './localization.mjs';
const entry=(id,name,values={},extra={})=>({key:id,members:[],representative:{uuid:id,result:{item:{uuid:id,name,data:{values,...extra}}}}});
const profile=(keys,extra={})=>({mode:'manual',keys:keys.map(([field,direction='asc'])=>({field,direction})),nameOrder:'local',...extra});
const sort=(groups,p,extra={})=>sortGroups(groups,{profile:p,scheme:'spells',query:'',dataFor:i=>i.data,environment:language('en'),...extra});
const ids=rows=>rows.map(g=>g.key);
test('default auto profiles are independent and old settings migrate safely',()=>{
 const a=normalizeSorting();assert.deepEqual(effectiveSort(a.profiles.spells,'spells',''),[{field:'level',direction:'asc'}]);
 for(const s of Object.keys(SORT_FIELDS))assert.equal(a.profiles[s].mode,'auto');
 a.profiles.items.keys[0].field='source';assert.equal(a.profiles.spells.keys[0].field,'level');
 assert.deepEqual(normalizeSorting(null),normalizeSorting({profiles:{spells:{keys:'bad'}}}));
});
test('normalization rejects invalid/duplicate keys, clamps three rules, and restricts relevance direction',()=>{
 const x=normalizeSorting({profiles:{spells:{mode:'manual',keys:[null,{field:'cr'},{field:'level',direction:'desc'},{field:'level'},{field:'relevance',direction:'desc'},{field:'name'},{field:'source'}]}}});
 assert.deepEqual(x.profiles.spells.keys,[{field:'level',direction:'desc'},{field:'relevance',direction:'asc'},{field:'name',direction:'asc'}]);
});
test('auto switches with query but manual never silently changes',()=>{
 const p=normalizeSorting().profiles.spells;assert.equal(effectiveSort(p,'spells','fire')[0].field,'relevance');
 assert.equal(effectiveSort(p,'spells','  ')[0].field,'level');
 const manual=profile([['level','desc']]);assert.deepEqual(effectiveSort(manual,'spells','fire'),manual.keys);
});
test('ascending and descending leave unknown values last; cantrip zero is known',()=>{
 const rows=[entry('u','A',{level:['unknown']}),entry('3','B',{level:['3']}),entry('0','C',{level:['0']})];
 assert.deepEqual(ids(sort(rows,profile([['level']]))),['0','3','u']);
 assert.deepEqual(ids(sort(rows,profile([['level','desc']]))),['3','0','u']);
});
test('CR fractions sort numerically; missing values stay last in both directions',()=>{
 const rows=[entry('1','1',{}, {cr:1}),entry('u','A',{}, {cr:null}),entry('e','E',{}, {cr:.125}),entry('q','Q',{}, {cr:.25}),entry('z','Z',{}, {cr:0})];
 assert.deepEqual(ids(sort(rows,profile([['cr']]))),['z','e','q','1','u']);
 assert.deepEqual(ids(sort(rows,profile([['cr','desc']]))),['1','q','e','z','u']);
});
test('rarity and size use rules order, not alphabet; varies is unknown for ordering',()=>{
 const rows=['artifact','rare','common','legendary','varies'].map(v=>entry(v,v,{rarity:[v]}));
 assert.deepEqual(ids(sort(rows,profile([['rarity']]))),['common','rare','legendary','artifact','varies']);
 const sizes=['grg','sm','tiny','lg','med','huge'].map(v=>entry(v,v,{size:[v]}));
 assert.deepEqual(ids(sort(sizes,profile([['size']]))),['tiny','sm','med','lg','huge','grg']);
});
test('three rules resolve ties in precedence order, then name, then stable UUID',()=>{
 const rows=[entry('b','Same',{level:['1'],school:['evo']}),entry('a','Same',{level:['1'],school:['evo']}),entry('c','Zulu',{level:['1'],school:['abj']}),entry('d','Alpha',{level:['2'],school:['abj']})];
 assert.deepEqual(ids(sort(rows,profile([['level'],['school'],['name','desc']]))),['c','a','b','d']);
 assert.deepEqual(ids(sort([...rows].reverse(),profile([['level'],['school'],['name','desc']]))),['c','a','b','d']);
});
test('relevance preserves upstream grouped rank, including alias-only matches; blank queries ignore it',()=>{
 const rows=[entry('z','Zulu'),entry('a','Alpha'),entry('b','Beta')];
 assert.deepEqual(ids(sort(rows,profile([['relevance']]),{query:'test'})),['z','a','b']);
 assert.deepEqual(ids(sort(rows,profile([['relevance']]))),['a','b','z']);
});
test('numeric name ordering and optional English titles do not fabricate translations',()=>{
 const rows=[entry('a','咒语 10 Spell 10'),entry('b','咒语 2 Spell 2')];
 assert.deepEqual(ids(sort(rows,profile([['name']],{nameOrder:'english'}))),['b','a']);
 const mixed=[entry('a','阿尔法 Zulu'),entry('b','泽塔 Alpha')];
 assert.deepEqual(ids(sort(mixed,profile([['name']],{nameOrder:'english'}))),['b','a']);
 assert.deepEqual(ids(sort(mixed,profile([['name']]),{environment:language('cn')})),['a','b']);
 assert.equal(sort([entry('x','仅有中文')],profile([['name']],{nameOrder:'english'})).length,1);
});
test('book sorting uses canonical book title; uncertain sources are last, not provider names',()=>{
 const rows=[entry('u','A',{}, {source:{options:[{section:'review',title:'A'}]}}),entry('z','Z',{}, {source:{options:[{section:'books',title:'Z book'}]}}),entry('b','B',{}, {source:{options:[{section:'books',title:'B book'}]}})];
 assert.deepEqual(ids(sort(rows,profile([['source']]))),['b','z','u']);
 assert.deepEqual(ids(sort(rows,profile([['source','desc']]))),['z','b','u']);
});
test('sort uses representative only and never mutates members or pins',()=>{
 const a=entry('a','A',{level:['3']}),b=entry('b','B',{level:['1']});a.members=[b.representative,a.representative];a.pinned=true;
 const before=JSON.stringify([a,b]);assert.deepEqual(ids(sort([a,b],profile([['level']]))),['b','a']);assert.equal(JSON.stringify([a,b]),before);
});
test('whole candidate set sorts before slicing/scroll batches, with no duplicates',()=>{
 const rows=Array.from({length:250},(_,i)=>entry(String(i),`Item ${250-i}`,{level:[String(i%10)]}));
 const sorted=sort(rows,profile([['name']]));assert.equal(sorted[0].representative.result.item.name,'Item 1');
 assert.equal(sorted[100].representative.result.item.name,'Item 101');assert.equal(new Set([...sorted.slice(0,100),...sorted.slice(100)].map(g=>g.key)).size,250);
});
test('sort labels and values are localized and match visible rule metadata',()=>{
 for(const env of [language('en'),language('cn')])for(const f of new Set(['relevance',...Object.values(SORT_FIELDS).flat()]))assert.ok(!sortFieldLabel(f,env).startsWith('SLOWINSERT.'));
 assert.equal(sortValueLabel('level',{}, {values:{level:['0']}},language('cn')),'零环／戏法');
 assert.equal(sortValueLabel('level',{}, {values:{level:['3']}},language('cn')),'3环');
 assert.equal(sortValueLabel('cr',{}, {cr:.125},language('en')),'CR 1/8');
 assert.match(sortValueLabel('rarity',{}, {values:{rarity:['legendary']}},language('en')),/Legendary/);
});
test('English-title sorting handles prefix and suffix bilingual names',()=>{
 const rows=[entry('a','Zulu（阿尔法）'),entry('b','泽塔 Alpha')];
 assert.deepEqual(ids(sort(rows,profile([['name']],{nameOrder:'english'}))),['b','a']);
});
test('variable rarity remains labeled accurately even though it sorts with non-numeric values',()=>{
 assert.equal(sortValue('rarity',{}, {values:{rarity:['varies']}},language('en')),null);
 assert.equal(sortValueLabel('rarity',{}, {values:{rarity:['varies']}},language('en')),dictionaries.en['SLOWINSERT.Option.rarity.varies']);
});
