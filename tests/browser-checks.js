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
  const header = panel.searchContent.querySelector('.si-header');
  check(!header.querySelector('h2, .si-heading, .si-version')
    && header.firstElementChild.matches('.si-scheme')
    && header.children[1] === panel.reindexButton && header.lastElementChild === panel.searchSwapButton,
    'search header puts the scheme first, followed by refresh and layout swap without branding');
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

export async function runLayoutBrowserChecks() {
  const { checks, check } = checker();
  const tab = ui.slowinsert, panel = tab.panel;
  change(panel.filterControls.scheme, 'items');
  panel.filterControls.reset.click();
  await query(panel, 'bulk', 100);
  panel.loadMore(); panel.list.scrollTop = 160;
  const first = panel.list.firstElementChild, page = panel.session.page;
  const selection = panel.view.selected, filters = panel.filters, sorting = panel.sorting;
  const scroll = panel.list.scrollTop;
  await panel.openBrowseWindow();
  const headerGeometry = content => {
    const bounds = content.getBoundingClientRect();
    const header = content.querySelector('.si-header');
    const scheme = header.querySelector('.si-scheme').getBoundingClientRect();
    const swap = header.lastElementChild.getBoundingClientRect();
    return [scheme.left - bounds.left, scheme.top - bounds.top, scheme.width, scheme.height,
      bounds.right - swap.right, swap.top - bounds.top];
  };
  const sidebarHeader = headerGeometry(panel.searchContent), windowHeader = headerGeometry(panel.browseContent);
  panel.searchSwapButton.click();
  await until(() => !panel.swappingLayout && panel.searchInWindow, 'search moved into window');
  check(headerGeometry(panel.browseContent).every((value, i) => Math.abs(value - sidebarHeader[i]) < 1)
    && headerGeometry(panel.searchContent).every((value, i) => Math.abs(value - windowHeader[i]) < 1),
    'scheme position and size and layout-button alignment stay fixed in both hosts when swapping');
  check(panel.root.contains(panel.browseContent) && panel.browseWindow.element.contains(panel.searchContent)
    && !panel.root.contains(panel.searchContent), 'swap completely exchanges search and filters between hosts');
  check(panel.list.firstElementChild === first && panel.session.page === page && page.shown === 121
    && panel.view.selected === selection && panel.filters === filters && panel.sorting === sorting
    && panel.list.scrollTop === scroll, 'swap preserves live results, pagination, selection, scroll, filters and sorting');
  check(document.activeElement === panel.input && panel.searchSwapButton.getAttribute('aria-pressed') === 'true'
    && !panel.browseButton.hasAttribute('aria-haspopup'), 'swapped search keeps focus and controls describe their new targets');
  check(game.settings.get('slow-insert', 'searchInWindow') === true, 'layout preference is saved');
  check(panel.browseContent.scrollWidth <= panel.browseContent.clientWidth
    && getComputedStyle(panel.browseContent.querySelector('.si-browse-columns')).gridTemplateColumns.split(' ').length === 1,
    'sidebar filters stack in one column without horizontal overflow');
  await tab.render({ force: true });
  check(panel.root.contains(panel.browseContent) && panel.browseWindow.element.contains(first), 'host rerender preserves swapped placement');
  ui.sidebar.changeTab('chat');
  await query(panel, 'fire', 6);
  panel.input.focus(); key(panel.input, 'ArrowDown'); key(panel.input, 'Enter');
  await pause();
  check(fixtureState.opened.at(-1) === panel.view.results[panel.view.selected].item.name,
    'floating search still opens the selected item while another sidebar tab is active');
  const payload = new DataTransfer(), selected = panel.view.results[panel.view.selected].item;
  panel.list.querySelector('[aria-selected=true]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: payload }));
  check(JSON.parse(payload.getData('text/plain')).uuid === selected.uuid, 'floating search drags the displayed original item');
  await query(panel, 'bulk', 100); panel.loadMore();
  check(panel.session.page.shown === 121 && !panel.visible, 'floating search paginates while sidebar is inactive');
  panel.browseButton.click();
  check(tab.active && document.activeElement === panel.filterControls.scheme, 'filter button reveals and focuses sidebar controls');
  change(panel.filterControls.scheme, 'spells');
  check(panel.searchContent.querySelector('.si-scheme').value === 'spells', 'sidebar scheme updates floating search');
  await panel.browseWindow.close();
  check(document.activeElement === panel.searchWindowButton && panel.root.contains(panel.browseContent)
    && panel.searchWindowButton.getAttribute('aria-expanded') === 'false', 'closing floating search leaves filters and a focused reopen button');
  panel.searchWindowButton.click();
  await until(() => panel.browseWindow.rendered, 'reopen floating search');
  check(document.activeElement === panel.input && panel.input.value === 'bulk', 'reopen restores search and focus');
  await panel.browseWindow.close();
  panel.session.invalidate();
  await panel.openBrowseWindow();
  check(panel.session.catalog !== null, 'reopening floating search refreshes an invalidated catalog');
  await panel.browseWindow.close();
  QuickInsert.hasIndex = false; panel.session.clear();
  const builds = fixtureState.indexBuilds;
  await panel.openBrowseWindow();
  await until(() => fixtureState.indexBuilds === builds + 1 && !panel.index.indexing && panel.session.page, 'cold floating search index');
  check(true, 'opening floating search starts a missing index even when activation preceded rendering');
  await panel.browseWindow.close();
  fixtureState.keybind.onDown();
  await until(() => panel.browseWindow.rendered, 'shortcut reopens floating search');
  check(document.activeElement === panel.input, 'shortcut reopens a closed floating search while filters remain active');
  const popout = await tab.renderPopout();
  await until(() => popout.panel.browseWindow?.rendered, 'saved layout in fresh host');
  check(popout.panel.searchInWindow && popout.panel.root.contains(popout.panel.browseContent)
    && popout.panel.browseWindow.element.contains(popout.panel.searchContent), 'fresh panel restores saved layout');
  const poppedPanel = popout.panel;
  await popout.close(); delete tab.popout;
  check(!poppedPanel.searchContent.isConnected && !poppedPanel.browseContent.isConnected
    && !poppedPanel.browseWindow.rendered, 'destroy cleans up both swapped trees and window');
  panel.filterSwapButton.click();
  await until(() => !panel.swappingLayout && !panel.searchInWindow, 'search restored to sidebar');
  check(panel.root.contains(panel.searchContent) && panel.browseWindow.element.contains(panel.browseContent)
    && document.activeElement === panel.input && game.settings.get('slow-insert', 'searchInWindow') === false,
    'second swap restores original layout, focus and preference');
  await panel.browseWindow.close();
  panel.searchSwapButton.click();
  await until(() => !panel.swappingLayout && panel.searchInWindow, 'swap with closed window');
  check(panel.browseWindow.rendered && panel.browseWindow.element.contains(panel.searchContent), 'swap opens a closed auxiliary window');
  await panel.swapLayout(); await panel.browseWindow.close();
  const original = panel.searchInWindow;
  document.querySelector('#deny').click(); await panel.swapLayout();
  check(panel.searchInWindow === original && !panel.browseWindow.rendered, 'denied access cannot swap or open a window');
  document.querySelector('#deny').click();
  return checks;
}
