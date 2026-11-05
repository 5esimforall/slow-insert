import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSorting, effectiveSort, sortGroups, sortValue, sortValueLabel, SORT_FIELDS, sortFieldLabel } from '../module/scripts/sorting.mjs';
import { language, dictionaries } from './localization.mjs';
const entry=(id,name,values={},extra={})=>({key:id,members:[],representative:{uuid:id,result:{item:{uuid:id,name,data:{values,...extra}}}}});
const profile=(keys,extra={})=>({mode:'manual',keys:keys.map(([field,direction='asc'])=>({field,direction})),nameOrder:'local',...extra});
const sort=(groups,p,extra={})=>sortGroups(groups,{profile:p,scheme:'spells',query:'',dataFor:i=>i.data,environment:language('en'),...extra});
const ids=rows=>rows.map(g=>g.key);
test('default auto profiles are independent and malformed input is sanitized',()=>{
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
 const rows=[entry('1','One',{}, {cr:1}),entry('u','A',{}, {cr:null}),entry('e','E',{}, {cr:.125}),entry('q','Q',{}, {cr:.25}),entry('z','Z',{}, {cr:0})];
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
test('English-only names follow Chinese and bilingual names before auto or manual sort rules',()=>{
 const rows=[entry('en2','Spell 2',{level:['2']}),entry('cn3','咒语三',{level:['3']}),entry('en0',"Melf’s Spell +1 (2024)",{level:['0']}),entry('mixed1','咒语一 Spell 1',{level:['1']})];
 for(const environment of [language('cn'),language('en')])for(const nameOrder of ['local','english']) {
  const extra={environment};
  assert.deepEqual(ids(sort(rows,{...normalizeSorting().profiles.spells,nameOrder},extra)),['mixed1','cn3','en0','en2']);
  assert.deepEqual(ids(sort(rows,{...normalizeSorting().profiles.spells,nameOrder},{...extra,query:'spell'})),['cn3','mixed1','en2','en0']);
  assert.deepEqual(ids(sort(rows,profile([['level','desc']],{nameOrder}),extra)),['cn3','mixed1','en2','en0']);
  for(const direction of ['asc','desc']) {
   const p=profile([['name',direction]],{nameOrder});
   assert.deepEqual(ids(sort(rows,p,extra)),[
    ...ids(sort([rows[1],rows[3]],p,extra)),...ids(sort([rows[0],rows[2]],p,extra))
   ]);
  }
 }
});
test('English-only classification uses actual letters, not missing names, digits, or other scripts',()=>{
 const rows=[entry('en','Élan’s Blade +2'),entry('missing',undefined),entry('empty','  '),entry('digits','123 +!?'),entry('cn','𠀀 Spell'),entry('jp','ブレード'),entry('mixed','Blade Клинок')];
 assert.deepEqual(ids(sort(rows,profile([['relevance']]),{query:'blade'})),['missing','empty','digits','cn','jp','mixed','en']);
});
test('name priority only inspects the displayed representative and preserves members and pins',()=>{
 const english=entry('en','Spell'),chinese=entry('cn','咒语');
 english.members=[english.representative,chinese.representative];english.pinned=true;
 english.representative.result.item.description='中文正文';
 english.representative.result.item.data.source={options:[{section:'books',title:'中文书名'}]};
 chinese.members=[english.representative,chinese.representative];
 const rows=[english,chinese],before=JSON.stringify(rows);
 const sorted=sort(rows,profile([['relevance']]),{query:'spell'});
 assert.deepEqual(ids(sorted),['cn','en']);
 assert.equal(sorted[0],chinese);assert.equal(sorted[1],english);
 assert.equal(JSON.stringify(rows),before);
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
