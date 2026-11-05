import { t } from './i18n.mjs';
import { SORT_FIELDS, effectiveSort, normalizeSorting, sortFieldLabel } from './sorting.mjs';

const SORT_DRAG_TYPE = 'application/x-slow-insert-sort-rule';
function el(tag, cls, text) {
  const element = document.createElement(tag);
  element.className = cls;
  if (text) element.textContent = text;
  return element;
}
function btn(label, text) {
  const button = el('button', 'si-sort-button', text);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  return button;
}

export class SortControls {
  constructor({ state, scheme, onChange }) {
    this.state = normalizeSorting(state);
    this.scheme = scheme;
    this.query = '';
    this.onChange = onChange;
    this.root = el('div', 'si-sort-editor');
    this.draggedRuleIndex = null;
    this.update(scheme, '');
  }

  get profile() { return this.state.profiles[this.scheme]; }
  get keys() { return effectiveSort(this.profile, this.scheme, this.query); }

  commit() {
    this.state = normalizeSorting(this.state);
    this.update(this.scheme, this.query);
    this.onChange(this.state);
  }

  editRules(edit) {
    const keys = this.keys.map(key => ({ ...key }));
    edit(keys);
    this.profile.mode = 'manual';
    this.profile.keys = keys;
    this.commit();
  }

  option(select, value, label) {
    const option = el('option', '', label);
    option.value = value;
    select.append(option);
  }

  update(scheme, query) {
    // A query/profile refresh invalidates an in-flight drag before rebuilding rows.
    this.clearDrag();
    this.scheme = scheme;
    this.query = query;
    this.renderEditor();
  }

  moveRule(from, to) {
    const count = this.keys.length;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0
      || from >= count || to >= count || from === to) return;
    this.editRules(keys => keys.splice(to, 0, keys.splice(from, 1)[0]));
    this.root.querySelectorAll('.si-sort-number')[to]?.focus();
  }

  clearDropTarget() {
    for (const row of this.root.querySelectorAll('.si-sort-rule')) row.removeAttribute('data-drop-position');
  }

  clearDrag() {
    this.draggedRuleIndex = null;
    this.clearDropTarget();
    for (const row of this.root.querySelectorAll('.si-sort-rule')) row.removeAttribute('data-dragging');
  }

  acceptsDrag(event) {
    // External document drops and drags from other panels must not reorder rules.
    return this.draggedRuleIndex !== null && event.dataTransfer?.types.includes(SORT_DRAG_TYPE);
  }

  bindReordering(row, handle, index) {
    handle.draggable = this.keys.length > 1;
    handle.disabled = !handle.draggable;
    handle.addEventListener('keydown', event => {
      const target = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: this.keys.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      this.moveRule(index, target);
    });
    handle.addEventListener('dragstart', event => {
      if (!handle.draggable || !event.dataTransfer) { event.preventDefault(); return; }
      this.clearDrag();
      this.draggedRuleIndex = index;
      event.dataTransfer.setData(SORT_DRAG_TYPE, String(index));
      event.dataTransfer.effectAllowed = 'move';
      row.setAttribute('data-dragging', 'true');
      event.stopPropagation();
    });
    handle.addEventListener('dragend', () => this.clearDrag());
    row.addEventListener('dragover', event => {
      if (!this.acceptsDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      this.clearDropTarget();
      if (index !== this.draggedRuleIndex) {
        row.setAttribute('data-drop-position', index < this.draggedRuleIndex ? 'before' : 'after');
      }
    });
    row.addEventListener('dragleave', event => {
      if (!row.contains(event.relatedTarget)) row.removeAttribute('data-drop-position');
    });
    row.addEventListener('drop', event => {
      if (!this.acceptsDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const from = this.draggedRuleIndex;
      this.clearDrag();
      this.moveRule(from, index);
    });
  }

  renderEditor() {
    const focused = this.root.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    const profile = this.profile, keys = this.keys;
    this.root.replaceChildren();
    keys.forEach((key, index) => {
      const row = el('div', 'si-sort-rule');
      const handle = btn(t('Sort.Reorder', { n: index + 1 }), String(index + 1));
      handle.classList.add('si-sort-number');
      handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End');
      this.bindReordering(row, handle, index);
      const select = el('select', 'si-sort-select');
      select.setAttribute('aria-label', t('Sort.Rule', { n: index + 1 }));
      for (const field of ['relevance', ...SORT_FIELDS[this.scheme]]) {
        if (field === key.field || !keys.some(other => other.field === field)) this.option(select, field, sortFieldLabel(field));
      }
      select.value = key.field;
      select.addEventListener('change', () => this.editRules(rules => { rules[index] = { field: select.value, direction: 'asc' }; }));
      const direction = btn(t('Sort.RuleDirection', { n: index + 1 }), key.direction === 'asc' ? '↑' : '↓');
      direction.disabled = key.field === 'relevance';
      direction.addEventListener('click', () => this.editRules(rules => {
        rules[index].direction = rules[index].direction === 'asc' ? 'desc' : 'asc';
      }));
      const remove = btn(t('Sort.Remove', { n: index + 1 }), '×');
      remove.disabled = keys.length === 1;
      remove.addEventListener('click', () => {
        this.editRules(rules => rules.splice(index, 1));
        this.root.querySelector('.si-sort-rule select')?.focus();
      });
      row.append(handle, select, direction, remove);
      this.root.append(row);
    });
    const actions = el('div', 'si-sort-actions');
    const add = btn(t('Sort.Add'), t('Sort.Add'));
    add.disabled = keys.length >= 3;
    add.addEventListener('click', () => {
      this.editRules(rules => rules.push({ field: SORT_FIELDS[this.scheme].find(field => !rules.some(key => key.field === field)), direction: 'asc' }));
      this.root.querySelectorAll('.si-sort-rule select')[this.keys.length - 1]?.focus();
    });
    const reset = btn(t('Sort.Reset'), t('Sort.Reset'));
    reset.addEventListener('click', () => {
      profile.mode = 'auto';
      this.commit();
      this.root.querySelector('.si-sort-rule select')?.focus();
    });
    actions.append(add, reset);
    this.root.append(actions);
    const label = el('label', 'si-sort-language', t('Sort.NameOrder'));
    const order = el('select', 'si-sort-select');
    this.option(order, 'local', t('Sort.Local'));
    this.option(order, 'english', t('Sort.English'));
    order.value = profile.nameOrder;
    order.addEventListener('change', () => { profile.nameOrder = order.value; this.commit(); });
    order.setAttribute('aria-label', t('Sort.NameOrder'));
    label.append(order);
    this.root.append(label);
    if (focused) {
      for (const control of this.root.querySelectorAll('[aria-label]')) {
        if (control.getAttribute('aria-label') === focused) { control.focus(); break; }
      }
    }
  }
}
