import { SlowInsertPanel } from "./panel.mjs";

export const SIDEBAR_TAB = "slowinsert";

/** Register through Foundry's native sidebar lifecycle, before UI construction. */
export function registerSidebar() {
  class SlowInsertSidebar extends foundry.applications.sidebar.AbstractSidebarTab {
    static tabName = SIDEBAR_TAB;
    static DEFAULT_OPTIONS = { classes: ["slow-insert-sidebar"], window: { title: "Slow Insert", icon: "fa-solid fa-magnifying-glass" } };

    async _renderHTML() { return null; }
    _replaceHTML(_result, content) {
      if (!this.panel) {
        this.panel = new SlowInsertPanel();
        this.panel.mount({ app: this, content });
      } else content.append(this.panel.root);
    }
    _onActivate() { this.panel?.activateSidebar(); }
    _onDeactivate() { this.panel?.deactivateSidebar(); }
    async _onRender(context, options) {
      await super._onRender(context, options);
      if (this.active || this.isPopout) this.panel?.activateSidebar();
    }
    async _onClose(options) {
      this.panel?.destroy();
      this.panel = null;
      super._onClose(options);
    }
  }
  CONFIG.ui[SIDEBAR_TAB] = SlowInsertSidebar;
  CONFIG.ui.sidebar.TABS[SIDEBAR_TAB] = {
    tooltip: "SLOWINSERT.Panel.Launcher", icon: "fa-solid fa-magnifying-glass",
    gmOnly: game.settings.get("quick-insert", "gmOnly")
  };
}
