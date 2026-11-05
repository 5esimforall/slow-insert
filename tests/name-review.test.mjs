import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogService} from '../../truesight/module/scripts/catalog/service.mjs';
import {browseCatalog} from '../module/scripts/catalog-api.mjs';
import {groupSearchResults,normalizeGrouping} from '../module/scripts/grouping.mjs';
import {spell} from './grouping-fixture.mjs';

test('search consumes only applied name decisions and keeps filtering, preferred targets and copy view unchanged',async()=>{
 const rows=[spell('a',{name:'同名法术',originalName:'Example Spell'}),spell('b',{name:'同名法术 Example Spell',originalName:'Example Spell',system:{school:'evo'}}),
   spell('c',{name:'同名法术',originalName:'Example Spell',system:{source:{rules:'2024',book:'PHB 2024'}}})];
 const service=new CatalogService({index:()=>({results:rows}),environment:()=>({system:{id:'dnd5e'},packs:new Map(),modules:new Map()}),load:()=>null,save:async value=>value});
 const view=options=>groupSearchResults(rows,browseCatalog(rows,service.read()),options);
 const before=structuredClone(rows),left=rows[0].item.uuid,right=rows[1].item.uuid;
 assert.equal(service.readNameReview().count,1);assert.equal(view().groups.length,3);
 const preview=service.previewNameDecision({left,right,kind:'same',reason:'Reviewed identical rule text despite differing school metadata'});
 assert.equal(view().groups.length,3);await service.apply(preview.id);assert.equal(view().groups.length,2);
 const key=service.getMember(left).key,pinned=view({preferences:normalizeGrouping({version:2,pins:{[key]:right}})});
 assert.equal(pinned.groups.find(g=>g.key===key).representative.result,rows[1]);
 assert.equal(view({accept:result=>result!==rows[1]}).groups.find(g=>g.key===key).members.length,1);
 assert.equal(view({preferences:normalizeGrouping({version:2,enabled:false})}).groups.length,3);
 assert.deepEqual(rows,before);
 await service.apply(service.previewNameDecision({kind:'revoke',key}).id);assert.equal(view().groups.length,3);
 service.dispose();
});
