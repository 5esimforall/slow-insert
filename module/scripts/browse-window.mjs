import { t } from './i18n.mjs';

export function browseWindowPosition(viewport, anchor, previous) {
  const width = Math.min(previous?.width || 740, Math.max(280, viewport.width - 24));
  const height = Math.min(previous?.height || 660, Math.max(240, viewport.height - 32));
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
      position: { width: 740, height: 660 }
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
    _onClose(options) {
      super._onClose(options);
      panel.browsePosition = { ...this.position };
      panel.browseButton.setAttribute('aria-expanded', 'false');
      if (!panel.destroyed && (panel.visible && (!panel.sidebarHost || panel.sidebarHost.app.isPopout || globalThis.ui?.sidebar?.expanded)) && options.restoreFocus !== false) panel.browseButton.focus();
    }
  }
  return new BrowseWindow({ id: `${panel.idPrefix}-browse`, window: { title: t('Browse.Title') } });
}
