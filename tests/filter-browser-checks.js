import { checker, change, query, until } from './browser-checks.js';

export async function runFilterBrowserChecks() {
  const { check, checks } = checker();
  const panel = ui.slowinsert.panel;
  await panel.openBrowseWindow();
  const controls = panel.filterControls;
  const scheme = value => change(controls.scheme, value);
  const rows = () => [...panel.list.querySelectorAll('.si-result')];
  const choose = (group, value, checked = true) => {
    const input = controls.checks.find(entry => entry.id === group && String(entry.option.value) === value)?.input;
    if (!input) throw new Error(`Missing filter ${group}/${value}`);
    if (input.checked !== checked) input.click();
  };
  const clear = group => controls.drawer.querySelector(`details[data-group="${group}"] .si-group-actions button:last-of-type`).click();
  scheme('spells');
  check(panel.root.querySelector('.si-scheme').value === 'spells' && rows().length === 100,
    'sidebar and auxiliary-window schemes stay synchronized');
  await query(panel, 'fire', 6);
  clear('level');
  check(rows().length === 0, 'empty ordinary selection rejects all results');
  choose('level', '0');
  check(rows().length === 2 && rows().every(row => row.textContent.includes('Fire Bolt')), 'level zero matches cantrips');
  choose('level', '3');
  check(rows().length === 4, 'same-group selections use OR');
  clear('source'); choose('source', 'book:phb24');
  check(rows().length === 2 && rows().every(row => row.textContent.includes("PHB'24")), 'different groups use AND and distinguish editions');
  clear('classes'); choose('classes', 'wizard');
  check(rows().length === 2, 'class matching uses exact names and publication evidence');
  controls.reset.click();
  check(rows().length === 6 && panel.input.value === 'fire', 'reset restores the profile without clearing search');
  choose('special', 'ritual');
  check(rows().length === 1 && rows()[0].textContent.includes('Fire Ward'), 'required ritual property filters results');
  choose('mundane', 'concentration');
  check(rows().length === 0, 'conflicting positive and negative requirements reject results');
  controls.reset.click();
  await query(panel, 'bulk', 100); choose('special', 'ritual');
  check(rows().length === 1 && rows()[0].textContent.includes('Bulk late ritual'), 'filtering precedes pagination');
  await query(panel, '', 3); choose('special', 'costly');
  check(rows().length === 1 && rows()[0].textContent.includes('Gem Spell'), 'costly materials combine with required ritual');
  choose('mundane', 'costly');
  check(rows().length === 0, 'conflicting material requirements reject all results');
  controls.reset.click();
  const sourceChoices = controls.checks.filter(entry => entry.id === 'source');
  controls.sourceSearch.value = 'phb'; controls.sourceSearch.dispatchEvent(new Event('input'));
  check(sourceChoices.some(entry => entry.option.value === 'book:phb14' && !entry.label.hidden)
    && sourceChoices.some(entry => entry.option.value === 'book:tce' && entry.label.hidden), 'source finder narrows options rather than results');
  controls.sourceSearch.value = ''; controls.sourceSearch.dispatchEvent(new Event('input'));
  check(!window.pwned && !controls.drawer.querySelector('.si-filter-choice img'), 'source option names remain inert text');
  scheme('magic');
  check(rows().length === 2 && rows().every(row => /Test Wand|Test Potion/.test(row.textContent)), 'magic scheme excludes mundane weapons and spells');
  clear('rarity'); choose('rarity', 'rare');
  check(rows().length === 1 && rows()[0].textContent.includes('Test Wand'), 'magic rarity selects the expected document');
  await panel.browseWindow.close();
  check(document.activeElement === panel.browseButton && rows().length === 1, 'closing auxiliary window restores focus and retains filtered results');
  await panel.openBrowseWindow();
  check(controls.scheme.value === 'magic' && rows().length === 1, 'reopening auxiliary window preserves the profile');
  ui.sidebar.changeTab('chat'); // Persist query through the production deactivation callback.
  const persisted = await ui.slowinsert.renderPopout();
  check(persisted.panel.filters.scheme === 'magic' && persisted.panel.list.querySelectorAll('.si-result').length === 1,
    'fresh popout initializes from saved scheme and filter profile');
  await persisted.close(); delete ui.slowinsert.popout;
  ui.sidebar.changeTab('slowinsert');
  scheme('monsters');
  check(rows().length === 5 && rows().every(row => !row.textContent.includes('Player character')), 'monster scheme excludes player characters');
  const selects = controls.drawer.querySelectorAll('.si-cr-range select');
  change(selects[0], '0.125'); change(selects[1], '0.5');
  check(rows().length === 1 && rows()[0].textContent.includes('Scout'), 'fractional CR range compares numerically');
  change(controls.drawer.querySelector('.si-cr-range select'), '0');
  check(rows().length === 2, 'CR zero is retained as a boundary');
  controls.reset.click();
  change(controls.drawer.querySelectorAll('.si-cr-range select')[0], '10');
  change(controls.drawer.querySelectorAll('.si-cr-range select')[1], '2');
  check([...controls.drawer.querySelectorAll('.si-cr-range select')].map(el => el.value).join('/') === '2/10'
    && rows().length === 1 && rows()[0].textContent.includes('Fire Elemental'), 'reversed CR bounds normalize and remain inclusive');
  controls.reset.click();
  clear('legendary'); choose('legendary', 'yes');
  clear('size'); choose('size', 'grg');
  clear('creatureType'); choose('creatureType', 'dragon');
  check(rows().length === 1 && rows()[0].textContent.includes('Dragon'), 'legendary, size and creature-type filters combine');
  const dragon = fixtureItems.find(item => item.uuid === 'Actor.dragon');
  const oldLegendary = dragon.system.resources.legact.max;
  try {
    dragon.system.resources.legact.max = 0; Hooks.callAll('updateActor', dragon);
    await until(() => rows().length === 0, 'Actor metadata invalidation');
    check(true, 'Actor updates invalidate native-host filter metadata');
  } finally { dragon.system.resources.legact.max = oldLegendary; Hooks.callAll('updateActor', dragon); }
  await until(() => rows().length === 1, 'Actor metadata restoration');
  controls.reset.click();
  scheme('magic'); check(rows().length === 1, 'switching schemes preserves independent filter profiles');
  controls.reset.click(); scheme('items');
  await panel.browseWindow.close();
  // Hidden sidebars should not steal focus when an auxiliary window closes.
  await panel.openBrowseWindow(); ui.sidebar.collapse(); document.querySelector('#collapse').focus();
  await panel.browseWindow.close();
  check(document.activeElement === document.querySelector('#collapse'), 'closing a browse window does not focus a collapsed sidebar');
  ui.sidebar.expand();
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  check(new Set(ids).size === ids.length, 'restored docked UI has no duplicate IDs');
  await until(() => rows().length === 100, 'restored item results');
  return checks;
}
