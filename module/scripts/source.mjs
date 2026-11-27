// @ts-check

import { t } from "./i18n.mjs";
import { identifySource, prepareSourceEnvironment } from "./source-resolution.mjs";

/**
 * @typedef {import('../../types/slow-insert.d.ts').ResolvedSourceDisplay} ResolvedSourceDisplay
 * @typedef {import('../../types/slow-insert.d.ts').ResolvedSourceOption} ResolvedSourceOption
 * @typedef {import('../../types/slow-insert.d.ts').SearchResultItem} SearchResultItem
 * @typedef {import('../../types/slow-insert.d.ts').SlowInsertEnvironment} SlowInsertEnvironment
 * @typedef {import('../../types/slow-insert.d.ts').SourceItemInput} SourceItemInput
 */

/** Small metadata only; no descriptions, effects, or document loading. */
export const SOURCE_INDEX_FIELDS = Object.freeze([
  "system.source.book", "system.source.rules", "system.source.custom", "system.source.page"
]);
/**
 * @template T
 * @param {readonly T[]} values
 * @returns {T[]}
 */
const unique = values => [...new Set(values)];

/**
 * @param {SourceItemInput} item
 * @param {SlowInsertEnvironment} [environment]
 * @returns {ResolvedSourceDisplay}
 */
export function resolveSource(item, environment = {}) {
  const prepared = prepareSourceEnvironment(environment);
  const source = identifySource(item, prepared);
  const conflicting = source.status.endsWith("conflict");
  /** @type {Map<string, ResolvedSourceOption>} */
  const options = new Map();
  /** @type {string[]} */
  const referenceIds = [];
  /** @param {ResolvedSourceOption} option */
  const add = option => options.set(option.value, option);
  /** @param {typeof source.references[number]} ref */
  const fullTitle = ref => [ref.record?.title || unique(ref.candidates.map(record => record.title)).join(" / "),
    ref.page && t("Source.Page", { page: ref.page }, prepared)].filter(Boolean).join(" · ");
  if (!conflicting) for (const { record } of source.references) {
    if (!record) continue;
    referenceIds.push(record.id);
    add({ value: `book:${record.id}`, label: record.label, title: record.title, section: "books", searchText: prepared.sourceCatalog.termsFor(record.id).join(" ") });
  }
  for (const ref of conflicting ? [] : source.references) {
    if (ref.record) continue;
    const families = unique(ref.candidates.map(record => record.family));
    if (families.length === 1) {
      const label = t("Source.EditionUnknown", { book: ref.candidates[0].familyLabel }, prepared);
      add({ value: `review:edition:${families[0]}`, label, title: unique(ref.candidates.map(record => record.title)).join(" / "), section: "review" });
    } else add({ value: "review:ambiguous", label: t("Source.Ambiguous", {}, prepared), title: unique(ref.candidates.map(record => record.title)).join(" / "), section: "review" });
  }
  if (source.status === "edition-conflict") add({ value: "review:edition-conflict", label: t("Source.EditionConflict", {}, prepared), title: t("Source.EditionConflictHint", {}, prepared), section: "review" });
  else if (source.status === "source-conflict") add({ value: "review:source-conflict", label: t("Source.SourceConflict", {}, prepared), title: t("Source.SourceConflictHint", {}, prepared), section: "review" });
  else if (source.status === "unknown") add({ value: "review:unknown", label: t("Source.Unknown", {}, prepared), title: t("Source.UnknownHint", {}, prepared), section: "review" });
  else if (source.unresolved.length) add({ value: "review:partial", label: t("Source.Partial", {}, prepared), title: t("Source.PartialHint", {}, prepared), section: "review" });

  let label;
  if (conflicting) {
    const names = unique(source.references.flatMap(ref => ref.candidates.map(record => record.familyLabel)));
    const warning = t(source.status === "edition-conflict" ? "Source.EditionConflict" : "Source.SourceConflict", {}, prepared);
    label = [names.join(" / "), warning].filter(Boolean).join(" · ");
  } else label = [...options.values()].map(option => option.label).join(" / ");
  if (source.external) label = t("Source.External", { book: label }, prepared);
  const details = [
    ...source.references.map(fullTitle),
    source.documentRules && t("Source.Rules", { rules: source.documentRules }, prepared),
    ...[...options.values()].filter(option => option.section === "review").map(option => option.label),
    source.references.some(ref => ref.confidence === "rules") && t("Source.RulesEvidence", {}, prepared),
    ...unique(source.raw.map(entry => entry.value)).map(value => t("Source.Original", { value }, prepared)),
    source.page && !source.references.some(ref => ref.page === source.page) && t("Source.Page", { page: source.page }, prepared),
    source.location && t("Source.Location", { location: source.location }, prepared),
    source.packageName && source.packageName !== source.location && t("Source.Provider", { name: source.packageName }, prepared),
    source.external && t("Source.ExternalHint", {}, prepared)
  ].filter(/** @returns {value is string} */ value => Boolean(value));
  return {
    ...source, label, title: unique(details).join(" · ") || t("Source.UnknownHint", {}, prepared),
    kind: conflicting ? "conflict" : source.status === "confirmed" ? "book" : "fallback",
    options: [...options.values()], referenceIds: unique(referenceIds),
    keys: [...options.keys()]
  };
}

/**
 * @param {SearchResultItem} item
 * @returns {Record<string, unknown>}
 */
export function documentDragData(item) {
  const supplied = item.dragData;
  // Preserve integration-specific import payloads, not only their pseudo-UUID.
  if (supplied && typeof supplied === "object" && supplied.type === item.documentType) return { ...supplied };
  return { type: item.documentType, uuid: item.uuid };
}

/**
 * Preserve Quick Insert ranking and exclusions; do not combine duplicate names.
 * @param {any} result
 * @returns {boolean}
 */
export function isItemResult(result) {
  return result?.item?.documentType === "Item" && typeof result.item.uuid === "string";
}
