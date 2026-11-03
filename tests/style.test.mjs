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
  assert.match(css, /\.si-browse-window \.window-header \{[^}]*background: #e3dfe7;/);
  assert.doesNotMatch(css, /--qiBackground|--qiItem|#a7d6c5|\.quick-insert-result|#qi-search-appv3|color-scheme: dark/);
});
test('compact rows keep source and disclosure separate and expose truncated details', () => {
  assert.match(css, /\.si-type \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.si-group-heading:has\(> \.si-group-toggle\) > \.si-result > \.si-source \{ margin-bottom: 21px;/);
  assert.match(panel, /typeLabel.title = detailText;/);
});
