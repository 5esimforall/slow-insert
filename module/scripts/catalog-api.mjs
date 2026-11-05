import {apiVersion, catalog, sources, canonicalUuid} from '../../truesight/api-v1.mjs';
if (apiVersion !== 1 || catalog.apiVersion !== 1) throw new Error('Incompatible Truesight API');
export {catalog, sources, canonicalUuid};

// Join public metadata with original search objects only at the UI boundary.
export function browseCatalog(results, publicCatalog = catalog.read()) {
  if (!['ready', 'unreviewed'].includes(publicCatalog.status)) throw new Error(`Truesight: ${publicCatalog.status}`);
  const entries = new Map(), groups = new Map();
  for (const result of results) {
    const uuid = canonicalUuid(result.item), member = publicCatalog.entries.get(uuid);
    // A stale QI result must not resurrect a member rejected by the current
    // permission-filtered public catalog, even as an independent row.
    if (!member) continue;
    const entry = {...member, result};
    entries.set(uuid, entry);
    if (entry.key) {
      if (!groups.has(entry.key)) groups.set(entry.key, []);
      groups.get(entry.key).push(entry);
    }
  }
  return {...publicCatalog, entries, groups};
}
