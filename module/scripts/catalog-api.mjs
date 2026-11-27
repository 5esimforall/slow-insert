// @ts-check

import {apiVersion, catalog, sources, canonicalUuid} from '../../truesight/api-v1.mjs';
if (apiVersion !== 1 || catalog.apiVersion !== 1) throw new Error('Incompatible Truesight API');
export {catalog, sources, canonicalUuid};

/**
 * @typedef {import('../../types/slow-insert.d.ts').BrowseCatalog} BrowseCatalog
 * @typedef {import('../../types/slow-insert.d.ts').BrowseCatalogEntry} BrowseCatalogEntry
 * @typedef {import('../../types/slow-insert.d.ts').CatalogReadResult} CatalogReadResult
 * @typedef {import('../../types/slow-insert.d.ts').SearchResultWrapper} SearchResultWrapper
 */

/**
 * Join public metadata with original search objects only at the UI boundary.
 * @param {readonly SearchResultWrapper[]} results
 * @param {CatalogReadResult} [publicCatalog]
 * @returns {BrowseCatalog}
 */
export function browseCatalog(results, publicCatalog = catalog.read()) {
  if (!['ready', 'unreviewed'].includes(publicCatalog.status)) throw new Error(`Truesight: ${publicCatalog.status}`);
  /** @type {Map<string, BrowseCatalogEntry>} */
  const entries = new Map();
  /** @type {Map<string, BrowseCatalogEntry[]>} */
  const groups = new Map();
  for (const result of results) {
    const uuid = canonicalUuid(result.item), member = publicCatalog.entries.get(uuid);
    // A stale QI result must not resurrect a member rejected by the current
    // permission-filtered public catalog, even as an independent row.
    if (!member) continue;
    /** @type {BrowseCatalogEntry} */
    const entry = {...member, result};
    entries.set(uuid, entry);
    if (entry.key) {
      let bucket = groups.get(entry.key);
      if (!bucket) {
        bucket = [];
        groups.set(entry.key, bucket);
      }
      bucket.push(entry);
    }
  }
  return {...publicCatalog, entries, groups};
}
