import { t } from "./i18n.mjs";
import { resolveSource } from "./source.mjs";
import { crLabel, itemTypeLabel } from "./filters.mjs";
import { sortValueLabel } from "./sorting.mjs";

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

/** Renders already selected/ordered implementations. Never queries the index
 * or chooses another representative for opening/dragging. */
export class ResultsView {
  constructor({ list, input, idPrefix }) {
    Object.assign(this, { list, input, idPrefix });
    this.results = [];
    this.rowElements = [];
    this.selected = -1;
    this.expandedGroups = new Set();
    this.renderedGroups = new Map();
  }

  clear() {
    this.results = [];
    this.rowElements = [];
    this.selected = -1;
    this.list.replaceChildren();
    this.input.removeAttribute("aria-activedescendant");
    this.input.setAttribute("aria-expanded", "false");
  }

  render(groups, context, append = false) {
    this.context = context;
    const { environment, pins } = context;
    if (!append) {
      this.results = [];
      this.rowElements = [];
      this.renderedGroups = new Map();
      this.list.replaceChildren();
    }
    for (const group of groups) this.renderedGroups.set(group.key, group);
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const wrapper = element("div", "si-result-group");
      wrapper.setAttribute("role", "group");
      wrapper.setAttribute("aria-label", group.representative.result.item.name);
      const heading = element("div", "si-group-heading");
      heading.append(this.renderRow(group.representative, group, environment));
      wrapper.append(heading);
      if (group.members.length > 1) {
        const expanded = this.expandedGroups.has(group.key);
        const toggle = this.groupAction("expand", group, t(expanded ? "Grouping.Collapse" : "Grouping.Expand", { count: group.members.length }));
        toggle.setAttribute("aria-label", toggle.textContent);
        toggle.classList.add("si-group-toggle");
        toggle.replaceChildren();
        const count = element("span", "si-toggle-count", String(group.members.length));
        const chevron = element("span", "si-toggle-chevron");
        count.setAttribute("aria-hidden", "true");
        chevron.setAttribute("aria-hidden", "true");
        toggle.append(count, chevron);
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.title = t(group.kind === "exact" ? "Grouping.ExactHint" : "Grouping.FamilyHint");
        const childrenId = `${this.idPrefix}-members-${this.results.length}`;
        toggle.setAttribute("aria-controls", childrenId);
        heading.append(toggle);
        const children = element("div", "si-group-members");
        children.id = childrenId;
        children.hidden = !expanded;
        if (expanded) for (const entry of group.members) {
          const member = element("div", "si-member");
          member.append(this.renderRow(entry, group, environment, true));
          const pinned = pins[group.key] === entry.uuid;
          const pin = this.groupAction(pinned ? "unpin" : "pin", group, t(pinned ? "Grouping.Unpin" : "Grouping.Pin"));
          pin.dataset.uuid = entry.uuid;
          pin.classList.add("si-pin");
          pin.setAttribute("aria-label", pin.textContent);
          pin.setAttribute("aria-pressed", String(pinned));
          pin.title = pin.textContent;
          pin.replaceChildren();
          const star = element("i", `${pinned ? "fa-solid" : "fa-regular"} fa-star`);
          star.setAttribute("aria-hidden", "true");
          pin.append(star);
          const exclude = this.groupAction("exclude", group, t("Grouping.Exclude"));
          exclude.dataset.uuid = entry.uuid;
          exclude.classList.add("si-exclude");
          exclude.title = exclude.textContent;
          exclude.setAttribute("aria-label", exclude.textContent);
          const unlink = element("i", "fa-solid fa-link-slash");
          unlink.setAttribute("aria-hidden", "true");
          exclude.replaceChildren(unlink);
          member.append(pin, exclude);
          children.append(member);
        }
        wrapper.append(children);
      }
      fragment.append(wrapper);
    }
    this.list.append(fragment);
  }

  groupAction(action, group, label) {
    const control = element("button", "si-group-button", label);
    control.type = "button";
    control.dataset.groupAction = action;
    control.dataset.group = group.key;
    return control;
  }

  renderRow(entry, group, environment, member = false) {
    const { item } = entry.result;
    const index = this.results.length;
    this.results.push({ ...entry.result, group });
    const source = resolveSource(item, environment);
    const row = element("button", "si-result");
    row.type = "button";
    row.tabIndex = -1;
    row.draggable = true;
    row.dataset.index = String(index);
    row.id = `${this.idPrefix || "slow-insert"}-result-${index}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.title = `${item.name}\n${source.title}\n${item.uuid}`;
    row.dataset.uuid = item.uuid;
    const image = element("img", "si-image");
    image.src = item.img || (item.documentType === "Actor" ? "icons/svg/mystery-man.svg" : "icons/svg/item-bag.svg");
    image.alt = ""; image.loading = "lazy"; image.draggable = false;
    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
    const label = element("span", "si-label");
    const nameLine = element("span", "si-name-line");
    if (entry.risk) {
      const hint = t(`Grouping.Risk.${entry.risk}`);
      const risk = element("span", "si-risk");
      risk.setAttribute("role", "img");
      risk.setAttribute("aria-label", hint);
      risk.title = hint;
      risk.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 19 18H1Z"/><path class="si-risk-mark" d="M10 7v5m0 2v1"/></svg>';
      nameLine.append(risk);
      row.title += `\n${hint}`;
    }
    nameLine.append(element("span", "si-name", item.name || t("Panel.Unnamed")));
    label.append(nameLine);
    const data = this.context.dataFor(item);
    const subtitle = data?.monster ? t("Panel.MonsterCR", { cr: data.cr === null ? t("Unknown") : crLabel(data.cr) })
      : itemTypeLabel(item.subType, this.context.typeLabels[item.documentType], environment) || t("Panel.Item");
    const details = [subtitle];
    const sortKeys = this.context.sortKeys;
    for (const key of sortKeys) {
      if (key.field === "cr" && data?.monster) continue;
      const value = sortValueLabel(key.field, item, data, environment);
      if (value && !details.includes(value)) details.push(value);
    }
    if (group.members.length > 1) {
      details.push(group.rules);
      if (!member && group.kind === "exact") details.push(t("Grouping.Exact"));
      if (member) {
        if (entry.uuid === group.representative.uuid) details.push(t("Grouping.Default"));
        for (const tag of entry.tags) details.push(t(`Grouping.Tag.${tag}`));
      }
    }
    const detailText = details.filter(Boolean).join(" · ");
    const typeLabel = element("span", "si-type", detailText);
    typeLabel.title = detailText;
    label.append(typeLabel);
    if (member) label.append(element("span", "si-pack", item.packageName || item.package || entry.uuid));
    if (entry.warning) {
      const warning = element("span", "si-warning", t(`Grouping.Review.${entry.warning}`));
      warning.title = t("Grouping.ReviewHint");
      label.append(warning);
    }
    const badge = element("span", `si-source si-source--${source.kind}${source.external ? " si-source--external" : ""}`, source.label);
    badge.dataset.sourceStatus = source.status;
    badge.title = group.members.length > 1 && !member ? t("Grouping.DefaultSource", { source: source.title }) : source.title;
    row.append(image, label, badge);
    this.rowElements.push(row);
    return row;
  }

  select(index, scroll = true) {
    this.rowElements[this.selected]?.setAttribute("aria-selected", "false");
    this.selected = index;
    const row = this.rowElements[index];
    if (!row) { this.input.removeAttribute("aria-activedescendant"); return; }
    row.setAttribute("aria-selected", "true");
    this.input.setAttribute("aria-activedescendant", row.id);
    if (scroll) row.scrollIntoView({ block: "nearest" });
  }

}
