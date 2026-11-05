import {t} from './i18n.mjs';
import {catalog} from './catalog-api.mjs';
const node = (tag, text) => {const el = document.createElement(tag); if (text) el.textContent = text; return el;};
export class GroupingControls {
  constructor({getCatalog, canBuild, setPending}) {
    Object.assign(this, {getCatalog, canBuild, setPending});
    this.root = node('section'); this.root.className = 'si-grouping-controls';
    this.status = node('p'); this.status.setAttribute('role', 'status');
    const button = (key, action) => {const el = node('button', t(`Grouping.${key}`)); el.type = 'button'; el.onclick = async () => {
      try {await action();} catch (error) {console.error('Slow Insert | Truesight', error); ui.notifications.warn(t('Grouping.SaveFailed'));}
    }; return el;};
    this.rebuild = button('Rebuild', () => catalog.openReview());
    this.undo = button('Undo', () => catalog.undo());
    this.restore = button('RestoreExcluded', () => catalog.restoreExcluded());
    this.root.append(node('h3', t('Grouping.Title')), this.status, this.rebuild, this.undo, this.restore);
  }
  update(data) {
    const state = catalog.getStatus();
    this.status.textContent = t(!state.reviewed ? 'Grouping.NotBuilt' : data?.changed ? 'Grouping.Changed' : 'Grouping.Current', {count: data?.changed ?? 0});
    if (!['ready', 'unreviewed'].includes(state.status)) this.status.textContent = t('Grouping.Unavailable', {reason: state.reason ?? state.status});
    this.undo.disabled = !state.canUndo;
    this.restore.hidden = !data?.excludedCount;
    this.rebuild.disabled = !this.canBuild();
    this.setPending(!state.reviewed || Boolean(data?.changed));
  }
  destroy() {}
}
