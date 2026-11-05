/** Minimal Foundry v13 host contract, not a second Slow Insert implementation.
 * Mirrors AbstractSidebarTab activation/popout and Sidebar tab/collapse callbacks.
 * Production registerSidebar supplies the subclass and all panel lifecycle code.
 */
export function installSidebarFixture(Application) {
  CONFIG.ui = { sidebar: { TABS: { chat: { tooltip: 'Chat' } } } };
  const sidebar = document.querySelector('#sidebar');
  const content = sidebar.querySelector('.sidebar-content');
  ui.sidebar = {
    tabGroups: { primary: 'chat' }, popouts: {}, expanded: true,
    changeTab(tab, group = 'primary') {
      const previous = this.tabGroups[group];
      if (previous === tab) return;
      this.tabGroups[group] = tab;
      ui[previous]?._onDeactivate();
      for (const element of content.children) element.classList.toggle('active', element.dataset.tab === tab);
      for (const button of sidebar.querySelectorAll('[role=tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
      ui[tab]?._onActivate();
      Hooks.callAll('changeSidebarTab', ui[tab]);
    },
    collapse() { this.toggleExpanded(false); },
    expand() { this.toggleExpanded(true); },
    toggleExpanded(expanded = !this.expanded) {
      this.expanded = expanded;
      sidebar.classList.toggle('collapsed', !expanded);
      // Foundry collapse changes geometry, not the selected tab/lifecycle.
      Hooks.callAll('collapseSidebar', this, !expanded);
    }
  };
  class FixtureSidebarTab extends Application {
    constructor(options = {}) {
      super(options);
      this.hasFrame = Boolean(options.window?.frame);
    }
    get tabName() { return this.constructor.tabName; }
    get active() { return ui.sidebar.tabGroups.primary === this.tabName; }
    get isPopout() { return this.hasFrame; }
    activate() {
      if (this.isPopout) this.bringToFront();
      else { ui.sidebar.changeTab(this.tabName); ui.sidebar.expand(); }
    }
    async render(options = {}) {
      if (this.isPopout) return super.render(options);
      if (this.popout?.rendered) await this.popout.render(options);
      const first = !this.rendered;
      if (first) {
        this.element = document.createElement('section');
        this.element.className = ['tab', 'sidebar-tab', ...this.constructor.DEFAULT_OPTIONS.classes].join(' ');
        this.element.dataset.tab = this.tabName;
        this.element.classList.toggle('active', this.active);
        this.content = this.element;
        content.append(this.element);
      }
      this._replaceHTML(await this._renderHTML(), this.content);
      this.rendered = true;
      await this._onRender({}, { isFirstRender: first });
      return this;
    }
    async renderPopout() {
      if (!this.popout) this.popout = new this.constructor({ window: { ...this.options.window, frame: true },
        position: { width: 340, height: 560, left: 40, top: 80 } });
      await this.popout.render({ force: true });
      ui.sidebar.popouts[this.tabName] = this.popout;
      return this.popout;
    }
    _onClose(options) {
      super._onClose(options);
      if (this.isPopout) delete ui.sidebar.popouts[this.tabName];
    }
  }
  foundry.applications.sidebar = { AbstractSidebarTab: FixtureSidebarTab };
}

export function mountSidebarFixture() {
  const tabs = document.querySelector('#sidebar [role=tablist]');
  for (const [name, definition] of Object.entries(CONFIG.ui.sidebar.TABS)) {
    if (definition.gmOnly && !game.user.isGM) continue;
    const button = document.createElement('button');
    button.dataset.tab = name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(ui.sidebar.tabGroups.primary === name));
    button.textContent = game.i18n.localize(definition.tooltip);
    button.onclick = () => { ui.sidebar.changeTab(name); ui.sidebar.expand(); };
    tabs.append(button);
    if (CONFIG.ui[name]) ui[name] = new CONFIG.ui[name]();
  }
  document.querySelector('#collapse').onclick = () => ui.sidebar.toggleExpanded();
  document.querySelector('#popout').onclick = () => ui.slowinsert.renderPopout();
  document.querySelector('#rerender').onclick = () => ui.slowinsert.render({ force: true });
}
