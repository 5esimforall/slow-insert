import test from 'node:test';
import assert from 'node:assert/strict';
import { FilterControls, normalizeFilterExpansion } from '../module/scripts/filter-controls.mjs';

test('disclosures restore explicit false independently for every scheme',()=>{
 const saved={spells:{level:false,source:true,school:'invalid',unknown:true},magic:{source:false}};
 const result=normalizeFilterExpansion(saved);
 assert.equal(result.spells.level,false);assert.equal(result.spells.source,true);
 assert.equal(result.magic.source,false);assert.equal(result.spells.school,undefined);assert.equal(result.spells.unknown,undefined);
 result.spells.level=true;assert.equal(saved.spells.level,false);
});
test('disclosure saves are isolated snapshots and do not touch filter or sorting state',()=>{
 const writes=[];
 const controls=Object.assign(Object.create(FilterControls.prototype),{expansion:normalizeFilterExpansion(),onExpansionChange:state=>writes.push(state)});
 controls.rememberExpansion('spells','level',false);
 controls.rememberExpansion('spells','level',false);
 assert.equal(writes.length,1);
 controls.rememberExpansion('spells','source',true);
 controls.rememberExpansion('magic','source',false);
 assert.equal(writes[0].spells.source,undefined);
 assert.equal(writes[2].spells.level,false);assert.equal(writes[2].magic.source,false);
 assert.deepEqual(normalizeFilterExpansion(writes[2]),controls.expansion);
 controls.rememberExpansion('bad','source',true);assert.equal(writes.length,3);
});
