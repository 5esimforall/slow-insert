// Executed by the fixture's “Run browser checks” button; no browser-driver dependency.
// Synthetic events check application wiring; real pointer/focus/geometry checks use MCP.
export const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export async function until(predicate, message) {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`Timed out: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
export function change(control, value) {
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}
export function key(input, key) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
}
export async function query(panel, value, count) {
  panel.input.value = value;
  panel.input.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => panel.renderedQuery === value && panel.list.querySelectorAll('.si-result').length === count, `query ${value}: ${count} rows`);
}
export function checker() {
  const checks = [];
  return { checks, check(condition, message) { if (!condition) throw new Error(message); checks.push(message); } };
}

export async function runBrowserChecks() {
  const { checks, check } = checker();
  const tab = ui.slowinsert, panel = tab.panel;
  check([...document.querySelectorAll('#sidebar [role=tab]')].map(button => button.dataset.tab).join(',') === 'chat,slowinsert,settings',
    'search tab appears immediately before settings');
  check(tab instanceof CONFIG.ui.slowinsert && panel.sidebarHost.app === tab, 'production registration mounts the panel inside the sidebar host');
  check(panel.root.parentElement === tab.content && !document.querySelector('#slow-insert-toggle, .si-resize'), 'no body-mounted search panel, launcher or resize handle');
  document.querySelector('[role=tab][data-tab=slowinsert]').click();
  await query(panel, 'fire', 6);
  check([...panel.list.querySelectorAll('.si-source')].some(node => node.textContent === "PHB'24"), 'edition badges survive native hosting');
  panel.input.focus();
  key(panel.input, 'ArrowDown'); key(panel.input, 'Enter');
  await pause();
  check(fixtureState.opened.length > 0, 'keyboard selection opens the selected original item');
  const selected = panel.view.results[panel.view.selected].item;
  const payload = new DataTransfer();
  panel.list.querySelector('[aria-selected=true]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: payload }));
  check(JSON.parse(payload.getData('text/plain')).uuid === selected.uuid, 'drag payload matches the selected original UUID');
  await query(panel, 'bulk', 100);
  const firstRow = panel.list.querySelector('.si-result');
  panel.list.scrollTop = panel.list.scrollHeight;
  panel.list.dispatchEvent(new Event('scroll'));
  check(panel.list.querySelectorAll('.si-result').length === 121 && firstRow.isConnected, 'scroll appends remaining groups without replacing existing rows');
  panel.list.scrollTop = 120;
  const selectedIndex = panel.view.selected, scrollTop = panel.list.scrollTop;
  document.querySelector('[role=tab][data-tab=chat]').click();
  check(!panel.visible && game.settings.get('slow-insert', 'query') === 'bulk', 'tab deactivation saves the query');
  document.querySelector('[role=tab][data-tab=slowinsert]').click();
  check(panel.session.page.shown === 121 && panel.view.selected === selectedIndex && panel.list.scrollTop === scrollTop,
    'tab reactivation preserves pagination, selection and scroll');
  await tab.render({ force: true });
  check(tab.panel === panel && firstRow.isConnected && tab.content.querySelectorAll('#slow-insert-panel').length === 1,
    'host rerender reuses exactly one panel');
  game.modules.get('slow-insert').api.close();
  check(!ui.sidebar.expanded && !panel.destroyed, 'API close collapses native sidebar without destroying the panel');
  game.modules.get('slow-insert').api.open();
  check(ui.sidebar.expanded && document.activeElement === panel.input && panel.session.page.shown === 121,
    'API open restores the sidebar and focuses search without resetting results');
  fixtureState.keybind.onDown();
  check(!ui.sidebar.expanded, 'registered shortcut collapses active sidebar');
  fixtureState.keybind.onDown();
  check(ui.sidebar.expanded, 'registered shortcut reopens sidebar');
  key(panel.input, 'Escape');
  check(ui.sidebar.expanded, 'local Escape remains unhandled');
  await query(panel, 'unsafe', 1);
  check(!window.pwned && !panel.root.querySelector('.si-source img, .si-name img'), 'names and sources remain inert text');
  panel.input.value = '剑'; key(panel.input, 'Enter'); await pause();
  check(fixtureState.opened.at(-1) === '剑 / Sword', 'immediate Enter flushes the pending query');
  document.querySelector('#deny').click();
  const opened = fixtureState.opened.length;
  panel.list.querySelector('.si-result').click();
  check(fixtureState.opened.length === opened, 'opening rechecks access after permissions change');
  panel.input.value = 'fire';
  panel.input.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => !panel.list.children.length, 'denied results cleared');
  check(panel.list.children.length === 0, 'denied searches clear stale actionable rows');
  document.querySelector('#deny').click();
  const builds = fixtureState.indexBuilds;
  panel.reindexButton.click();
  await until(() => !panel.index.indexing && panel.list.querySelectorAll('.si-result').length === 6, 'index completed');
  check(fixtureState.indexBuilds === builds + 1, 'reindex completion restores current query');
  ui.sidebar.changeTab('chat'); QuickInsert.hasIndex = false;
  const coldBuilds = fixtureState.indexBuilds;
  ui.sidebar.changeTab('slowinsert');
  await until(() => fixtureState.indexBuilds === coldBuilds + 1 && !panel.index.indexing
    && panel.list.querySelectorAll('.si-result').length === 6, 'cold index completed');
  check(true, 'cold native activation starts one shared index build');
  const popout = await tab.renderPopout(), poppedPanel = popout.panel;
  check(poppedPanel !== panel && poppedPanel.visible && poppedPanel.sidebarHost.app.isPopout,
    'native popout owns a separate live panel');
  check(poppedPanel.input.getAttribute('aria-controls') === poppedPanel.list.id && poppedPanel.list.id !== panel.list.id,
    'sidebar and popout have distinct accessible result IDs');
  ui.sidebar.changeTab('chat');
  check(poppedPanel.visible && !panel.visible, 'changing docked tabs leaves the popout active');
  await poppedPanel.openBrowseWindow();
  const popoutIndex = poppedPanel.index;
  await popout.close();
  check(popout.panel === null && poppedPanel.destroyed && popoutIndex.destroyed && !poppedPanel.root.isConnected
    && !poppedPanel.browseWindow.rendered && !ui.sidebar.popouts.slowinsert,
    'closing native popout destroys its panel, auxiliary window and subscriptions');
  const reopened = await tab.renderPopout();
  check(reopened.panel !== poppedPanel && reopened.panel.visible, 'reopening a native popout creates a fresh working panel');
  await reopened.close();
  delete tab.popout;
  game.modules.get('slow-insert').api.open();
  await query(panel, '', 100);
  return checks;
}
