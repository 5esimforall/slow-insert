import { catalog } from "./catalog-api.mjs";
import { QuickInsertIndex } from "./quick-insert-index.mjs";
import { BrowseSession } from "./browse-session.mjs";
import { ResultsView } from "./results-view.mjs";
import { createGroupingLink } from "./grouping-link.mjs";
import { preferenceSettingKey } from "./grouping-state.mjs";
import { createBrowseWindow, browseWindowPosition } from "./browse-window.mjs";
import { normalizeSorting, effectiveSort } from "./sorting.mjs";
import { SortControls } from "./sort-controls.mjs";
import { t } from "./i18n.mjs";
import { documentDragData } from "./source.mjs";
import { SCHEMES, activeFilters, normalizeFilters, setScheme } from "./filters.mjs";
import { FilterControls, createFilterSwitch } from "./filter-controls.mjs";
import { normalizeGrouping, reconcilePins } from "./grouping.mjs";
import { hidesRevisedContent, RULES_CHANGED } from "./rules-visibility.mjs";

export const MODULE_ID = "slow-insert";
export const MODULE_VERSION = "0.6.22";

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
    this.events = new AbortController();
    this.hooks = [];
    this.filters = normalizeFilters(game.settings.get(MODULE_ID, "filters"));
    this.sorting = normalizeSorting(game.settings.get(MODULE_ID, "sorting"));
    this.grouping = normalizeGrouping(game.settings.get(MODULE_ID, preferenceSettingKey(game.world, game.user?.id ?? game.userId)));
    this.browsePosition = game.settings.get(MODULE_ID, "browsePosition");
    this.searchInWindow = game.settings.get(MODULE_ID, "searchInWindow") === true;
    this.collapseDiagnostics = game.settings.get(MODULE_ID, "collapseDiagnostics") === true;
    this.diagnosticsExpanded = false;
    this.dnd5e = game.system.id === "dnd5e";
    if (!this.dnd5e) this.filters = setScheme(this.filters, "items");
    this.index = new QuickInsertIndex({
      isVisible: () => this.searchVisible,
      onInvalidate: () => this.session.invalidate(),
      onRefresh: () => this.refresh(),
      onStateChange: () => { this.reindexButton.disabled = this.index.indexing; },
      onFailure: () => { this.status.textContent = t("Status.IndexFailed"); }
    });
    this.session = new BrowseSession(this.index, { onCatalog: catalog => {
      this.filterControls.setOptions(catalog.options);
    } });
  }

  allowed() {
    return this.index.allowed();
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.events.signal });
  }

  mount(sidebarHost) {
    this.sidebarHost = sidebarHost;
    this.idPrefix = sidebarHost.app.isPopout ? "slow-insert-popout" : "slow-insert";
    this.root = element("aside", "slow-insert truesight-theme");
    this.root.id = sidebarHost.app.isPopout ? "slow-insert-popout-panel" : "slow-insert-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Slow Insert");
    this.searchContent = element("div", "slow-insert truesight-theme si-search-content");
    this.searchContent.setAttribute("aria-label", t("Panel.Label"));

    const header = element("header", "si-header");
    this.reindexButton = button(t("Panel.Reindex"), "fa-arrows-rotate");
    this.searchSwapButton = this.createSwapButton();
    header.append(this.reindexButton, this.searchSwapButton);

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
    this.input.setAttribute("aria-controls", `${this.idPrefix}-results`);
    this.input.setAttribute("aria-expanded", "false");
    searchBox.append(searchIcon, this.input);
    const searchRow = element("div", "si-search-row");
    this.browseButton = button(t("Browse.Title"), "fa-sliders");
    this.browseButton.classList.add("si-browse-button");
    this.browseButton.setAttribute("aria-haspopup", "dialog");
    this.browseButton.setAttribute("aria-expanded", "false");
    this.browseButton.setAttribute("aria-controls", `${this.idPrefix}-browse`);
    searchRow.append(this.browseButton, searchBox);
    this.listen(this.browseButton, "click", () => {
      if (this.searchInWindow) {
        this.sidebarHost.app.activate();
        this.filterControls.scheme.focus();
      } else void this.openBrowseWindow();
    });

    this.filterControls = new FilterControls({
      state: this.filters, dnd5e: this.dnd5e,
      expansion: game.settings.get(MODULE_ID, "filterExpansion"),
      onExpansionChange: state => { void this.save("filterExpansion", state); },
      onChange: state => {
        this.filters = state;
        clearTimeout(this.searchTimer);
        void this.save("filters", state);
        this.refresh();
      }
    });

    if (this.dnd5e) header.insertBefore(this.filterControls.createSchemeSelect(), this.reindexButton);
    this.filterControls.drawer.id = `${this.idPrefix}-filters`;
    this.filterControls.toggle.setAttribute("aria-controls", this.filterControls.drawer.id);

    this.sortControls = new SortControls({ state: this.sorting, scheme: this.filters.scheme,
      onChange: state => {
        this.sorting = state;
        clearTimeout(this.searchTimer);
        void this.save("sorting", state);
        this.refresh();
      }
    });
    const copies = createFilterSwitch({ label: t("Grouping.ShowCopies"), hint: t("Grouping.ToggleHint") });
    this.groupToggle = copies.input;
    this.groupToggleState = copies.state;
    this.filterControls.displayOptions.append(copies.root);
    this.listen(this.groupToggle, "change", () => {
      this.grouping = { ...this.grouping, enabled: !this.groupToggle.checked };
      void this.save("grouping", this.grouping);
      this.refresh();
    });

    const diagnostics = createFilterSwitch({ label: t("Diagnostics.Option"), hint: t("Diagnostics.Hint") });
    this.diagnosticsControl = diagnostics;
    this.filterControls.displayOptions.append(diagnostics.root);
    this.listen(diagnostics.input, "change", () => {
      this.collapseDiagnostics = diagnostics.input.checked;
      void this.save("collapseDiagnostics", this.collapseDiagnostics);
      this.refresh();
    });

    this.buildBrowseContent();

    this.status = element("div", "si-status");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.list = element("div", "si-results");
    this.list.id = `${this.idPrefix}-results`;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", t("Panel.ResultsLabel"));
    this.view = new ResultsView({ list: this.list, input: this.input, idPrefix: this.idPrefix });

    this.searchContent.append(header, searchRow, this.status, this.list);
    this.root.append(this.searchInWindow ? this.browseContent : this.searchContent);
    this.updateLayoutControls();
    sidebarHost.content.append(this.root);

    this.listen(this.reindexButton, "click", () => this.index.buildIndex());
    this.listen(this.input, "input", event => {
      clearTimeout(this.searchTimer);
      if (!event.isComposing) this.searchTimer = setTimeout(() => this.refresh(), 100);
    });
    this.listen(this.input, "compositionend", () => {
      clearTimeout(this.searchTimer);
      this.refresh();
    });
    for (const content of [this.searchContent, this.browseContent]) {
      this.listen(content, "keydown", event => this.onShortcut(event));
    }
    this.listen(this.searchContent, "keydown", event => this.onKeydown(event));
    this.listen(this.list, "click", event => {
      const action = event.target.closest("[data-group-action]");
      if (action) { this.onGroupAction(action); return; }
      const row = event.target.closest(".si-result");
      if (row) void this.openItem(Number(row.dataset.index));
    });
    this.listen(this.list, "scroll", () => {
      if (this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 160) this.loadMore();
    });
    this.listen(this.list, "dragstart", event => this.onDragStart(event));
    this.hooks.push(["truesightChanged", Hooks.on("truesightChanged", change => {
      if (change.reason === "apply" && ["ready", "unreviewed"].includes(change.status)) {
        const pins = reconcilePins(this.grouping.pins, catalog.read().entries);
        if (JSON.stringify(pins) !== JSON.stringify(this.grouping.pins)) {
          this.grouping = {...this.grouping, pins}; void this.save("grouping", this.grouping);
        }
      }
      this.session.invalidate();
      if (change.changes?.includes("access")) this.refresh();
      else this.index.scheduleRefresh();
    })]);
    this.hooks.push(["slowInsertPreferencesChanged", Hooks.on("slowInsertPreferencesChanged", value => {
      this.grouping = normalizeGrouping(value); this.session.invalidate(); this.refresh();
    })]);
    this.hooks.push([RULES_CHANGED, Hooks.on(RULES_CHANGED, () => {
      this.session.invalidate();
      this.session.clear();
      this.refresh();
    })]);
    this.hooks.push(["slowInsertDiagnosticsChanged", Hooks.on("slowInsertDiagnosticsChanged", enabled => {
      if (this.collapseDiagnostics === enabled) return;
      this.collapseDiagnostics = enabled;
      this.refresh();
    })]);
    this.index.connect();
  }

  buildBrowseContent() {
    const filters = this.filterControls, sorting = this.sortControls;
    this.browseContent = element("div", "slow-insert truesight-theme si-browse-content");
    const top = element("header", "si-header");
    this.browseSummary = element("span", "si-browse-summary");
    this.browseSummary.setAttribute("role", "status");
    this.filterSwapButton = this.createSwapButton();
    this.searchWindowButton = button(t("Panel.Label"), "fa-magnifying-glass");
    this.searchWindowButton.setAttribute("aria-haspopup", "dialog");
    this.searchWindowButton.setAttribute("aria-controls", `${this.idPrefix}-browse`);
    this.listen(this.searchWindowButton, "click", () => { void this.openBrowseWindow(); });
    top.append(filters.scheme, this.searchWindowButton, this.filterSwapButton);
    const columns = element("div", "si-browse-columns");
    const left = element("section", "si-browse-filters");
    const filterHeader = element("div", "si-browse-section-header");
    filterHeader.append(element("h3", "", t("Browse.Filters")), filters.reset);
    // Retain the live controls rather than cloning them; closing never resets state.
    filters.focusTarget = filters.scheme;
    filters.drawer.querySelector(".si-filter-reset-row").remove();
    filters.setExpanded(true);
    left.append(filterHeader, filters.active, filters.drawer);
    const right = element("div", "si-browse-right");
    const sortSection = element("section", "si-browse-sort");
    sortSection.append(element("h3", "", t("Sort.Advanced")), sorting.root);
    const display = element("section", "si-browse-display");
    display.append(element("h3", "", t("Browse.Display")), filters.displayOptions);
    right.append(sortSection, display, createGroupingLink());
    columns.append(left, right);
    this.browseContent.append(top, this.browseSummary, columns);
  }

  get searchVisible() {
    return this.searchInWindow ? Boolean(this.browseWindow?.rendered) : this.visible;
  }

  createSwapButton() {
    const control = button(t("Layout.Swap"), "fa-right-left");
    control.classList.add("si-layout-swap");
    this.listen(control, "click", () => { void this.swapLayout(); });
    return control;
  }

  updateLayoutControls() {
    for (const control of [this.searchSwapButton, this.filterSwapButton]) {
      control.title = t(this.searchInWindow ? "Layout.SearchInSidebar" : "Layout.SearchInWindow");
      control.setAttribute("aria-label", control.title);
      control.setAttribute("aria-pressed", String(this.searchInWindow));
    }
    this.searchWindowButton.hidden = !this.searchInWindow;
    this.searchWindowButton.setAttribute("aria-expanded", String(this.searchInWindow && Boolean(this.browseWindow?.rendered)));
    this.browseButton.setAttribute("aria-controls", this.searchInWindow ? this.root.id : `${this.idPrefix}-browse`);
    if (this.searchInWindow) {
      this.browseButton.removeAttribute("aria-haspopup");
      this.browseButton.removeAttribute("aria-expanded");
    } else {
      this.browseButton.setAttribute("aria-haspopup", "dialog");
      this.browseButton.setAttribute("aria-expanded", String(Boolean(this.browseWindow?.rendered)));
    }
  }

  async swapLayout() {
    if (this.destroyed || this.swappingLayout || !this.allowed()) return;
    this.swappingLayout = true;
    const columns = this.browseContent.querySelector(".si-browse-columns");
    const scroll = { results: this.list.scrollTop, filters: columns.scrollTop };
    for (const control of [this.searchSwapButton, this.filterSwapButton]) control.disabled = true;
    try {
      this.searchInWindow = !this.searchInWindow;
      // Move the same live trees; no search, control rebuild or result selection reset.
      this.root.replaceChildren(this.searchInWindow ? this.browseContent : this.searchContent);
      this.updateLayoutControls();
      await this.openBrowseWindow({ replaceContent: true });
      if (this.destroyed) return;
      this.list.scrollTop = scroll.results;
      columns.scrollTop = scroll.filters;
      await this.save("searchInWindow", this.searchInWindow);
      if (this.destroyed) return;
      if (!this.searchInWindow) this.sidebarHost.app.activate();
      this.input.focus();
    } finally {
      this.swappingLayout = false;
      for (const control of [this.searchSwapButton, this.filterSwapButton]) control.disabled = false;
    }
  }

  async openBrowseWindow({ replaceContent = false } = {}) {
    if (this.windowRender) await this.windowRender;
    if (this.destroyed || !this.allowed()) return;
    if (!this.browseWindow) this.browseWindow = createBrowseWindow(this);
    if (this.browseWindow.rendered && !replaceContent) {
      this.browseWindow.bringToFront();
      if (this.searchInWindow) this.input.focus();
      return;
    }
    this.windowRender = this.browseWindow.render({ force: true,
      window: { title: t(this.searchInWindow ? "Panel.Label" : "Browse.Title"),
        icon: this.searchInWindow ? "fa-solid fa-magnifying-glass" : "fa-solid fa-sliders" },
      position: this.browseWindow.rendered ? undefined : browseWindowPosition(
      { width: window.innerWidth, height: window.innerHeight }, this.root.getBoundingClientRect(), this.browsePosition) });
    try { await this.windowRender; }
    finally { this.windowRender = null; }
    if (this.destroyed) await this.browseWindow.close({ animate: false, restoreFocus: false });
  }

  updateBrowseSummary() {
    const count = activeFilters(this.filters).length;
    const custom = this.sorting.profiles[this.filters.scheme].mode === "manual";
    this.browseButton?.classList.toggle("si-browse-active", count > 0 || custom || this.filters.includeExternal || !this.grouping.enabled || this.collapseDiagnostics);
    if (this.browseSummary) this.browseSummary.textContent = t("Browse.Summary", {
      scheme: t(SCHEMES[this.filters.scheme].label), count
    });
    if (this.browseButton) this.browseButton.title = `${t("Browse.Title")} · ${t(SCHEMES[this.filters.scheme].label)} · ${t("Browse.FilterCount", { count })}`;
  }

  openOrSwap(event) {
    if (this.destroyed || !this.allowed() || event?.isComposing) return false;
    if (event?.repeat || this.swappingLayout) return true;
    const app = this.sidebarHost.app;
    const sidebarOpen = app.isPopout ? app.rendered : app.active && ui.sidebar.expanded;
    if (sidebarOpen || this.browseWindow?.rendered) void this.swapLayout();
    else this.open();
    return true;
  }

  onShortcut(event) {
    if (event.defaultPrevented || event.isComposing) return;
    // Foundry suppresses bindings in inputs. Handle only this action inside our
    // live content trees, using its current bindings and native key semantics.
    const keyboard = game.keyboard.constructor;
    const context = keyboard.getKeyboardEventContext(event);
    if (!keyboard._getMatchingActions(context).some(action => action.action === `${MODULE_ID}.toggle`)) return;
    if (!this.openOrSwap(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  toggle() {
    const active = this.searchInWindow ? this.browseWindow?.rendered : this.sidebarHost.app.active && ui.sidebar.expanded;
    active ? this.close() : this.open();
  }

  activateSidebar() {
    if (!this.allowed()) return;
    this.visible = true;
    this.root.hidden = false;
    if (!this.session.page || this.renderedQuery !== this.input.value) this.refresh();
    else if (this.session.catalog?.index !== this.index.identity) this.refresh(true);
    this.index.scheduleInitialIndex();
    if (this.searchInWindow) void this.openBrowseWindow();
  }

  deactivateSidebar() {
    if (this.sidebarHost.app.isPopout) return;
    this.visible = false;
    clearTimeout(this.searchTimer);
    void this.save("query", this.input.value);
  }

  open() {
    if (!this.allowed()) return;
    this.sidebarHost.app.activate();
    this.activateSidebar();
    if (!this.searchInWindow) this.input.focus();
  }

  close() {
    if (this.sidebarHost.app.isPopout) void this.sidebarHost.app.close();
    else {
      ui.sidebar.collapse();
      if (this.searchInWindow) void this.browseWindow?.close({ restoreFocus: false });
      this.input.blur();
    }
  }

  async save(key, value) {
    try {
      if (key === "grouping") {
        const preferences = normalizeGrouping(value);
        await game.settings.set(MODULE_ID, preferenceSettingKey(game.world, game.user?.id ?? game.userId), preferences);
        this.grouping = preferences;
        Hooks.callAll("slowInsertPreferencesChanged", preferences);
      } else await game.settings.set(MODULE_ID, key, value);
    } catch (error) {
      console.warn("Slow Insert | Could not save client preference", error);
      ui.notifications.warn(t("Grouping.SaveFailed"));
    }
  }

  clearResults(message) {
    this.session.clear();
    this.view.clear();
    this.status.textContent = message;
  }

  registerPublications(providerId, records) { return catalog.registerPublications(providerId, records); }
  unregisterPublications(providerId) { return catalog.unregisterPublications(providerId); }

  refresh(preservePage = false) {
    const scrollTop = preservePage ? this.list.scrollTop : 0;
    if (!this.visible && !this.browseWindow?.rendered) return;
    if (!preservePage) this.diagnosticsExpanded = false;
    this.diagnosticsControl.input.checked = this.collapseDiagnostics;
    this.diagnosticsControl.state.textContent = t(this.collapseDiagnostics ? "Diagnostics.Collapsed" : "Diagnostics.Inline");
    this.updateBrowseSummary();
    this.groupToggle.checked = !this.grouping.enabled;
    this.groupToggleState.textContent = t(this.grouping.enabled ? "Grouping.CopiesGrouped" : "Grouping.CopiesShown");
    if (!this.allowed()) { this.clearResults(t("Status.Unavailable")); return; }
    if (this.index.failed) { this.clearResults(t("Status.IndexFailed")); return; }
    if (this.index.indexing) { this.clearResults(t("Status.Indexing")); return; }
    if (!this.index.hasIndex) { this.clearResults(t("Status.Waiting")); return; }
    const query = this.input.value.trim();
    this.renderedQuery = this.input.value;
    this.sortControls.update(this.filters.scheme, query);
    try {
      const page = this.session.search({ query, filters: this.filters, sorting: this.sorting,
        grouping: this.grouping, collapseDiagnostics: this.collapseDiagnostics,
        diagnosticsExpanded: this.diagnosticsExpanded,
        hideRevised: hidesRevisedContent(game, MODULE_ID), preservePage });
      this.renderResults(page.groups.slice(0, page.shown), page.environment);
      this.updateResultCount();
      this.list.scrollTop = scrollTop;
      this.input.setAttribute("aria-expanded", String(this.view.results.length > 0));
      this.view.select(this.view.results.length ? 0 : -1, false);
    } catch (error) {
      console.error("Slow Insert | Search failed", error);
      this.clearResults(t("Status.SearchFailed"));
    }
  }

  updateResultCount() {
    const page = this.session.page;
    const diagnosticCount = page.diagnosticGroups.length;
    const total = page.groups.length + diagnosticCount;
    this.status.textContent = total ? t("Grouping.Status", {
      count: page.shown + (page.diagnosticsExpanded ? page.diagnosticPageSize : 0), total,
      raw: page.rawCount, scheme: t(SCHEMES[page.scheme].label)
    }) : t("Status.NoResults");
    if (diagnosticCount && !page.diagnosticsExpanded) this.status.textContent += ` · ${t("Diagnostics.HiddenCount", { count: diagnosticCount })}`;
  }

  loadMore() {
    const next = this.session.nextPage({ visible: this.searchVisible, query: this.input.value, scheme: this.filters.scheme });
    if (!next) return;
    if (next.diagnostic) this.view.appendDiagnostics(next.groups);
    else this.renderResults(next.groups, next.environment, true);
    this.updateResultCount();
  }

  renderResults(groups, environment, append = false) {
    this.view.render(groups, {
      environment, pins: this.grouping.pins,
      dataFor: item => this.session.catalog.dataCache.get(item),
      sortKeys: effectiveSort(this.sorting.profiles[this.filters.scheme], this.filters.scheme, this.input.value),
      typeLabels: { Item: CONFIG.Item?.typeLabels, Actor: CONFIG.Actor?.typeLabels }
    }, append);
    if (!append) {
      const page = this.session.page;
      this.view.renderDiagnostics(page.diagnosticGroups.slice(0, page.diagnosticPageSize), {
        count: page.diagnosticGroups.length, expanded: page.diagnosticsExpanded,
        onToggle: () => {
          this.diagnosticsExpanded = !this.diagnosticsExpanded;
          this.refresh(true);
          this.view.diagnosticToggle?.focus();
        }
      });
    }
  }

  async onGroupAction(control) {
    const group = this.view.renderedGroups?.get(control.dataset.group);
    if (!group) return;
    const action = control.dataset.groupAction;
    if (action === "inspect") {
      if (control.disabled || globalThis.game?.user?.isGM !== true
        || !group.members.some(entry => entry.uuid === control.dataset.uuid)) return;
      control.disabled = true;
      try { await catalog.openReview({memberUuid: control.dataset.uuid}); }
      catch (error) { console.error(error); ui.notifications.warn(t("Grouping.OpenFailed")); }
      finally { control.disabled = false; }
      return;
    }
    if (action === "expand") {
      if (this.view.expandedGroups.has(group.key)) this.view.expandedGroups.delete(group.key);
      else this.view.expandedGroups.add(group.key);

    } else if (action === "pin" && group.members.some(entry => entry.uuid === control.dataset.uuid)) {
      this.grouping = { ...this.grouping, pins: { ...this.grouping.pins, [group.key]: control.dataset.uuid } };
    } else if (action === "unpin") {
      const pins = { ...this.grouping.pins }; delete pins[group.key];
      this.grouping = { ...this.grouping, pins };
    } else return;
    if (action !== "expand") void this.save("grouping", this.grouping);
    this.refresh(true);
    const index = this.view.results.findIndex(result => result.group?.key === group.key);
    if (index >= 0) this.view.select(index, false);
    this.input.focus();
  }

  onKeydown(event) {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.target === this.input && ["ArrowRight", "ArrowLeft"].includes(event.key)
      && event.altKey && !event.ctrlKey && !event.metaKey) {
      const group = this.view.results[this.view.selected]?.group;
      if (group?.members.length > 1 && this.view.expandedGroups.has(group.key) !== (event.key === "ArrowRight")) {
        event.preventDefault(); event.stopPropagation();
        this.onGroupAction({ dataset: { group: group.key, groupAction: "expand" } });
      }
      return;
    }
    if (event.target === this.input && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(this.searchTimer);
      // Flush a pending query before Enter so it cannot open a stale result.
      if (this.renderedQuery !== this.input.value) {
        this.refresh();
      }
      if (!this.view.results.length) return;
      if (event.key === "Enter") void this.openItem(this.view.selected);
      else this.view.select((this.view.selected + (event.key === "ArrowDown" ? 1 : -1) + this.view.results.length) % this.view.results.length);
    }
  }

  async openItem(index) {
    if (!this.allowed()) return;
    const item = this.view.results[index]?.item;
    if (!item) return;
    this.view.select(index, false);
    try {
      await item.show();
    } catch (error) {
      console.error("Slow Insert | Could not open item", error);
      ui.notifications.warn(t("Status.OpenFailed"));
    }
  }

  onDragStart(event) {
    const row = event.target.closest(".si-result");
    const item = row && this.view.results[Number(row.dataset.index)]?.item;
    if (!item || !this.allowed() || !event.dataTransfer) { event.preventDefault(); return; }
    // Standard Foundry document drag data; destinations enforce their own permissions.
    event.dataTransfer.setData("text/plain", JSON.stringify(documentDragData(item)));
    event.dataTransfer.effectAllowed = "copy";
  }

  destroy() {
    this.destroyed = true;
    void this.browseWindow?.close({ animate: false, restoreFocus: false });
    this.index.destroy();
    clearTimeout(this.searchTimer);
    this.events.abort();
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.root.remove();
    this.searchContent.remove();
    this.browseContent.remove();
  }
}
