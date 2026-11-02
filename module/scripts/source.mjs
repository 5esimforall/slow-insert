import { t } from "./i18n.mjs";

/** Source resolution is synchronous: searching must not load full documents. */
export const SOURCE_INDEX_FIELDS = Object.freeze([
  "system.source.book", "system.source.rules", "system.source.custom", "system.source.page"
]);

const text = value => typeof value === "string" ? value.trim() : "";
const BOOKS = new Map([
  ["phb", "PHB"], ["playershandbook", "PHB"], ["玩家手册", "PHB"],
  ["dmg", "DMG"], ["dungeonmastersguide", "DMG"], ["城主指南", "DMG"],
  ["mm", "MM"], ["monstermanual", "MM"], ["怪物图鉴", "MM"],
  ["tcoe", "TCoE"], ["tashascauldronofeverything", "TCoE"],
  ["xge", "XGtE"], ["xgte", "XGtE"], ["xanatharsguidetoeverything", "XGtE"]
]);
const REVISED_BOOKS = new Map([["xphb", "PHB'24"], ["xdmg", "DMG'24"], ["xmm", "MM'25"]]);

export function sourceBadge(book, rules = "") {
  const name = text(book);
  const compact = name.toLowerCase().replace(/[\s'’‘()\[\].:–—-]/g, "");
  // Explicit revised-book identifiers used by some importers.
  const revised = REVISED_BOOKS.get(compact);
  if (revised) return revised;
  const match = compact.match(/^(.*?)(2014|2024|2025|14|24|25)?$/);
  const canonical = BOOKS.get(match?.[1]);
  if (!canonical) return name;
  if (!["PHB", "DMG", "MM"].includes(canonical)) return canonical;
  const explicitYear = match[2];
  const year = explicitYear || (["2014", "2024"].includes(text(rules)) ? rules : "");
  return year ? `${canonical}'${year.slice(-2)}` : canonical;
}

export function resolveSource(item, environment = {}) {
  // Integrations such as Plutonium use @spell[...] handles, not world UUIDs.
  // Keep them separate from audited documents and label their actual origin.
  if (/^@[\w]+\[/.test(item.uuid ?? "")) {
    const book = sourceBadge(text(item.source));
    return { label: t("Source.External", { book: book || t("Source.Unknown", {}, environment) }, environment),
      kind: "external", title: t("Source.ExternalHint", {}, environment) };
  }
  const { packs, modules, system, world, localize = value => value } = environment;
  const packId = item.package || item.uuid?.match(/^Compendium\.([^.]+\.[^.]+)\./)?.[1];
  const pack = packs?.get(packId);
  const metadata = pack?.metadata;
  const source = item.system?.source;
  const data = source && typeof source === "object" ? source : {};
  const rules = text(data.rules);
  const location = text(pack?.title) || text(metadata?.label) || text(item.packageName);
  let book = text(data.custom) || text(data.book) || text(source);

  if (!book) book = text(metadata?.flags?.dnd5e?.sourceBook);
  if (!book) {
    const pkg = metadata?.packageType === "system" ? system
      : metadata?.packageType === "world" ? world
        : modules?.get(metadata?.packageName);
    const books = Object.keys(pkg?.flags?.dnd5e?.sourceBooks ?? {});
    if (books.length === 1) book = books[0];
  }

  if (book) {
    const localized = localize(book);
    const page = text(data.page);
    return {
      label: sourceBadge(book, rules),
      kind: "book",
      title: [localized || book, page && t("Source.Page", { page }, environment), rules && t("Source.Rules", { rules }, environment), location]
        .filter(Boolean).join(" · ")
    };
  }
  const fallback = location || t(packId ? "Source.Compendium" : "Source.World", {}, environment);
  return {
    label: fallback,
    kind: "fallback",
    title: t("Source.Fallback", { location: fallback, unknown: t("Source.Unknown", {}, environment) }, environment)
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

export function getDockLayout(viewportWidth, sidebarLeft, preferredWidth = 360) {
  const viewport = Math.max(0, viewportWidth);
  const edge = Math.max(0, Math.min(viewport, sidebarLeft ?? viewport));
  // On narrow windows use an overlay instead of squeezing the panel off-screen.
  const right = edge >= 304 ? viewport - edge + 8 : 8;
  const available = Math.max(0, viewport - right - 8);
  const width = Math.min(Math.max(280, Number(preferredWidth) || 360), 560, available);
  return { right, width };
}
