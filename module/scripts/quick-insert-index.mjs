import { catalog } from "./catalog-api.mjs";
import { FILTER_INDEX_FIELDS, ACTOR_FILTER_INDEX_FIELDS } from "./filters.mjs";
import { SOURCE_INDEX_FIELDS } from "./source.mjs";

const SEARCH_FIELDS = ['name', 'type', 'img', 'ownership', 'permission', 'folder', 'items', 'flags', 'originalName',
  ...FILTER_INDEX_FIELDS, ...ACTOR_FILTER_INDEX_FIELDS, ...SOURCE_INDEX_FIELDS];
export function affectsSearch(delta, prefix = '') {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return true;
  return Object.entries(delta).some(([key, value]) => {
    const path = [prefix, key.replace(/(^|\.)-=/g, '$1')].filter(Boolean).join('.');
    if (SEARCH_FIELDS.some(field => path === field || path.startsWith(field + '.'))) return true;
    if (!SEARCH_FIELDS.some(field => field.startsWith(path + '.'))) return false;
    return affectsSearch(value, path);
  });
}
export function isIndexedDocument(hook, document) {
  if (!document || typeof document !== 'object') return true;
  if (document.isToken === true || document.parent?.isToken === true
    || document.parent?.documentName === 'Token' || document.parent?.parent?.documentName === 'Token'
    || (typeof document.uuid === 'string' && /^Scene\.[^.]+\.Token\./.test(document.uuid))) return false;
  if (hook.endsWith('Item') && !document.pack && !document.parent?.pack) {
    const embedded = (typeof document.uuid === 'string' && /^Actor\.[^.]+\.Item\./.test(document.uuid))
      || Boolean(document.parent && (document.parent.documentName === 'Actor'
        || document.parent.items !== undefined
        || (typeof document.parent.uuid === 'string' && document.parent.uuid.startsWith('Actor.'))));
    if (embedded) {
      try { return Boolean(globalThis.game?.settings?.get?.('quick-insert', 'embeddedIndexing')); }
      catch { return false; }
    }
  }
  return true;
}

/** Foundry/Quick Insert boundary. Completion hooks, not forceIndex promises,
 * own completion; all timers and subscriptions belong to this instance. */
export class QuickInsertIndex {
  constructor({ isVisible, onInvalidate, onRefresh, onStateChange, onFailure }) {
    Object.assign(this, { isVisible, onInvalidate, onRefresh, onStateChange, onFailure });
    this.hooks = [];
    this.indexing = false;
    this.failed = false;
    this.destroyed = false;
  }

  allowed() {
    return game.modules.get("quick-insert")?.active
      && (game.user.isGM || !game.settings.get("quick-insert", "gmOnly"));
  }

  get hasIndex() { return Boolean(globalThis.QuickInsert?.hasIndex); }
  get identity() { return globalThis.QuickInsert?.searchLib?.index; }

  search(query, accept) {
    return globalThis.QuickInsert.search(query, accept, Number.MAX_SAFE_INTEGER);
  }

  get filterConfig() {
    return { typeLabels: CONFIG.Item.typeLabels, spellSchools: CONFIG.DND5E?.spellSchools,
      activationTypes: CONFIG.DND5E?.abilityActivationTypes };
  }

  connect() {
    this.hooks.push(["QuickInsert:IndexCompleted", Hooks.on("QuickInsert:IndexCompleted", () => this.onIndexCompleted())]);
    // A sidebar may mount before ready. Importers can replace QI's index there.
    this.hooks.push(["ready", Hooks.on("ready", () => this.scheduleInitialIndex())]);
    for (const hook of ["createItem", "updateItem", "deleteItem", "createActor", "updateActor", "deleteActor"]) {
      this.hooks.push([hook, Hooks.on(hook, (document, delta) => {
        if (!isIndexedDocument(hook, document)) return;
        if (hook.startsWith("update") && !affectsSearch(delta)) return;
        this.onInvalidate();
        // Let Quick Insert finish replacing document index entries first.
        this.scheduleRefresh();
      })]);
    }
  }

  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (!this.destroyed && this.isVisible()) this.onRefresh();
    }, 0);
  }

  scheduleInitialIndex() {
    if (!globalThis.game.ready || !this.isVisible() || this.indexing || this.initialIndexTimer || this.failed) return;
    if (globalThis.QuickInsert?.hasIndex) return;
    // Yield past ready callbacks, including their microtasks. When QI owns a
    // delayed automatic build, let it run rather than creating a second build.
    if (game.settings.get("quick-insert", "automaticIndexing") !== -1) return;
    this.initialIndexTimer = setTimeout(() => {
      this.initialIndexTimer = null;
      if (!this.destroyed && this.isVisible() && !globalThis.QuickInsert?.hasIndex) void this.buildIndex(false);
    }, 0);
  }

  onIndexCompleted() {
    if (this.destroyed) return;
    clearTimeout(this.indexTimeout);
    this.indexing = false;
    this.onStateChange();
    this.onInvalidate();
    // Other completion listeners may still update the index. Refresh once,
    // after the hook dispatch, not once here AND once after forceIndex returns.
    clearTimeout(this.catalogTimer);
    this.catalogTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (!globalThis.QuickInsert?.hasIndex) {
        if (!this.recoveryUsed) {
          this.recoveryUsed = true;
          console.warn("Slow Insert | Index reference lost during startup; retrying once");
          void this.buildIndex(false);
        } else this.failIndex(new Error("Index reference missing after recovery"));
        return;
      }
      this.failed = false;
      this.scheduleRefresh();
    }, 0);
  }

  failIndex(error) {
    clearTimeout(this.indexTimeout);
    this.indexing = false;
    this.failed = true;
    this.onStateChange();
    console.error("Slow Insert | Indexing failed", error);
    this.onFailure(error);
  }

  async buildIndex(manual = true) {
    if (!globalThis.game.ready || this.destroyed || this.indexing || !this.allowed()) return;
    if (manual) this.recoveryUsed = false;
    this.failed = false;
    this.indexing = true;
    this.onStateChange();
    this.onRefresh();
    // forceIndex returns immediately if QI is already building. Only its
    // completion event is evidence of completion; a resolved promise isn't.
    this.indexTimeout = setTimeout(() => {
      if (!this.destroyed && this.indexing) this.failIndex(new Error("No index completion event within 60 seconds"));
    }, 60000);
    try {
      await globalThis.QuickInsert.forceIndex();
    } catch (error) {
      if (!this.destroyed) this.failIndex(error);
    }
  }

  sourceEnvironment() { return catalog.sourceEnvironment(); }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.initialIndexTimer);
    clearTimeout(this.indexTimeout);
    clearTimeout(this.catalogTimer);
    clearTimeout(this.refreshTimer);
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.hooks = [];
  }
}
