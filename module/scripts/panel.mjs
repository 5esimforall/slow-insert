import { t } from "./i18n.mjs";
import { getDockLayout, resolveSource } from "./source.mjs";
import { SCHEMES, crLabel, itemTypeLabel, isSupportedResult, activeFilters, buildFilterOptions, filterItemData, matchesFilters, normalizeFilters, setScheme } from "./filters.mjs";
import { FilterControls } from "./filter-controls.mjs";
import { hasPriorityEscapeTarget } from "./escape.mjs";

export const MODULE_ID = "slow-insert";
const LIMIT = 100;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function button(label, icon) {
  const node = element("button", "si-icon-button");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  const glyph = element("i", `fas ${icon}`);
  glyph.setAttribute("aria-hidden", "true");
  node.append(glyph);
  return node;
}

export class SlowInsertPanel {
  constructor() {
    this.visible = false;
    this.results = [];
    this.selected = -1;
    this.width = game.settings.get(MODULE_ID, "width");
    this.events = new AbortController();
    this.hooks = [];
    this.filters = normalizeFilters(game.settings.get(MODULE_ID, "filters"));
    this.dnd5e = game.system.id === "dnd5e";
    if (!this.dnd5e) this.filters = setScheme(this.filters, "items");
  }

  allowed() {
    return game.modules.get("quick-insert")?.active
      && (game.user.isGM || !game.settings.get("quick-insert", "gmOnly"));
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.events.signal });
  }

  mount() {
    this.root = element("aside", "slow-insert");
    this.root.id = "slow-insert-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", t("Panel.Label"));

    const header = element("header", "si-header");
    const heading = element("div", "si-heading");
    heading.append(element("h2", "", "Slow Insert"), element("span", "si-version", game.modules.get(MODULE_ID)?.version || ""));
    this.reindexButton = button(t("Panel.Reindex"), "fa-arrows-rotate");
    this.closeButton = button(t("Panel.Close"), "fa-xmark");
    header.append(heading, this.reindexButton, this.closeButton);

    const searchBox = element("div", "si-search-box");
    const searchIcon = element("i", "fas fa-magnifying-glass");
    searchIcon.setAttribute("aria-hidden", "true");
    this.input = element("input", "si-search");
    this.input.type = "search";
    this.input.placeholder = t("Panel.SearchPlaceholder");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.input.value = game.settings.get(MODULE_ID, "query");
    this.input.setAttribute("aria-label", t("Panel.SearchLabel"));
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", "slow-insert-results");
    this.input.setAttribute("aria-expanded", "false");
    searchBox.append(searchIcon, this.input);

    this.filterControls = new FilterControls({
      state: this.filters, dnd5e: this.dnd5e,
      onChange: state => {
        this.filters = state;
        clearTimeout(this.searchTimer);
        void this.save("filters", state);
        this.refresh();
      }
    });

    this.status = element("div", "si-status");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.list = element("div", "si-results");
    this.list.id = "slow-insert-results";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", t("Panel.ResultsLabel"));
    const footer = element("footer", "si-footer", t("Panel.Footer"));

    this.resizeHandle = element("div", "si-resize");
    this.resizeHandle.tabIndex = 0;
    this.resizeHandle.setAttribute("role", "separator");
    this.resizeHandle.setAttribute("aria-label", t("Panel.Resize"));
    this.resizeHandle.setAttribute("aria-orientation", "vertical");
    this.resizeHandle.setAttribute("aria-valuemin", "280");
    this.resizeHandle.setAttribute("aria-valuemax", "560");
    this.root.append(this.resizeHandle, header, searchBox, this.filterControls.root, this.status, this.list, footer);

    this.launcher = button(t("Panel.Launcher"), "fa-magnifying-glass");
    this.launcher.id = "slow-insert-toggle";
    this.launcher.className = "si-launcher";
    this.launcher.append(element("span", "", "Slow Insert"));
    this.launcher.setAttribute("aria-controls", this.root.id);
    this.launcher.setAttribute("aria-expanded", "false");
    document.body.append(this.root, this.launcher);

    this.listen(this.launcher, "click", () => this.toggle());
    this.listen(this.closeButton, "click", () => this.close());
    this.listen(this.reindexButton, "click", () => this.buildIndex());
    this.listen(this.input, "input", event => {
      clearTimeout(this.searchTimer);
      if (!event.isComposing) this.searchTimer = setTimeout(() => this.refresh(), 100);
    });
    this.listen(this.input, "compositionend", () => {
      clearTimeout(this.searchTimer);
      this.refresh();
    });
    this.listen(this.root, "keydown", event => this.onKeydown(event));
    // Bubble after window/dialog-local handlers, but before Foundry's global
    // keyboard manager skips shortcuts because an unrelated input has focus.
    this.listen(document, "keydown", event => this.onDocumentKeydown(event));
    this.listen(this.list, "click", event => {
      const row = event.target.closest(".si-result");
      if (row) void this.openItem(Number(row.dataset.index));
    });
    this.listen(this.list, "dragstart", event => this.onDragStart(event));
    this.listen(this.resizeHandle, "pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.resizeHandle.setPointerCapture(event.pointerId);
      this.resizeStart = { x: event.clientX, width: this.root.getBoundingClientRect().width };
    });
    this.listen(this.resizeHandle, "pointermove", event => {
      if (!this.resizeStart) return;
      this.width = Math.max(280, Math.min(560, this.resizeStart.width + this.resizeStart.x - event.clientX));
      this.position();
    });
    this.listen(this.resizeHandle, "lostpointercapture", () => {
      this.resizeStart = null;
      void this.save("width", this.width);
    });
    this.listen(this.resizeHandle, "keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      this.width = Math.max(280, Math.min(560, this.width + (event.key === "ArrowLeft" ? 20 : -20)));
      this.position();
      void this.save("width", this.width);
    });
    this.listen(window, "resize", () => this.schedulePosition());

    const sidebar = document.getElementById("sidebar");
    this.resizeObserver = new ResizeObserver(() => this.schedulePosition());
    if (sidebar) this.resizeObserver.observe(sidebar);
    const rightUI = document.getElementById("ui-right");
    if (rightUI) this.resizeObserver.observe(rightUI);
    // Recheck the actual bounds after Foundry's sidebar-collapse animation.
    if (sidebar) this.listen(sidebar, "transitionend", () => this.schedulePosition());
    for (const hook of ["collapseSidebar", "renderSidebar"]) {
      this.hooks.push([hook, Hooks.on(hook, () => this.schedulePosition())]);
    }
    this.hooks.push(["QuickInsert:IndexCompleted", Hooks.on("QuickInsert:IndexCompleted", () => {
      this.filterCatalog = null;
      this.indexing = false;
      this.reindexButton.disabled = false;
      if (this.visible) this.refresh();
    })]);
    for (const hook of ["createItem", "updateItem", "deleteItem", "createActor", "updateActor", "deleteActor"]) {
      this.hooks.push([hook, Hooks.on(hook, () => {
        this.filterCatalog = null;
        // Let Quick Insert's document hooks finish replacing their index entries first.
        clearTimeout(this.catalogTimer);
        this.catalogTimer = setTimeout(() => { if (this.visible) this.refresh(); }, 0);
      })]);
    }
    this.position();
  }

  schedulePosition() {
    if (this.positionFrame) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null;
      this.position();
    });
  }

  position() {
    const sidebar = document.getElementById("sidebar");
    const bounds = sidebar?.getBoundingClientRect();
    const sidebarLeft = bounds?.width && bounds.height ? bounds.left : window.innerWidth;
    const { right, width } = getDockLayout(window.innerWidth, sidebarLeft, this.width);
    this.root.style.right = `${right}px`;
    this.root.style.width = `${width}px`;
    this.launcher.style.right = `${right}px`;
    this.resizeHandle.setAttribute("aria-valuenow", String(Math.round(width)));
  }

  toggle() { this.visible ? this.close() : this.open(); }

  open() {
    if (!this.allowed()) return;
    if (!this.visible) this.previousFocus = document.activeElement;
    this.visible = true;
    this.root.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute("aria-expanded", "true");
    this.position();
    this.input.focus();
    this.input.select();
    this.refresh();
    if (!globalThis.QuickInsert?.hasIndex && !this.indexing) void this.buildIndex();
  }

  close() {
    const restoreFocus = this.root.contains(document.activeElement);
    this.visible = false;
    this.root.hidden = true;
    this.launcher.hidden = false;
    this.launcher.setAttribute("aria-expanded", "false");
    clearTimeout(this.searchTimer);
    void this.save("query", this.input.value);
    if (restoreFocus) {
      const target = this.previousFocus?.isConnected && this.previousFocus !== document.body
        ? this.previousFocus : this.launcher;
      target.focus();
    }
  }

  async save(key, value) {
    try { await game.settings.set(MODULE_ID, key, value); }
    catch (error) { console.warn("Slow Insert | Could not save client preference", error); }
  }

  async buildIndex() {
    if (this.indexing || !this.allowed()) return;
    this.indexing = true;
    this.reindexButton.disabled = true;
    this.refresh();
    try {
      await globalThis.QuickInsert.forceIndex();
      this.indexing = false;
      this.reindexButton.disabled = false;
      if (this.visible) this.refresh();
    } catch (error) {
      this.indexing = false;
      this.reindexButton.disabled = false;
      console.error("Slow Insert | Indexing failed", error);
      this.status.textContent = t("Status.IndexFailed");
    }
  }

  clearResults(message) {
    this.results = [];
    this.selected = -1;
    this.list.replaceChildren();
    this.input.removeAttribute("aria-activedescendant");
    this.input.setAttribute("aria-expanded", "false");
    this.status.textContent = message;
  }

  sourceEnvironment() {
    return {
      packs: game.packs, modules: game.modules, system: game.system, world: game.world,
      localize: key => game.i18n.localize(key), lang: game.i18n.lang
    };
  }

  ensureFilterCatalog(qi, environment) {
    const index = qi.searchLib?.index;
    if (this.filterCatalog && this.filterCatalog.index === index) return;
    const { options, dataCache } = buildFilterOptions(qi.search("", isSupportedResult, Number.MAX_SAFE_INTEGER), environment, {
      typeLabels: CONFIG.Item.typeLabels,
      spellSchools: CONFIG.DND5E?.spellSchools,
      activationTypes: CONFIG.DND5E?.abilityActivationTypes
    });
    this.filterCatalog = { index, dataCache };
    this.filterControls.setOptions(options);
  }

  refresh() {
    if (!this.visible) return;
    if (!this.allowed()) { this.clearResults(t("Status.Unavailable")); return; }
    if (this.indexing) { this.clearResults(t("Status.Indexing")); return; }
    const qi = globalThis.QuickInsert;
    if (!qi?.hasIndex) { this.clearResults(t("Status.Waiting")); return; }
    const query = this.input.value.trim();
    this.renderedQuery = this.input.value;
    try {
      const environment = this.sourceEnvironment();
      this.ensureFilterCatalog(qi, environment);
      const filtered = this.filters.scheme !== "items" || activeFilters(this.filters).length > 0;
      if (!query && !filtered) { this.clearResults(t("Status.Start")); return; }
      const matches = qi.search(query, result => {
        if (!isSupportedResult(result)) return false;
        let data = this.filterCatalog.dataCache.get(result.item);
        if (!data) {
          data = filterItemData(result.item, environment);
          this.filterCatalog.dataCache.set(result.item, data);
        }
        return matchesFilters(data, this.filters);
      }, LIMIT + 1);
      this.results = matches.slice(0, LIMIT);
      this.list.replaceChildren();
      const fragment = document.createDocumentFragment();
      for (const [index, { item }] of this.results.entries()) {
        const source = resolveSource(item, environment);
        const row = element("button", "si-result");
        row.type = "button";
        row.tabIndex = -1;
        row.draggable = true;
        row.dataset.index = String(index);
        row.id = `slow-insert-result-${index}`;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        row.title = `${item.name}\n${source.title}`;
        const image = element("img", "si-image");
        image.src = item.img || (item.documentType === "Actor" ? "icons/svg/mystery-man.svg" : "icons/svg/item-bag.svg");
        image.alt = "";
        image.loading = "lazy";
        image.draggable = false;
        image.addEventListener("error", () => { image.hidden = true; }, { once: true });
        const label = element("span", "si-label");
        label.append(element("span", "si-name", item.name || t("Panel.Unnamed")));
        const data = this.filterCatalog.dataCache.get(item);
        const subtitle = data?.monster ? t("Panel.MonsterCR", { cr: data.cr === null ? t("Unknown") : crLabel(data.cr) })
          : itemTypeLabel(item.subType, CONFIG[item.documentType]?.typeLabels, environment) || t("Panel.Item");
        label.append(element("span", "si-type", subtitle));
        const badge = element("span", `si-source si-source--${source.kind}`, source.label);
        badge.title = source.title;
        row.append(image, label, badge);
        fragment.append(row);
      }
      this.list.append(fragment);
      this.status.textContent = this.results.length
        ? t(matches.length > LIMIT ? "Status.ResultsLimited" : "Status.Results", { count: this.results.length, scheme: t(SCHEMES[this.filters.scheme].label) })
        : t("Status.NoResults");
      this.input.setAttribute("aria-expanded", String(this.results.length > 0));
      this.select(this.results.length ? 0 : -1, false);
    } catch (error) {
      console.error("Slow Insert | Search failed", error);
      this.clearResults(t("Status.SearchFailed"));
    }
  }

  select(index, scroll = true) {
    this.list.children[this.selected]?.setAttribute("aria-selected", "false");
    this.selected = index;
    const row = this.list.children[index];
    if (!row) { this.input.removeAttribute("aria-activedescendant"); return; }
    row.setAttribute("aria-selected", "true");
    this.input.setAttribute("aria-activedescendant", row.id);
    if (scroll) row.scrollIntoView({ block: "nearest" });
  }

  onEscape(event, { forwardNative = false } = {}) {
    if (!this.visible || event.defaultPrevented || event.isComposing
      || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    if (hasPriorityEscapeTarget()) {
      if (!forwardNative) return false;
      // Preserve the real event (including target) for native window dismissal.
      // emulateKeypress creates a target-less event which crashes Plutonium's
      // Escape handler. Redispatching all keybindings also lets its input-blur
      // shortcut consume the press instead of closing the open window.
      const keyboardClass = game.keyboard?.constructor;
      const dismiss = game.keybindings?.actions?.get("core.dismiss");
      if (typeof keyboardClass?.getKeyboardEventContext !== "function" || typeof dismiss?.onDown !== "function") return false;
      const context = keyboardClass.getKeyboardEventContext(event);
      event.preventDefault();
      event.stopPropagation();
      // Invoke the original native action, not another synthetic keyboard event.
      // Never close our panel when this promise completes: that needs a new press.
      Promise.resolve(dismiss.onDown(context)).catch(error => console.error("Slow Insert | Native dismiss failed", error));
      return true;
    }
    this.close();
    return true;
  }

  onDocumentKeydown(event) {
    if (event.key !== "Escape") return;
    if (this.onEscape(event, { forwardNative: true })) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onKeydown(event) {
    if (event.isComposing) return;
    if (event.target === this.input && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(this.searchTimer);
      // Flush a pending query before Enter so it cannot open a stale result.
      if (this.renderedQuery !== this.input.value) {
        this.refresh();
      }
      if (!this.results.length) return;
      if (event.key === "Enter") void this.openItem(this.selected);
      else this.select((this.selected + (event.key === "ArrowDown" ? 1 : -1) + this.results.length) % this.results.length);
    }
  }

  async openItem(index) {
    if (!this.allowed()) return;
    const item = this.results[index]?.item;
    if (!item) return;
    this.select(index, false);
    try {
      await item.show();
    } catch (error) {
      console.error("Slow Insert | Could not open item", error);
      ui.notifications.warn(t("Status.OpenFailed"));
    }
  }

  onDragStart(event) {
    const row = event.target.closest(".si-result");
    const item = row && this.results[Number(row.dataset.index)]?.item;
    if (!item || !this.allowed() || !event.dataTransfer) { event.preventDefault(); return; }
    // Standard Foundry document drag data; destinations enforce their own permissions.
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: item.documentType, uuid: item.uuid }));
    event.dataTransfer.effectAllowed = "copy";
  }

  destroy() {
    clearTimeout(this.searchTimer);
    clearTimeout(this.catalogTimer);
    cancelAnimationFrame(this.positionFrame);
    this.events.abort();
    this.resizeObserver?.disconnect();
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.root.remove();
    this.launcher.remove();
  }
}
