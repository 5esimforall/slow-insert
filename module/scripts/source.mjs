import { t } from "./i18n.mjs";
import { parseCitations } from "./publications.mjs";
import { identifySource, prepareSourceEnvironment } from "./source-resolution.mjs";

/** Small metadata only; no descriptions, effects, or document loading. */
export const SOURCE_INDEX_FIELDS = Object.freeze([
  "system.source.book", "system.source.rules", "system.source.custom", "system.source.page"
]);
const text = value => typeof value === "string" ? value.trim() : "";
const unique = values => [...new Set(values)];

/** Compatibility formatter, not a source classifier. Unknown text is returned
 * unchanged here; resolveSource never promotes it into the bibliography. */
export function sourceBadge(book, rules = "") {
  const refs = parseCitations(book);
  if (refs.length !== 1 || !refs[0].candidates.length) return text(book);
  const candidates = refs[0].candidates;
  const selected = candidates.length === 1 ? candidates : candidates.filter(record => record.rules === rules);
  return selected.length === 1 ? selected[0].label : unique(candidates.map(record => record.familyLabel)).join(" / ");
}

export function resolveSource(item, environment = {}) {
  environment = prepareSourceEnvironment(environment);
  const source = identifySource(item, environment);
  const conflicting = source.status.endsWith("conflict");
  const options = new Map(), referenceIds = [];
  const add = option => options.set(option.value, option);
  const confirmed = source.references.filter(ref => ref.record);
  const fullTitle = ref => [ref.record?.title || unique(ref.candidates.map(record => record.title)).join(" / "),
    ref.page && t("Source.Page", { page: ref.page }, environment)].filter(Boolean).join(" · ");
  if (!conflicting) for (const { record } of confirmed) {
    referenceIds.push(record.id);
    add({ value: `book:${record.id}`, label: record.label, title: record.title, section: "books", searchText: environment.sourceCatalog.termsFor(record.id).join(" ") });
  }
  const uncertain = source.references.filter(ref => !ref.record);
  for (const ref of conflicting ? [] : uncertain) {
    const families = unique(ref.candidates.map(record => record.family));
    if (families.length === 1) {
      const label = t("Source.EditionUnknown", { book: ref.candidates[0].familyLabel }, environment);
      add({ value: `review:edition:${families[0]}`, label, title: unique(ref.candidates.map(record => record.title)).join(" / "), section: "review" });
    } else add({ value: "review:ambiguous", label: t("Source.Ambiguous", {}, environment), title: unique(ref.candidates.map(record => record.title)).join(" / "), section: "review" });
  }
  if (source.status === "edition-conflict") add({ value: "review:edition-conflict", label: t("Source.EditionConflict", {}, environment), title: t("Source.EditionConflictHint", {}, environment), section: "review" });
  else if (source.status === "source-conflict") add({ value: "review:source-conflict", label: t("Source.SourceConflict", {}, environment), title: t("Source.SourceConflictHint", {}, environment), section: "review" });
  else if (source.status === "unknown") add({ value: "review:unknown", label: t("Source.Unknown", {}, environment), title: t("Source.UnknownHint", {}, environment), section: "review" });
  else if (source.unresolved.length) add({ value: "review:partial", label: t("Source.Partial", {}, environment), title: t("Source.PartialHint", {}, environment), section: "review" });

  let label;
  if (conflicting) {
    const names = unique(source.references.flatMap(ref => ref.candidates.map(record => record.familyLabel)));
    const warning = t(source.status === "edition-conflict" ? "Source.EditionConflict" : "Source.SourceConflict", {}, environment);
    label = [names.join(" / "), warning].filter(Boolean).join(" · ");
  } else label = [...options.values()].map(option => option.label).join(" / ");
  if (source.external) label = t("Source.External", { book: label }, environment);
  const details = [
    ...source.references.map(fullTitle),
    source.documentRules && t("Source.Rules", { rules: source.documentRules }, environment),
    ...[...options.values()].filter(option => option.section === "review").map(option => option.label),
    source.references.some(ref => ref.confidence === "rules") && t("Source.RulesEvidence", {}, environment),
    ...unique(source.raw.map(entry => entry.value)).map(value => t("Source.Original", { value }, environment)),
    source.page && !source.references.some(ref => ref.page === source.page) && t("Source.Page", { page: source.page }, environment),
    source.location && t("Source.Location", { location: source.location }, environment),
    source.packageName && source.packageName !== source.location && t("Source.Provider", { name: source.packageName }, environment),
    source.external && t("Source.ExternalHint", {}, environment)
  ].filter(Boolean);
  return {
    ...source, label, title: unique(details).join(" · ") || t("Source.UnknownHint", {}, environment),
    kind: conflicting ? "conflict" : source.status === "confirmed" ? "book" : "fallback",
    options: [...options.values()], referenceIds: unique(referenceIds),
    keys: [...options.keys()]
  };
}

export function documentDragData(item) {
  const supplied = item.dragData;
  // Preserve integration-specific import payloads, not only their pseudo-UUID.
  if (supplied && typeof supplied === "object" && supplied.type === item.documentType) return { ...supplied };
  return { type: item.documentType, uuid: item.uuid };
}

/** Preserve Quick Insert ranking and exclusions; do not combine duplicate names. */
export function isItemResult(result) {
  return result?.item?.documentType === "Item" && typeof result.item.uuid === "string";
}
