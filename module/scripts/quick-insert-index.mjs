import { catalog } from "./catalog-api.mjs";
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
      this.hooks.push([hook, Hooks.on(hook, () => {
        this.onInvalidate();
        // Let Quick Insert finish replacing document index entries first.
        clearTimeout(this.catalogTimer);
        this.catalogTimer = setTimeout(() => { if (this.isVisible()) this.onRefresh(); }, 0);
      })]);
    }
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
      if (this.isVisible()) this.onRefresh();
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
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.hooks = [];
  }
}
