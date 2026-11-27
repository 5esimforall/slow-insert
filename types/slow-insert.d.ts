import type {
  CatalogMemberEntry,
  CatalogReadResult,
  IdentifiedSource,
  PreparedSourceEnvironment,
  ReviewReason,
  RulesEdition,
  SourceEnvironment,
  SourceItemInput
} from "../../truesight/types/api-v1.d.ts";

export type { CatalogReadResult, SourceItemInput };

export interface GroupingPreferences {
  version: 2;
  enabled: boolean;
  pins: Record<string, string>;
  hidden: string[];
}

export interface SearchResultItem extends SourceItemInput {
  uuid: string;
  name?: string;
  documentType: string;
  subType?: string;
  dragData?: Record<string, unknown>;
}

export interface SearchResultWrapper {
  item: SearchResultItem;
  [key: string]: unknown;
}

export type BrowseCatalogEntry =
  | (CatalogMemberEntry & { result: SearchResultWrapper })
  | {
      result: SearchResultWrapper;
      uuid: string;
      key: null;
      kind?: string | null;
      warning: ReviewReason | null;
      rules: RulesEdition | null;
      tags: string[];
      names: string[];
      srd?: boolean;
      [key: string]: unknown;
    };

export interface BrowseCatalog extends Omit<CatalogReadResult, "entries" | "groups"> {
  entries: Map<string, BrowseCatalogEntry>;
  groups: Map<string, BrowseCatalogEntry[]>;
}

export interface GroupedResultSet {
  key: string;
  kind: string | null;
  rules: RulesEdition | null;
  members: BrowseCatalogEntry[];
  representative: BrowseCatalogEntry;
  warning: ReviewReason | null;
  pinned: boolean;
}

export interface ResolvedSourceOption {
  value: string;
  label: string;
  title: string;
  section: "books" | "review";
  searchText?: string;
}

export interface ResolvedSourceDisplay extends IdentifiedSource {
  label: string;
  title: string;
  kind: "conflict" | "book" | "fallback";
  options: ResolvedSourceOption[];
  referenceIds: string[];
  keys: string[];
}

export interface QuickReferenceRecord {
  kind: string;
  book: string;
  names: readonly string[];
  classes?: readonly string[];
  category?: string;
  rarity?: string;
  attunement?: unknown;
}

export interface SlowInsertEnvironment extends SourceEnvironment {
  lang?: string;
  localize?: (key: string) => string;
}

export type PreparedSlowInsertEnvironment = PreparedSourceEnvironment & SlowInsertEnvironment;
