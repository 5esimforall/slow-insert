import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../module/styles/slow-insert.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../module/scripts/panel.mjs', import.meta.url), 'utf8');
test('light surfaces are independent of Foundry and Quick Insert themes', () => {
  assert.match(css, /--si-bg: #eeecef;/);
  assert.match(css, /--si-text: #302b35;/);
  assert.match(css, /color-scheme: light;/);
  assert.match(css, /\.slow-insert\.si-native \{[^}]*background: var\(--si-bg\);/);
  assert.match(css, /:is\(\.si-browse-window, \.si-grouping-window\) \.window-header \{[^}]*background: #e3dfe7;/);
  assert.doesNotMatch(css, /--qiBackground|--qiItem|#a7d6c5|\.quick-insert-result|#qi-search-appv3|color-scheme: dark/);
});
test('compact rows keep source and disclosure separate and expose truncated details', () => {
  assert.match(css, /\.si-type \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.si-group-heading:has\(> \.si-group-toggle\) > \.si-result > \.si-source \{ margin-bottom: 21px;/);
  assert.match(panel, /typeLabel.title = detailText;/);
});

test('minimum window dimensions do not clamp native close or minimize transitions', () => {
  assert.match(css, /\.si-browse-window:not\(\.minimizing, \.minimized, \.maximizing\) \{ min-width: 300px; min-height: 320px; \}/);
  assert.doesNotMatch(css, /\.si-browse-window\s*\{[^}]*min-(height|width):/);
  const nativeWindow = readFileSync(new URL('../module/scripts/browse-window.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(nativeWindow, /(?:async\s+)?close\s*\(|_tearDown\s*\(|_removeElement\s*\(/);
});

test('variant count is not repeated in result subtitles', () => {
  assert.doesNotMatch(panel, /t\("Grouping\.Family"\)/);
  assert.match(panel, /"Grouping.FamilyHint"/);
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
