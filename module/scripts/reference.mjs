import { QUICK_REFERENCE } from "../data/quick-reference.mjs";
import { DEFAULT_PUBLICATION_CATALOG } from "./publications.mjs";

export const normalizeName = value => typeof value === "string"
  ? value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "") : "";
export function referenceBook(value) {
  const books = DEFAULT_PUBLICATION_CATALOG.lookup(value);
  return books.length === 1 ? books[0].id : normalizeName(value);
}

/** Exact factual lookup only: no fuzzy joins, no cross-edition guesses. */
export function makeReferenceLookup(records = QUICK_REFERENCE) {
  const index = new Map();
  for (const record of records) {
    const signature = JSON.stringify([record.classes, record.category, record.rarity, record.attunement]);
    for (const name of record.names) {
      const key = `${record.kind}:${referenceBook(record.book)}:${normalizeName(name)}`;
      if (!index.has(key)) index.set(key, new Map());
      index.get(key).set(signature, record);
    }
  }
  return (item, source) => {
    if (source.status && source.status !== "confirmed") return null;
    if (!source.referenceIds?.length && source.kind !== "book") return null;
    const kind = item.subType === "spell" ? "spell" : "magic";
    const candidates = new Map();
    for (const name of [item.name, item.system?.identifier]) {
      for (const book of source.referenceIds ?? [referenceBook(source.label)]) {
        const key = `${kind}:${book}:${normalizeName(name)}`;
        for (const [signature, record] of index.get(key) ?? []) candidates.set(signature, record);
      }
    }
    return candidates.size === 1 ? candidates.values().next().value : null;
  };
}

export const lookupReference = makeReferenceLookup();
