import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowseSession } from '../module/scripts/browse-session.mjs';
import { calculateGrouping, buildGroupingCatalog } from '../../fvtt-zh-aliases/modules/truesight/scripts/catalog/identity.mjs';
import {normalizeGrouping} from '../module/scripts/grouping.mjs';
import { normalizeFilters, setGroup, setScheme } from '../module/scripts/filters.mjs';
import { normalizeSorting } from '../module/scripts/sorting.mjs';
import { spell, groupingFixture } from './grouping-fixture.mjs';

function fixture(rows = groupingFixture().rows) {
  const calls = [], catalogs = [];
  const index = {
    identity: {}, rows, filterConfig: {},
    sourceEnvironment: publicationProviders => ({ publicationProviders, lang: 'en' }),
    search(query, accept) {
      calls.push(query);
      return this.rows.filter(row => row.item.name.toLowerCase().includes(query.toLowerCase())).filter(accept);
    }
  };
  const options = { query: '', filters: setScheme(normalizeFilters(), 'spells'), sorting: normalizeSorting(),
    grouping: normalizeGrouping(), snapshot: calculateGrouping(rows, {}, normalizeGrouping(), { includeRisk: true }), hideRevised: false };
  const session = new BrowseSession(index, {onCatalog: catalog => catalogs.push(catalog),
    groupingCatalog: current => buildGroupingCatalog(current, {}, options.snapshot)});
  return { session, index, calls, catalogs, options };
}

test('session filters members before representative selection and keeps the original payload', () => {
  const f = fixture();
  const preferred = f.index.rows[0].item;
  const key = f.options.snapshot.records[preferred.uuid].key;
  f.options.grouping.pins[key] = preferred.uuid;
  // Obtain the stable key from the same source catalog used by controls.
  const catalog = f.session.ensureCatalog({ hideRevised: false, snapshot: f.options.snapshot, preferences: f.options.grouping });
  const sourceKey = catalog.dataCache.get(f.index.rows[1].item).values.source[0];
  f.options.filters = setGroup(f.options.filters, 'source', [sourceKey]);
  const page = f.session.search(f.options);
  assert.equal(page.groups.length, 1);
  assert.equal(page.rawCount, 1);
  assert.equal(page.groups[0].representative.result.item, f.index.rows[1].item);
  assert.notEqual(page.groups[0].representative.uuid, preferred.uuid);
  assert.deepEqual(page.groups[0].members.map(e => e.uuid), [f.index.rows[1].item.uuid]);
});

test('session uses the entire permitted index for grouping but applies rule visibility to results and options', () => {
  const f = fixture();
  f.options.hideRevised = true;
  let page = f.session.search(f.options);
  assert.ok(page.groups.every(group => group.rules !== '2024'));
  assert.equal(f.session.catalog.grouping.entries.size, 6);
  assert.equal(f.session.catalog.grouping.changed, 0);
  assert.equal(f.session.catalog.dataCache.has(f.index.rows[2].item), false);
  const removedUuid = f.index.rows[1].item.uuid;
  f.index.rows = f.index.rows.filter(row => row.item.uuid !== removedUuid);
  f.session.invalidate();
  page = f.session.search(f.options);
  assert.ok(page.groups.flatMap(g => g.members).every(e => e.uuid !== removedUuid));
});

test('session invalidation rebuilds metadata without silently recalculating applied membership', () => {
  const f = fixture();
  f.session.search(f.options);
  const first = f.session.catalog;
  f.session.search({ ...f.options, query: 'Example' });
  assert.equal(f.session.catalog, first);
  assert.equal(f.catalogs.length, 1);
  const added = spell('added');
  f.index.rows = [...f.index.rows, added];
  f.index.identity = {};
  let page = f.session.search(f.options);
  assert.equal(f.catalogs.length, 2);
  assert.equal(f.session.catalog.grouping.entries.get(added.item.uuid).key, null);
  assert.ok(page.groups.some(group => group.key === added.item.uuid));
  f.session.invalidate();
  page = f.session.search(f.options);
  assert.equal(f.catalogs.length, 3);
  assert.equal(page.rawCount, 7);
});

test('session sorts the complete result set before batching and preserves or resets page size explicitly', () => {
  const rows = Array.from({ length: 245 }, (_, n) => spell(String(n), { name: `Spell ${244 - n}`,
    system: { identifier: `spell-${n}`, level: n % 10 } }));
  const f = fixture(rows);
  f.options.sorting.profiles.spells = { mode: 'manual', keys: [{ field: 'level', direction: 'desc' }], nameOrder: 'local' };
  let page = f.session.search(f.options);
  assert.equal(page.groups.length, 245);
  assert.equal(page.shown, 100);
  assert.equal(page.groups[0].representative.result.item.system.level, 9);
  assert.equal(page.groups.at(-1).representative.result.item.system.level, 0);
  assert.equal(f.session.nextPage({ visible: true, query: '', scheme: 'spells' }).groups.length, 100);
  page = f.session.search({ ...f.options, preservePage: true });
  assert.equal(page.shown, 200);
  page = f.session.search(f.options);
  assert.equal(page.shown, 100);
  f.session.clear();
  assert.equal(f.session.page, null);
  assert.ok(f.session.catalog);
});

test('alias completion and all-copies presentation keep the same eligible members without document reads', () => {
  const f = fixture();
  for (const { item } of f.index.rows) item.show = () => assert.fail('search must not open a document');
  f.options.query = '例示';
  const grouped = f.session.search(f.options);
  assert.equal(grouped.groups.length, 1);
  const members = grouped.groups[0].members.map(e => e.uuid).sort();
  const copies = f.session.search({ ...f.options, grouping: { ...f.options.grouping, enabled: false } });
  assert.equal(copies.groups.length, 2);
  assert.deepEqual(copies.groups.map(g => g.representative.uuid).sort(), members);
  const empty = f.session.search({ ...f.options, filters: setGroup(f.options.filters, 'level', []) });
  assert.equal(empty.groups.length, 0);
  assert.equal(empty.shown, 0);
  assert.equal(empty.rawCount, 0);
});
