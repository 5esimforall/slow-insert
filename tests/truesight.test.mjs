import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogService} from '../../fvtt-zh-aliases/modules/truesight/scripts/catalog/service.mjs';
import {connectCatalog} from '../../fvtt-zh-aliases/modules/truesight/scripts/catalog/api.mjs';
import {loadGrouping, itemGroups} from '../../fvtt-zh-aliases/modules/truesight/scripts/names/groups.mjs';
import {catalog, browseCatalog} from '../module/scripts/catalog-api.mjs';
import {groupSearchResults, normalizeGrouping} from '../module/scripts/grouping.mjs';
import {groupingFixture, spell} from './grouping-fixture.mjs';

test('both production consumers use the same public review, independent of search and preference state', async () => {
  const {rows,environment}=groupingFixture();
  const service=new CatalogService({index:()=>({status:'ready',results:rows}),environment:()=>environment,load:()=>null,save:async()=>{}});
  connectCatalog(service);
  await catalog.apply(catalog.preview({includeRisk:true}).id);
  const index=new Map([['fixture.spells',new Map(rows.map(({item})=>{
    const _id=item.uuid.split('.').at(-1);return [_id,{_id,name:item.name,type:'spell',system:item.system,originalName:item.originalName}];
  }))]]);
  const aliases=itemGroups(index,await loadGrouping());
  const browser=browseCatalog(rows);
  assert.equal(browser.revision,catalog.read().revision);
  for(const [key,members] of browser.groups) assert.deepEqual(members.map(e=>e.uuid).sort(),aliases.get(key).map(e=>e.source).sort());
  const before=[...aliases].map(([key,m])=>[key,m.map(e=>e.source)]);
  const key=browser.entries.get(rows[0].item.uuid).key;
  groupSearchResults(rows,browser,{query:'Example',preferences:normalizeGrouping({version:2,enabled:false,pins:{[key]:rows[1].item.uuid}}),accept:r=>r!==rows[0]});
  assert.deepEqual([...itemGroups(index,await loadGrouping())].map(([key,m])=>[key,m.map(e=>e.source)]),before);
  rows.push(spell('new'));
  assert.equal(browseCatalog(rows).entries.get(rows.at(-1).item.uuid).key,null);
  await catalog.undo();
  assert.equal(browseCatalog(rows).groups.size,0);
});

test('stale Quick Insert rows cannot resurrect permission-denied entries in browsing or filters', async () => {
  const {BrowseSession}=await import('../module/scripts/browse-session.mjs');
  const {normalizeFilters}=await import('../module/scripts/filters.mjs');
  const {normalizeSorting}=await import('../module/scripts/sorting.mjs');
  const {rows,environment}=groupingFixture();const permitted=rows.slice(1);
  connectCatalog(new CatalogService({index:()=>({status:'ready',results:permitted}),environment:()=>environment,load:()=>null,save:async()=>{}}));
  const index={identity:{},filterConfig:{},sourceEnvironment:()=>environment,search:(q,accept)=>rows.filter(accept)};
  const session=new BrowseSession(index);
  const result=session.search({query:'',filters:normalizeFilters(),sorting:normalizeSorting(),grouping:normalizeGrouping(),hideRevised:false});
  assert.ok(!session.catalog.dataCache.has(rows[0].item));
  assert.ok(!result.groups.flatMap(g=>g.members).some(e=>e.uuid===rows[0].item.uuid));
});
