import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../module/styles/slow-insert.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../module/scripts/results-view.mjs', import.meta.url), 'utf8');
test('surfaces consume Quick Insert colors with light and dark fallbacks', () => {
  for (const [token, upstream, light, dark] of [
    ['bg', 'qiBackground', '#dddddde3', '#302831e3'],
    ['hover', 'qiItemHoverColor', '#99944e29', '#9979b924'],
    ['selected', 'qiItemSelectedColor', '#99944e29', '#b3a0c624'],
    ['selected-hover', 'qiItemSelectedHoverColor', '#99944e3d', '#9979b924']
  ]) assert.ok(css.includes(`--si-${token}: var(--${upstream}, light-dark(${light}, ${dark}));`));
  assert.match(css, /--si-text: var\(--color-text-primary, light-dark\(/);
  assert.match(css, /color-scheme: var\(--color-scheme, light\);/);
  assert.match(css, /\.slow-insert \{[^}]*background: var\(--si-bg\);/);
  assert.match(css, /\.si-browse-window \{[^}]*background: var\(--si-bg\);[^}]*border: 1px solid var\(--si-border\);/);
  assert.match(css, /\.si-browse-window \.window-header \{[^}]*background: var\(--si-field\);/);
  assert.match(css, /\.si-browse-window \.slow-insert \{ background: transparent; \}/);
  assert.doesNotMatch(css, /--qi[\w-]+\s*:|\.quick-insert-result|#qi-search-appv3|#eeecef|#e3dfe7/);
});
test('selected hover colors apply to standalone, grouped and expanded rows', () => {
  assert.match(css, /\.si-result\[aria-selected="true"\]:hover \{ background: var\(--si-selected-hover\); \}/);
  for (const row of ['si-member', 'si-group-heading']) {
    assert.ok(css.includes(`.${row}:has(> .si-result[aria-selected="true"]):hover { background: var(--si-selected-hover); }`));
    assert.ok(css.includes(`.${row} > .si-result:hover {`));
  }
});
test('semantic colors remain readable in either scheme rather than using light-only literals', () => {
  for (const token of ['warning', 'danger', 'preferred']) {
    assert.match(css, new RegExp(`--si-${token}: light-dark\\(`));
    assert.ok(css.includes(`color: var(--si-${token});`));
  }
  assert.match(css, /\.si-filter-switch input \{[^}]*background: var\(--si-line\);/);
});
test('compact rows keep source and disclosure separate and expose truncated details', () => {
  assert.match(css, /\.si-type \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.si-group-heading:has\(> \.si-group-toggle\) > \.si-result > \.si-source \{ margin-bottom: 21px;/);
  assert.match(view, /typeLabel.title = detailText;/);
});

test('minimum window dimensions do not clamp native close or minimize transitions', () => {
  assert.match(css, /\.si-browse-window:not\(\.minimizing, \.minimized, \.maximizing\) \{ min-width: 300px; min-height: 320px; \}/);
  assert.doesNotMatch(css, /\.si-browse-window\s*\{[^}]*min-(height|width):/);
  const nativeWindow = readFileSync(new URL('../module/scripts/browse-window.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(nativeWindow, /(?:async\s+)?close\s*\(|_tearDown\s*\(|_removeElement\s*\(/);
});

test('variant count is not repeated in result subtitles', () => {
  assert.doesNotMatch(view, /t\("Grouping\.Family"\)/);
  assert.match(view, /"Grouping.FamilyHint"/);
  for (const lang of ['en', 'cn']) {
    const labels = JSON.parse(readFileSync(new URL(`../module/lang/${lang}.json`, import.meta.url), 'utf8'));
    assert.equal(labels['SLOWINSERT.Grouping.Family'], undefined);
  }
});

test('native selects share an inset chevron and reserve space for it', () => {
  assert.match(css, /\.slow-insert select\.si-scheme,\s*\.slow-insert select\.si-sort-select,\s*\.slow-insert \.si-cr-range select \{\s*appearance: none;/);
  assert.match(css, /padding-right: 30px;/);
  assert.match(css, /background-position: right 10px center;/);
  assert.match(css, /background-size: 12px 8px;/);
  assert.match(css, /stroke-linecap='round'/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test('preferred-member star uses a compact hit target below the source', () => {
  const pin = css.match(/\.si-member > \.si-pin \{([^}]+)\}/)[1];
  assert.match(pin, /background: transparent;/);
  assert.match(pin, /width: 24px; height: 24px;/);
  assert.match(css, /\.si-member \.si-source \{[^}]*margin-bottom: 24px;/);
  assert.match(css, /\.si-pin:focus-visible \{ outline: 2px solid/);
});

test('all search surfaces inherit host geometry without the removed floating controls', () => {
  assert.doesNotMatch(css, /si-native|si-resize|slow-insert-toggle|position: fixed/);
  assert.match(css, /\.slow-insert \{[^}]*position: relative;/);
});

test('grouping management is a compact link without the retired review interface styles', () => {
  assert.match(css, /\.slow-insert \.si-grouping-link \{[^}]*width: auto;[^}]*background: transparent;/);
  assert.doesNotMatch(css, /si-grouping-controls|si-grouping-preview|si-grouping-window|si-grouping-pending/);
});
