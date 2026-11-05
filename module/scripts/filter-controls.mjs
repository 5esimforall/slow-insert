import { t } from "./i18n.mjs";
import { SCHEMES, GROUPS, CR_OPTIONS, crLabel, activeFilters, normalizeFilters, resetProfile, setGroup, setScheme } from "./filters.mjs";

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function button(className, text) {
  const el = node("button", className, text);
  el.type = "button";
  return el;
}

/** Shared presentation for the display options at the bottom of the drawer. */
export function createFilterSwitch({ label, ariaLabel = label, hint }) {
  const root = node("label", "si-filter-switch");
  root.title = hint;
  const title = node("span", "si-filter-switch-title", label);
  const state = node("span", "si-filter-switch-state");
  state.setAttribute("aria-hidden", "true");
  const input = node("input", "");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", ariaLabel);
  root.append(title, state, input);
  return { root, input, state };
}

export function normalizeFilterExpansion(value) {
  const result = {};
  for (const [scheme, { groups }] of Object.entries(SCHEMES)) {
    result[scheme] = {};
    for (const id of groups) if (typeof value?.[scheme]?.[id] === "boolean") result[scheme][id] = value[scheme][id];
  }
  return result;
}

/** The 本书速查 interaction: scheme-specific checkbox groups with All/Clear. */
export class FilterControls {
  constructor({ state, dnd5e, onChange, expansion, onExpansionChange }) {
    this.state = normalizeFilters(state);
    this.onChange = onChange;
    this.expansion = normalizeFilterExpansion(expansion);
    this.onExpansionChange = onExpansionChange;
    this.options = {};
    this.root = node("div", "si-filters");
    const schemeRow = node("label", "si-scheme-row");
    schemeRow.append(node("span", "", t("Filter.Scheme")));
    this.dnd5e = dnd5e;
    this.schemeSelectors = [];
    this.scheme = this.createSchemeSelect();
    schemeRow.append(this.scheme);
    const toolbar = node("div", "si-filter-toolbar");
    this.toggle = button("si-filter-toggle", t("Filter.Show"));
    this.toggle.setAttribute("aria-controls", "slow-insert-filters");
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.addEventListener("click", () => this.setExpanded(!this.expanded));
    this.reset = button("si-filter-reset", t("Filter.Reset"));
    this.reset.setAttribute("aria-label", t("Filter.ResetLabel"));
    this.reset.title = t("Filter.ResetHint");
    this.reset.addEventListener("click", () => {
      this.state = resetProfile(this.state);
      this.updateState();
      this.onChange(this.state);
      (this.focusTarget ?? this.toggle).focus();
    });
    this.toolbar = toolbar;
    toolbar.append(this.toggle);
    this.active = node("div", "si-filter-active");
    this.active.setAttribute("aria-label", t("Filter.Active"));
    this.drawer = node("div", "si-filter-drawer");
    this.drawer.id = "slow-insert-filters";
    this.drawer.hidden = true;
    this.drawer.setAttribute("role", "region");
    this.drawer.setAttribute("aria-label", t("Filter.Region"));
    this.drawer.title = t("Filter.Help");
    this.body = node("div", "si-filter-groups");
    const external = createFilterSwitch({ label: t("Filter.ExternalTitle"),
      ariaLabel: t("Filter.IncludeExternal"), hint: t("Filter.ExternalHelp") });
    this.externalToggle = external.input;
    this.externalState = external.state;
    this.externalToggle.addEventListener("change", () => {
      this.state = normalizeFilters({ ...this.state, includeExternal: this.externalToggle.checked });
      this.updateState();
      this.onChange(this.state);
    });
    this.displayOptions = node("div", "si-display-options");
    this.displayOptions.append(external.root);
    const resetRow = node("div", "si-filter-reset-row");
    resetRow.append(this.reset);
    this.drawer.append(resetRow, this.body, this.displayOptions);
    this.root.append(schemeRow, toolbar, this.active, this.drawer);
    this.renderGroups();
  }

  createSchemeSelect() {
    const select = node("select", "si-scheme");
    select.setAttribute("aria-label", t("Filter.Scheme"));
    select.title = t("Filter.Scheme");
    for (const [id, { label }] of Object.entries(SCHEMES)) {
      if (!this.dnd5e && id !== "items") continue;
      const option = node("option", "", t(label));
      option.value = id;
      select.append(option);
    }
    select.value = this.state.scheme;
    select.addEventListener("change", () => this.selectScheme(select.value));
    this.schemeSelectors.push(select);
    return select;
  }

  selectScheme(id) {
    if (id === this.state.scheme) return;
    this.state = setScheme(this.state, id);
    for (const select of this.schemeSelectors) select.value = this.state.scheme;
    this.renderGroups();
    this.setExpanded(true);
    this.onChange(this.state);
  }

  setExpanded(value, focus = false) {
    this.expanded = value;
    this.onExpanded?.(value);
    this.drawer.hidden = !value;
    this.toggle.setAttribute("aria-expanded", String(value));
    this.updateState();
    if (focus) (this.focusTarget ?? this.toggle).focus();
  }
  setOptions(options) { this.options = options; this.renderGroups(); }

  renderGroups() {
    const sameScheme = this.renderedScheme === this.state.scheme;
    // Snapshot before replacement as native toggle events may still be queued.
    for (const details of this.body.querySelectorAll("details")) this.rememberExpansion(this.renderedScheme, details.dataset.group, details.open);
    const query = sameScheme ? this.sourceSearch?.value || "" : "";
    this.renderedScheme = this.state.scheme;
    this.body.replaceChildren();
    this.checks = [];
    this.groups = [];
    this.ranges = [];
    if (!this.options[this.state.scheme]) {
      this.body.append(node("p", "si-filter-help", t("Status.Waiting")));
      this.updateState();
      return;
    }
    for (const id of SCHEMES[this.state.scheme].groups) {
      const group = GROUPS[id];
      const details = node("details", "si-filter-group");
      details.dataset.group = id;
      const scheme = this.state.scheme;
      details.open = this.expansion[scheme][id] ?? !["source", "special", "mundane"].includes(id);
      let lastOpen = details.open;
      details.addEventListener("toggle", () => {
        if (!this.body.contains(details) || details.open === lastOpen) return;
        lastOpen = details.open;
        this.rememberExpansion(scheme, id, details.open);
      });
      details.append(node("summary", "", t(group.label)));
      if (group.range) {
        const row = node("div", "si-cr-range");
        for (const [bound, title] of [["min", t("Filter.Minimum")], ["max", t("Filter.Maximum")]]) {
          const label = node("label", "", title);
          const select = node("select", "");
          select.setAttribute("aria-label", t("Filter.CRBound", { bound: title }));
          const any = node("option", "", t("Filter.Unlimited"));
          any.value = "";
          select.append(any);
          for (const cr of CR_OPTIONS) {
            const option = node("option", "", crLabel(cr));
            option.value = String(cr);
            select.append(option);
          }
          select.addEventListener("change", () => this.changeGroup(id, {
            ...this.state.profiles[this.state.scheme][id], [bound]: select.value === "" ? null : Number(select.value)
          }));
          label.append(select);
          row.append(label);
          this.ranges.push({ select, bound });
        }
        details.append(row);
      } else {
        const actions = node("div", "si-group-actions");
        const count = node("span", "si-group-count");
        const clear = button("si-group-action", t("Filter.Clear"));
        clear.setAttribute("aria-label", t("Filter.GroupAction", { group: t(group.label), action: t("Filter.Clear") }));
        clear.addEventListener("click", () => this.changeGroup(id, []));
        if (!group.optional) {
          const all = button("si-group-action", t("Filter.All"));
          all.setAttribute("aria-label", t("Filter.GroupAction", { group: t(group.label), action: t("Filter.All") }));
          all.addEventListener("click", () => this.changeGroup(id, null));
          actions.append(all);
        }
        actions.append(clear, count);
        details.append(actions);
        this.groups.push({ id, count });
        if (id === "source") {
          this.sourceSearch = node("input", "si-filter-source-search");
          this.sourceSearch.type = "search";
          this.sourceSearch.placeholder = t("Filter.SourcePlaceholder");
          this.sourceSearch.setAttribute("aria-label", t("Filter.SourceLabel"));
          this.sourceSearch.value = query;
          this.sourceSearch.addEventListener("input", () => this.filterSources());
          details.append(this.sourceSearch);
          this.sourceSearch.title = t("Source.FilterHelp");
        }
        if (id === "classes") details.querySelector("summary").title = t("Filter.ClassesHelp");
        const choices = node("div", "si-filter-options");
        let sourceSection;
        for (const option of this.options[this.state.scheme][id] ?? []) {
          if (id === "source" && option.section !== sourceSection) {
            sourceSection = option.section;
            const heading = node("div", "si-source-section", t(sourceSection === "review" ? "Source.ReviewSection" : "Source.BooksSection"));
            heading.dataset.section = sourceSection;
            choices.append(heading);
          }
          const label = node("label", "si-filter-choice");
          label.title = t("Filter.OptionHint", { title: option.title, count: option.count });
          if (id === "source") label.dataset.sourceStatus = option.section;
          const input = node("input", "");
          input.type = "checkbox";
          input.setAttribute("aria-label", t("Filter.OptionLabel", { group: t(group.label), option: option.label }));
          input.addEventListener("change", () => {
            const values = this.options[this.state.scheme][id].map(x => x.value);
            const selected = new Set(this.state.profiles[this.state.scheme][id] ?? values);
            input.checked ? selected.add(option.value) : selected.delete(option.value);
            const all = !group.optional && selected.size === values.length && values.every(value => selected.has(value));
            this.changeGroup(id, all ? null : [...selected]);
          });
          label.append(input, node("span", "", option.label));
          choices.append(label);
          this.checks.push({ id, option, input, label });
        }
        if (!choices.childElementCount) choices.append(node("span", "si-filter-help", t("Filter.NoOptions")));
        details.append(choices);
      }
      this.body.append(details);
    }
    this.filterSources();
    this.updateState();
  }

  rememberExpansion(scheme, id, open) {
    if (!SCHEMES[scheme]?.groups.includes(id) || this.expansion[scheme][id] === open) return;
    this.expansion[scheme][id] = open;
    this.onExpansionChange?.(structuredClone(this.expansion));
  }

  filterSources() {
    const query = this.sourceSearch?.value.trim().toLocaleLowerCase() || "";
    for (const { id, option, label } of this.checks ?? []) {
      if (id === "source") label.hidden = !`${option.label} ${option.title} ${option.searchText || ""}`.toLocaleLowerCase().includes(query);
    }
    for (const heading of this.body.querySelectorAll(".si-source-section")) {
      heading.hidden = !this.checks.some(({ id, option, label }) => id === "source" && option.section === heading.dataset.section && !label.hidden);
    }
  }
  changeGroup(id, selected) {
    this.state = setGroup(this.state, id, selected);
    this.updateState();
    this.onChange(this.state);
  }
  updateState() {
    this.externalToggle.checked = this.state.includeExternal;
    this.externalState.textContent = t(this.state.includeExternal ? "Filter.ExternalIncluded" : "Filter.ExternalHidden");
    const active = activeFilters(this.state);
    const toggleLabel = t(this.expanded ? "Filter.Hide" : "Filter.Show");
    this.toggle.textContent = active.length ? t("Filter.ToggleCount", { label: toggleLabel, count: active.length }) : toggleLabel;
    this.toggle.setAttribute("aria-label", this.toggle.textContent);
    this.reset.disabled = !active.length;
    this.active.hidden = !active.length;
    this.active.replaceChildren();
    const profile = this.state.profiles[this.state.scheme];
    for (const { id, option, input, label } of this.checks ?? []) {
      input.checked = profile[id] === null || profile[id].includes(option.value);
      label.dataset.checked = String(input.checked);
    }
    for (const { id, count } of this.groups ?? []) {
      const selected = profile[id];
      count.textContent = selected === null ? t("Filter.AllSelected") : t("Filter.SelectedCount", { count: selected.length });
    }
    for (const { select, bound } of this.ranges ?? []) select.value = profile.cr[bound] === null ? "" : String(profile.cr[bound]);
    for (const { group, selected } of active) {
      const config = GROUPS[group];
      const value = config.range ? `${selected.min === null ? t("Filter.Unlimited") : crLabel(selected.min)}–${selected.max === null ? t("Filter.Unlimited") : crLabel(selected.max)}`
        : selected.length ? t("Filter.SelectedCount", { count: selected.length }) : t("Filter.NoneSelected");
      const chip = button("si-filter-active-chip", t("Filter.ActiveChip", { group: t(config.label), value }));
      chip.setAttribute("aria-label", t("Filter.ResetGroup", { group: t(config.label) }));
      chip.addEventListener("click", () => {
        this.changeGroup(group, config.range ? { min: null, max: null } : config.optional ? [] : null);
        (this.focusTarget ?? this.toggle).focus();
      });
      this.active.append(chip);
    }
  }
}
