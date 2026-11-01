import { QUICK_REFERENCE } from "../data/quick-reference.mjs";

export const normalizeName = value => typeof value === "string"
  ? value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "") : "";
const BOOK_ALIASES = new Map([
  ["tcoe", "tce"], ["xgte", "xge"], ["ftod", "ftd"], ["ggtr", "ggr"], ["egtw", "egw"],
  ["scoc", "scc"], ["motm", "mpmm"], ["mmom", "mpmm"], ["xphb", "phb24"], ["xdmg", "dmg24"], ["xmm", "mm25"]
]);
export function referenceBook(value) {
  const key = normalizeName(value).replace(/(phb|dmg|mm)20(14|24|25)$/, "$1$2");
  return BOOK_ALIASES.get(key) || key;
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
    if (source.kind !== "book") return null;
    const kind = item.subType === "spell" ? "spell" : "magic";
    const candidates = new Map();
    for (const name of [item.name, item.system?.identifier]) {
      const key = `${kind}:${referenceBook(source.label)}:${normalizeName(name)}`;
      for (const [signature, record] of index.get(key) ?? []) candidates.set(signature, record);
    }
    return candidates.size === 1 ? candidates.values().next().value : null;
  };
}

export const lookupReference = makeReferenceLookup();
