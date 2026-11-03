import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../module/styles/slow-insert.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../module/scripts/panel.mjs', import.meta.url), 'utf8');
test('Quick Insert palette is reused without overriding Quick Insert selectors', () => {
  assert.match(css, /--si-hover: var\(--qiItemHoverColor,/);
  assert.match(css, /--si-selected: var\(--qiItemSelectedColor,/);
  assert.doesNotMatch(css, /#a7d6c5|\.quick-insert-result|#qi-search-appv3/);
  assert.match(css, /\.theme-light \.slow-insert/);
});
test('compact rows keep source and disclosure separate and expose truncated details', () => {
  assert.match(css, /\.si-type \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.si-group-heading:has\(> \.si-group-toggle\) > \.si-result > \.si-source \{ margin-bottom: 21px;/);
  assert.match(panel, /typeLabel.title = detailText;/);
});
