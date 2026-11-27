// @ts-check

import { QUICK_REFERENCE } from "../data/quick-reference.mjs";
import { DEFAULT_PUBLICATION_CATALOG } from "./publications.mjs";

/**
 * @typedef {import('../../types/slow-insert.d.ts').QuickReferenceRecord} QuickReferenceRecord
 * @typedef {import('../../types/slow-insert.d.ts').ResolvedSourceDisplay} ResolvedSourceDisplay
 * @typedef {import('../../types/slow-insert.d.ts').SearchResultItem} SearchResultItem
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeName = value => typeof value === "string"
  ? value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "") : "";
/**
 * @param {unknown} value
 * @returns {string}
 */
export function referenceBook(value) {
  const books = DEFAULT_PUBLICATION_CATALOG.lookup(value);
  return books.length === 1 ? books[0].id : normalizeName(value);
}

/**
 * Exact factual lookup only: no fuzzy joins, no cross-edition guesses.
 * @param {readonly QuickReferenceRecord[]} [records]
 * @returns {(item: SearchResultItem, source: Partial<ResolvedSourceDisplay>) => QuickReferenceRecord | null}
 */
export function makeReferenceLookup(records = QUICK_REFERENCE) {
  /** @type {Map<string, Map<string, QuickReferenceRecord>>} */
  const index = new Map();
  for (const record of records) {
    const signature = JSON.stringify([record.classes, record.category, record.rarity, record.attunement]);
    for (const name of record.names) {
      const key = `${record.kind}:${referenceBook(record.book)}:${normalizeName(name)}`;
      let bucket = index.get(key);
      if (!bucket) {
        bucket = new Map();
        index.set(key, bucket);
      }
      bucket.set(signature, record);
    }
  }
  return (item, source) => {
    if (source.status && source.status !== "confirmed") return null;
    if (!source.referenceIds?.length && source.kind !== "book") return null;
    const kind = item.subType === "spell" ? "spell" : "magic";
    /** @type {Map<string, QuickReferenceRecord>} */
    const candidates = new Map();
    for (const name of [item.name, item.system?.identifier]) {
      for (const book of source.referenceIds ?? [referenceBook(source.label)]) {
        const key = `${kind}:${book}:${normalizeName(name)}`;
        for (const [signature, record] of index.get(key) ?? []) candidates.set(signature, record);
      }
    }
    return candidates.size === 1 ? (candidates.values().next().value ?? null) : null;
  };
}

export const lookupReference = makeReferenceLookup();
