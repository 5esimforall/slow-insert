import { QuickInsertIndex } from "./quick-insert-index.mjs";
import { BrowseSession } from "./browse-session.mjs";
import { ResultsView } from "./results-view.mjs";
import { GroupingControls } from "./grouping-controls.mjs";
import { groupingSettingKey, normalizeGroupingState } from "./grouping-state.mjs";
import { createBrowseWindow, browseWindowPosition } from "./browse-window.mjs";
import { normalizeSorting, effectiveSort } from "./sorting.mjs";
import { SortControls } from "./sort-controls.mjs";
import { t } from "./i18n.mjs";
import { getDockLayout, documentDragData } from "./source.mjs";
import { SCHEMES, activeFilters, normalizeFilters, setScheme } from "./filters.mjs";
import { FilterControls, createFilterSwitch } from "./filter-controls.mjs";
import { normalizeGrouping } from "./grouping.mjs";
import { hidesRevisedContent, RULES_CHANGED } from "./rules-visibility.mjs";

export const MODULE_ID = "slow-insert";
export const MODULE_VERSION = "0.6.6";

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
    this.width = game.settings.get(MODULE_ID, "width");
    this.events = new AbortController();
    this.hooks = [];
    this.filters = normalizeFilters(game.settings.get(MODULE_ID, "filters"));
    this.sorting = normalizeSorting(game.settings.get(MODULE_ID, "sorting"));
    this.groupingState = normalizeGroupingState(game.settings.get(MODULE_ID, groupingSettingKey(game.world)), game.settings.get(MODULE_ID, "grouping"));
    this.grouping = this.groupingState.preferences;
    this.browsePosition = game.settings.get(MODULE_ID, "browsePosition");
    this.dnd5e = game.system.id === "dnd5e";
    if (!this.dnd5e) this.filters = setScheme(this.filters, "items");
    this.index = new QuickInsertIndex({
      isVisible: () => this.visible,
      onInvalidate: () => this.session.invalidate(),
      onRefresh: () => this.refresh(),
      onStateChange: () => { this.reindexButton.disabled = this.index.indexing; },
      onFailure: () => { this.status.textContent = t("Status.IndexFailed"); }
    });
    this.session = new BrowseSession(this.index, { onCatalog: catalog => {
      this.filterControls.setOptions(catalog.options);
      this.groupingControls?.update(catalog.grouping);
    } });
  }

  allowed() {
    return this.index.allowed();
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.events.signal });
  }

  mount(sidebarHost = null) {
    this.sidebarHost = sidebarHost;
    this.idPrefix = sidebarHost?.app.isPopout ? "slow-insert-popout" : "slow-insert";
    this.root = element("aside", "slow-insert");
    this.root.id = sidebarHost?.app.isPopout ? "slow-insert-popout-panel" : "slow-insert-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", t("Panel.Label"));

    const header = element("header", "si-header");
    const heading = element("div", "si-heading");
    // A running server can retain the previous manifest version until restart.
    heading.append(element("h2", "", "Slow Insert"), element("span", "si-version", MODULE_VERSION));
    this.reindexButton = button(t("Panel.Reindex"), "fa-arrows-rotate");
    this.closeButton = button(t("Panel.Close"), "fa-xmark");
    header.append(heading, this.reindexButton);
    if (!sidebarHost) header.append(this.closeButton);

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
    this.listen(this.browseButton, "click", () => { void this.openBrowseWindow(); });

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

    this.sortControls = new SortControls({ state: this.sorting, scheme: this.filters.scheme, id: this.idPrefix,
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

    this.groupingControls = new GroupingControls({
      getState: () => this.groupingState,
      getPreferences: () => this.grouping,
      getCatalog: () => this.session.catalog?.grouping,
      isAllowed: () => this.allowed(),
      canBuild: () => this.allowed() && this.index.hasIndex && !this.index.indexing,
      isDestroyed: () => this.destroyed,
      readIndex: () => ({ results: this.index.search("", () => true),
        environment: this.index.sourceEnvironment(this.session.publicationProviders) }),
      commit: state => this.commitGroupingState(state),
      setPending: pending => this.browseButton.classList.toggle("si-grouping-pending", pending)
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

    this.resizeHandle = element("div", "si-resize");
    this.resizeHandle.tabIndex = 0;
    this.resizeHandle.setAttribute("role", "separator");
    this.resizeHandle.setAttribute("aria-label", t("Panel.Resize"));
    this.resizeHandle.setAttribute("aria-orientation", "vertical");
    this.resizeHandle.setAttribute("aria-valuemin", "280");
    this.resizeHandle.setAttribute("aria-valuemax", "560");
    if (!sidebarHost) this.root.append(this.resizeHandle);
    this.root.append(header, searchRow, this.status, this.list);

    this.launcher = button(t("Panel.Launcher"), "fa-magnifying-glass");
    this.launcher.id = "slow-insert-toggle";
    this.launcher.className = "si-launcher";
    this.launcher.append(element("span", "", "Slow Insert"));
    this.launcher.setAttribute("aria-controls", this.root.id);
    this.launcher.setAttribute("aria-expanded", "false");
    if (sidebarHost) {
      this.root.classList.add("si-native");
      sidebarHost.content.append(this.root);
    } else document.body.append(this.root, this.launcher);

    this.listen(this.launcher, "click", () => this.toggle());
    this.listen(this.closeButton, "click", () => this.close());
    this.listen(this.reindexButton, "click", () => this.index.buildIndex());
    this.listen(this.input, "input", event => {
      clearTimeout(this.searchTimer);
      if (!event.isComposing) this.searchTimer = setTimeout(() => this.refresh(), 100);
    });
    this.listen(this.input, "compositionend", () => {
      clearTimeout(this.searchTimer);
      this.refresh();
    });
    this.listen(this.root, "keydown", event => this.onKeydown(event));
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
    if (!sidebarHost) {
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
    }
    this.hooks.push(["slowInsertGroupingChanged", Hooks.on("slowInsertGroupingChanged", state => {
      this.groupingState = normalizeGroupingState(state);
      this.grouping = this.groupingState.preferences;
      this.session.invalidate();
      this.refresh();
    })]);
    this.hooks.push([RULES_CHANGED, Hooks.on(RULES_CHANGED, () => {
      this.session.invalidate();
      this.session.clear();
      this.refresh();
    })]);
    this.index.connect();
    this.position();
  }

  buildBrowseContent() {
    const filters = this.filterControls, sorting = this.sortControls;
    this.browseContent = element("div", "slow-insert si-browse-content");
    const top = element("div", "si-browse-top");
    this.browseSummary = element("span", "si-browse-summary");
    this.browseSummary.setAttribute("role", "status");
    top.append(filters.scheme.parentElement, this.browseSummary);
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
    sortSection.append(element("h3", "", t("Browse.Sorting")), sorting.root, sorting.drawer);
    sorting.more.hidden = true;
    sorting.setExpanded(true);
    const display = element("section", "si-browse-display");
    display.append(element("h3", "", t("Browse.Display")), filters.displayOptions);
    right.append(sortSection, display, this.groupingControls.root);
    columns.append(left, right);
    this.browseContent.append(top, columns);
  }

  async openBrowseWindow() {
    if (this.destroyed || !this.allowed()) return;
    if (!this.browseWindow) this.browseWindow = createBrowseWindow(this);
    if (this.browseWindow.rendered) { this.browseWindow.bringToFront(); return; }
    await this.browseWindow.render({ force: true, position: browseWindowPosition(
      { width: window.innerWidth, height: window.innerHeight }, this.root.getBoundingClientRect(), this.browsePosition) });
    if (this.destroyed) await this.browseWindow.close({ animate: false, restoreFocus: false });
  }

  updateBrowseSummary() {
    const count = activeFilters(this.filters).length;
    const custom = this.sorting.profiles[this.filters.scheme].mode === "manual";
    this.browseButton?.classList.toggle("si-browse-active", count > 0 || custom || this.filters.includeExternal || !this.grouping.enabled);
    if (this.browseSummary) this.browseSummary.textContent = t("Browse.Summary", {
      scheme: t(SCHEMES[this.filters.scheme].label), count
    });
    if (this.browseButton) this.browseButton.title = `${t("Browse.Title")} · ${t(SCHEMES[this.filters.scheme].label)} · ${t("Browse.FilterCount", { count })}`;
  }

  schedulePosition() {
    if (this.positionFrame) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null;
      this.position();
    });
  }

  position() {
    if (this.sidebarHost) return;
    const sidebar = document.getElementById("sidebar");
    const bounds = sidebar?.getBoundingClientRect();
    const sidebarLeft = bounds?.width && bounds.height ? bounds.left : window.innerWidth;
    const { right, width } = getDockLayout(window.innerWidth, sidebarLeft, this.width);
    this.root.style.right = `${right}px`;
    this.root.style.width = `${width}px`;
    this.launcher.style.right = `${right}px`;
    this.resizeHandle.setAttribute("aria-valuenow", String(Math.round(width)));
  }

  toggle() {
    const active = this.sidebarHost ? this.sidebarHost.app.active && ui.sidebar.expanded : this.visible;
    active ? this.close() : this.open();
  }

  activateSidebar() {
    if (!this.allowed()) return;
    this.visible = true;
    this.root.hidden = false;
    if (!this.session.page || this.renderedQuery !== this.input.value.trim()) this.refresh();
    else if (this.session.catalog?.index !== this.index.identity) this.refresh(true);
    this.index.scheduleInitialIndex();
  }

  deactivateSidebar() {
    if (this.sidebarHost?.app.isPopout) return;
    this.visible = false;
    clearTimeout(this.searchTimer);
    void this.save("query", this.input.value);
  }

  open() {
    if (!this.allowed()) return;
    if (this.sidebarHost) {
      this.sidebarHost.app.activate();
      this.activateSidebar();
      this.input.focus();
      return;
    }
    if (!this.visible) this.previousFocus = document.activeElement;
    this.visible = true;
    this.root.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute("aria-expanded", "true");
    this.position();
    this.input.focus();
    this.input.select();
    this.refresh();
    this.index.scheduleInitialIndex();
  }

  close() {
    if (this.sidebarHost) {
      if (this.sidebarHost.app.isPopout) void this.sidebarHost.app.close();
      else { ui.sidebar.collapse(); this.input.blur(); }
      return;
    }
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
    try {
      if (key === "grouping") await this.commitGroupingState({ ...this.groupingState, preferences: normalizeGrouping(value) });
      else await game.settings.set(MODULE_ID, key, value);
    }
    catch (error) { console.warn("Slow Insert | Could not save client preference", error); if (key === "grouping") { this.grouping = this.groupingState.preferences; ui.notifications.warn(t("Grouping.SaveFailed")); } }
  }

  async commitGroupingState(state) {
    // Persist before changing live membership. Storage quota/errors must leave
    // both the applied snapshot and its undo slot untouched.
    await game.settings.set(MODULE_ID, groupingSettingKey(game.world), state);
    this.groupingState = normalizeGroupingState(state);
    this.grouping = this.groupingState.preferences;
    this.session.invalidate();
    Hooks.callAll("slowInsertGroupingChanged", this.groupingState);
    this.refresh(true);
  }

  clearResults(message) {
    this.session.clear();
    this.view.clear();
    this.status.textContent = message;
  }

  registerPublications(providerId, records) {
    if (typeof providerId !== "string" || !providerId.trim() || !Array.isArray(records)) throw new TypeError("Expected a provider id and publication records");
    const registered = structuredClone(records);
    this.session.publicationProviders.set(providerId, registered);
    this.session.invalidate();
    if (this.visible) this.refresh();
    return () => this.session.publicationProviders.get(providerId) === registered && this.unregisterPublications(providerId);
  }

  unregisterPublications(providerId) {
    const removed = this.session.publicationProviders.delete(providerId);
    if (removed) {
      this.session.invalidate();
      if (this.visible) this.refresh();
    }
    return removed;
  }

  refresh(preservePage = false) {
    const scrollTop = preservePage ? this.list.scrollTop : 0;
    if (!this.visible && !this.browseWindow?.rendered) return;
    this.updateBrowseSummary();
    this.groupingControls?.update(this.session.catalog?.grouping);
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
        grouping: this.grouping, snapshot: this.groupingState.active,
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
    this.status.textContent = page.groups.length ? t("Grouping.Status", {
      count: page.shown, total: page.groups.length, raw: page.rawCount, scheme: t(SCHEMES[page.scheme].label)
    }) : t("Status.NoResults");
  }

  loadMore() {
    const next = this.session.nextPage({ visible: this.visible, query: this.input.value, scheme: this.filters.scheme });
    if (!next) return;
    this.renderResults(next.groups, next.environment, true);
    this.updateResultCount();
  }

  renderResults(groups, environment, append = false) {
    this.view.render(groups, {
      environment, pins: this.grouping.pins,
      dataFor: item => this.session.catalog.dataCache.get(item),
      sortKeys: effectiveSort(this.sorting.profiles[this.filters.scheme], this.filters.scheme, this.input.value),
      typeLabels: { Item: CONFIG.Item?.typeLabels, Actor: CONFIG.Actor?.typeLabels }
    }, append);
  }

  onGroupAction(control) {
    const group = this.view.renderedGroups?.get(control.dataset.group);
    if (!group) return;
    const action = control.dataset.groupAction;
    if (action === "expand") {
      if (this.view.expandedGroups.has(group.key)) this.view.expandedGroups.delete(group.key);
      else this.view.expandedGroups.add(group.key);

    } else if (action === "pin" && group.members.some(entry => entry.uuid === control.dataset.uuid)) {
      this.grouping = { ...this.grouping, pins: { ...this.grouping.pins, [group.key]: control.dataset.uuid } };
    } else if (action === "exclude" && group.members.some(entry => entry.uuid === control.dataset.uuid)) {
      this.grouping = { ...this.grouping, excluded: [...new Set([...this.grouping.excluded, control.dataset.uuid])] };
    } else if (action === "unpin") {
      const pins = { ...this.grouping.pins }; delete pins[group.key];
      this.grouping = { ...this.grouping, pins };
    }
    if (action !== "expand") void this.save("grouping", this.grouping);
    this.refresh(true);
    const index = this.view.results.findIndex(result => result.group?.key === group.key);
    if (index >= 0) this.view.select(index, false);
    this.input.focus();
  }

  onKeydown(event) {
    if (event.isComposing) return;
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
    this.groupingControls?.destroy();
    void this.browseWindow?.close({ animate: false, restoreFocus: false });
    this.index.destroy();
    clearTimeout(this.searchTimer);
    cancelAnimationFrame(this.positionFrame);
    this.events.abort();
    this.resizeObserver?.disconnect();
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.root.remove();
    this.launcher.remove();
  }
}
