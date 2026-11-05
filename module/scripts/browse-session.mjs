import { prepareSourceEnvironment } from "./source-resolution.mjs";
import { rulesPredicate } from "./rules-visibility.mjs";
import { buildFilterOptions, filterItemData, matchesFilters } from "./filters.mjs";
import { buildGroupingCatalog, groupSearchResults } from "./grouping.mjs";
import { sortGroups } from "./sorting.mjs";

const LIMIT = 100;

/** Derived browsing state. No controls, DOM, settings writes or document loads. */
export class BrowseSession {
  constructor(index, { onCatalog = () => {} } = {}) {
    this.index = index;
    this.onCatalog = onCatalog;
    this.publicationProviders = new Map();
    this.catalog = null;
    this.page = null;
  }

  invalidate() { this.catalog = null; }
  clear() { this.page = null; }

  ensureCatalog({ hideRevised, snapshot, preferences }) {
    const index = this.index.identity;
    if (this.catalog && this.catalog.index === index) return this.catalog;
    const started = performance.now();
    const environment = prepareSourceEnvironment(this.index.sourceEnvironment(this.publicationProviders));
    const acceptRules = rulesPredicate(hideRevised, environment);
    const permittedResults = this.index.search("", () => true);
    const allResults = permittedResults.filter(acceptRules);
    const { options, dataCache } = buildFilterOptions(allResults, environment, this.index.filterConfig);
    this.catalog = { index, options, acceptRules, dataCache, environment, grouping: buildGroupingCatalog(permittedResults, environment, snapshot, preferences) };
    this.onCatalog(this.catalog);
    console.debug(`Slow Insert | Catalog: ${allResults.length} entries in ${(performance.now() - started).toFixed(1)}ms`);
    return this.catalog;
  }

  search({ query, filters, sorting, grouping, snapshot, hideRevised, preservePage = false }) {
    const previousCount = preservePage ? this.page?.shown : 0;
    const catalog = this.ensureCatalog({ hideRevised, snapshot, preferences: grouping });
    const { environment } = catalog;
    const accept = result => {
      if (!catalog.acceptRules(result)) return false;
      let data = catalog.dataCache.get(result.item);
      if (!data) {
        data = filterItemData(result.item, environment);
        catalog.dataCache.set(result.item, data);
      }
      return matchesFilters(data, filters);
    };
    // Limit after grouping, never before: otherwise a group could hide matches
    // past the first 100 raw rows or choose a representative outside filters.
    const matches = this.index.search(query, accept);
    const { groups: unsortedGroups, rawCount } = groupSearchResults(matches, catalog.grouping, {
      preferences: grouping, accept, query, lang: environment.lang
    });
    const groups = sortGroups(unsortedGroups, { profile: sorting.profiles[filters.scheme],
      scheme: filters.scheme, query, environment, dataFor: item => catalog.dataCache.get(item) });
    this.page = { groups, environment, rawCount, shown: Math.min(groups.length, previousCount || LIMIT),
      query, scheme: filters.scheme };
    return this.page;
  }

  nextPage({ visible, query, scheme }) {
    const page = this.page;
    if (!visible || !page || page.shown >= page.groups.length
      || query.trim() !== page.query || scheme !== page.scheme) return null;
    const end = Math.min(page.shown + LIMIT, page.groups.length);
    const groups = page.groups.slice(page.shown, end);
    page.shown = end;
    return { groups, environment: page.environment };
  }
}
