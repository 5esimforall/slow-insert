import { checker, key } from './browser-checks.js';
import { normalizeFilters } from '../module/scripts/filters.mjs';
import { normalizeSorting } from '../module/scripts/sorting.mjs';
import { normalizeGrouping } from '../module/scripts/grouping.mjs';
import { spell } from './grouping-fixture.mjs';
import { t } from '../module/scripts/i18n.mjs';

// Synthetic catalog metadata isolates presentation from identity calculation.
export async function runDiagnosticsBrowserChecks() {
  const { check, checks } = checker();
  const panel = ui.slowinsert.panel;
  const saved = { isGM: game.user.isGM, search: panel.index.search, catalog: panel.session.groupingCatalog,
    filters: panel.filters, sorting: panel.sorting, grouping: panel.grouping, query: panel.input.value,
    preference: game.settings.get('slow-insert', 'collapseDiagnostics'), expanded: panel.diagnosticsExpanded,
    browseOpen: Boolean(panel.browseWindow?.rendered) };
  const opened = [];
  const rows = Array.from({ length: 490 }, (_, n) => spell(String(n), {
    name: `${n % 2 ? 'Diagnostic' : 'Clean'} ${String(n).padStart(3, '0')}`,
    img: fixtureItems[0].img, system: { identifier: `spell-${n}` }, show() { opened.push(this.uuid); }
  }));
  try {
    game.user.isGM = true;
    panel.open();
    await panel.openBrowseWindow();
    panel.filters = normalizeFilters(); panel.sorting = normalizeSorting(); panel.grouping = normalizeGrouping();
    panel.input.value = '';
    panel.index.search = (query, accept) => rows.filter(row => row.item.name.toLowerCase().includes(query.toLowerCase())).filter(accept);
    panel.session.groupingCatalog = results => ({ entries: new Map(results.map(result => [result.item.uuid, {
      result, uuid: result.item.uuid, key: null, names: [], tags: [], rules: '2014',
      warning: result.item.name.startsWith('Diagnostic') ? 'identifier' : null
    }])), groups: new Map() });
    panel.session.invalidate();
    await game.settings.set('slow-insert', 'collapseDiagnostics', false);
    panel.refresh();
    const baseline = panel.session.page.groups.map(group => group.key);
    const control = panel.diagnosticsControl;
    control.input.click();
    check(game.settings.get('slow-insert', 'collapseDiagnostics') === true && panel.collapseDiagnostics,
      'diagnostic switch saves the client preference');
    check(panel.session.page.groups.length === 245 && panel.session.page.diagnosticGroups.length === 245
      && panel.view.results.length === 100 && !panel.list.querySelector('.si-warning'),
      'collapsed diagnostics never enter selection or drag mappings');
    check(panel.view.diagnosticToggle.textContent === t('Diagnostics.Expand', { count: 245 }) && panel.view.diagnosticToggle.getAttribute('aria-expanded') === 'false'
      && panel.status.textContent.includes('490') && panel.status.textContent.includes('245'),
      'disclosure and status count all matches, not only the current page');
    const toggle = panel.view.diagnosticToggle, bounds = toggle.getBoundingClientRect(), parent = toggle.parentElement.getBoundingClientRect();
    check(Math.abs((bounds.left + bounds.right) - (parent.left + parent.right)) < 2
      && getComputedStyle(toggle).fontSize === '11px' && getComputedStyle(toggle).backgroundColor === 'rgba(0, 0, 0, 0)'
      && toggle.querySelector('.si-toggle-chevron')?.getAttribute('aria-hidden') === 'true',
      'diagnostic disclosure is quiet centered text with a decorative chevron');
    panel.view.diagnosticToggle.click();
    check(panel.view.results.length === 200 && document.activeElement === panel.view.diagnosticToggle
      && panel.view.diagnosticBody.querySelectorAll('.si-warning').length === 100,
      'expansion renders a bounded diagnostic page and restores disclosure focus');
    const diagnosticRow = panel.view.diagnosticBody.querySelector('.si-result');
    const selectedItem = panel.view.results[Number(diagnosticRow.dataset.index)].item;
    panel.view.select(Number(diagnosticRow.dataset.index), false);
    panel.loadMore();
    check(diagnosticRow.isConnected && panel.view.results[panel.view.selected].item === selectedItem
      && panel.input.getAttribute('aria-activedescendant') === diagnosticRow.id,
      'appending regular results ahead of diagnostics preserves selected document identity');
    const assertMapping = () => {
      const domRows = [...panel.list.querySelectorAll('.si-result')];
      check(domRows.every((row, index) => Number(row.dataset.index) === index && row.dataset.uuid === panel.view.results[index].item.uuid)
        && new Set(domRows.map(row => row.id)).size === domRows.length, 'DOM order, keyboard order, IDs and original UUID mappings agree');
    };
    assertMapping();
    panel.input.focus(); key(panel.input, 'Enter');
    check(opened.at(-1) === selectedItem.uuid, 'keyboard opens the selected original diagnostic entry after pagination');
    const transfer = new DataTransfer();
    diagnosticRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    check(JSON.parse(transfer.getData('text/plain')).uuid === selectedItem.uuid, 'diagnostic drag preserves the original UUID');
    panel.loadMore(); panel.loadMore(); panel.loadMore();
    check(panel.view.results.length === 490 && panel.list.lastElementChild === panel.view.diagnosticSection,
      'both sections paginate to completion without losing results or moving the disclosure above regular rows');
    assertMapping();
    panel.view.diagnosticToggle.click();
    check(panel.view.results.length === 245 && panel.view.diagnosticBody.children.length === 0
      && panel.view.results.every(result => !result.item.name.startsWith('Diagnostic')),
      'collapsing removes all diagnostic row mappings rather than leaving keyboard-selectable hidden rows');
    panel.view.diagnosticToggle.click();
    check(panel.view.results.length === 490, 're-expansion retains the loaded diagnostic page size');
    panel.deactivateSidebar(); panel.activateSidebar();
    check(panel.diagnosticsExpanded && panel.view.results.length === 490, 'tab return retains diagnostic expansion and loaded pages');
    panel.input.value = 'Diagnostic'; panel.refresh();
    check(panel.view.results.length === 0 && panel.session.page.diagnosticGroups.length === 245
      && panel.view.diagnosticToggle.isConnected && panel.view.diagnosticToggle.getAttribute('aria-expanded') === 'false',
      'new query resets disclosure and diagnostic-only matches remain accessible');
    panel.view.diagnosticToggle.click();
    check(panel.view.results.length === 100 && panel.input.getAttribute('aria-expanded') === 'true', 'diagnostic-only expansion creates selectable results');
    panel.input.value = 'Clean'; panel.refresh();
    check(!panel.list.querySelector('.si-diagnostics'), 'no diagnostics means no empty disclosure');
    panel.input.value = 'Absent'; panel.refresh();
    check(!panel.list.children.length && panel.session.page.rawCount === 0, 'truly empty searches retain the empty-result state');
    panel.input.value = ''; panel.refresh(); control.input.click();
    check(panel.session.page.groups.map(group => group.key).join() === baseline.join()
      && !panel.list.querySelector('.si-diagnostics'), 'switching off restores original ordering');
    await game.settings.set('slow-insert', 'collapseDiagnostics', true);
    game.user.isGM = false; panel.refresh();
    check(getComputedStyle(control.root).display !== 'none' && panel.list.querySelector('.si-diagnostics')
      && panel.session.page.diagnosticGroups.length === 245 && !panel.list.querySelector('.si-warning'),
      'players can use the same diagnostic disclosure without seeing analysis text');
    panel.view.diagnosticToggle.click();
    check(panel.view.diagnosticBody.querySelectorAll('.si-result').length === 100
      && !panel.view.diagnosticBody.querySelector('.si-warning'), 'expanded player results still omit GM-only diagnostic reasons');
    const popout = await ui.slowinsert.renderPopout();
    check(popout.panel.collapseDiagnostics && popout.panel.diagnosticsControl.input.checked,
      'fresh panel restores the saved disclosure preference for players');
    control.input.click();
    check(!popout.panel.collapseDiagnostics && !popout.panel.diagnosticsControl.input.checked,
      'saved display preference changes synchronize existing sidebar and popout');
    await popout.close(); delete ui.slowinsert.popout;
  } finally {
    game.user.isGM = saved.isGM;
    panel.index.search = saved.search; panel.session.groupingCatalog = saved.catalog;
    panel.filters = saved.filters; panel.sorting = saved.sorting; panel.grouping = saved.grouping; panel.input.value = saved.query;
    await game.settings.set('slow-insert', 'collapseDiagnostics', saved.preference);
    panel.diagnosticsExpanded = saved.expanded; panel.session.invalidate(); panel.refresh();
    if (!saved.browseOpen) await panel.browseWindow?.close();
  }
  return checks;
}
