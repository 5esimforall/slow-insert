import { t } from './i18n.mjs';

/** Store only geometry, never transient z-index/scale/native frame state. */
export function normalizeBrowsePosition(value) {
  const result = {};
  for (const key of ['width', 'height', 'left', 'top']) {
    const number = value?.[key];
    if (typeof number === 'number' && Number.isFinite(number) && (!['width', 'height'].includes(key) || number > 0)) result[key] = number;
  }
  return result;
}

export function browseWindowPosition(viewport, anchor, previous) {
  previous = normalizeBrowsePosition(previous);
  const width = Math.min(previous?.width || 740, Math.max(280, viewport.width - 24));
  const height = Math.min(previous?.height || 760, Math.max(240, viewport.height - 32));
  const left = Math.max(12, Math.min(previous?.left ?? ((anchor?.left ?? viewport.width) - width - 16), viewport.width - width - 12));
  const top = Math.max(16, Math.min(previous?.top ?? 64, viewport.height - height - 16));
  return { width, height, left, top };
}

/** Native frame owns dragging, resizing, stacking, focus and Escape dismissal. */
export function createBrowseWindow(panel) {
  class BrowseWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ['si-browse-window'],
      window: { title: 'SLOWINSERT.Browse.Title', icon: 'fa-solid fa-sliders', resizable: true, minimizable: false },
      position: { width: 740, height: 760 }
    };
    async _renderHTML() { return panel.browseContent; }
    _replaceHTML(content, host) { host.replaceChildren(content); }
    _onRender(context, options) {
      super._onRender(context, options);
      this.element.setAttribute('role', 'dialog');
      this.element.setAttribute('aria-label', t('Browse.Title'));
      panel.browseButton.setAttribute('aria-expanded', 'true');
      if (options.isFirstRender) panel.filterControls.scheme.focus();
    }
    _onPosition(position) {
      super._onPosition(position);
      // Save as geometry changes, not only on close: reload can happen while open.
      this.rememberPosition(position);
    }
    rememberPosition(position) {
      const next = normalizeBrowsePosition(position);
      if (Object.keys(next).length !== 4 || JSON.stringify(next) === JSON.stringify(panel.browsePosition)) return;
      panel.browsePosition = next;
      void panel.save('browsePosition', next);
    }
    _onClose(options) {
      super._onClose(options);
      this.rememberPosition(this.position);
      panel.browseButton.setAttribute('aria-expanded', 'false');
      if (!panel.destroyed && (panel.visible && (panel.sidebarHost.app.isPopout || globalThis.ui?.sidebar?.expanded)) && options.restoreFocus !== false) panel.browseButton.focus();
    }
  }
  return new BrowseWindow({ id: `${panel.idPrefix}-browse`, window: { title: t('Browse.Title') } });
}
