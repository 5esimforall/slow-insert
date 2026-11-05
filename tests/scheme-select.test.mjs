import test from "node:test";
import assert from "node:assert/strict";
import { FilterControls } from "../module/scripts/filter-controls.mjs";
import { normalizeFilters, setGroup } from "../module/scripts/filters.mjs";

test("switching schemes keeps both selectors in sync and restores per-scheme filters", () => {
  const controls = Object.create(FilterControls.prototype);
  controls.state = setGroup(normalizeFilters(), "type", ["spell"]);
  const initial = structuredClone(controls.state);
  const selectors = controls.schemeSelectors = [{value: "items"}, {value: "items"}];
  let updates = 0;
  controls.renderGroups = () => {};
  controls.setExpanded = () => {};
  controls.onChange = () => { updates++; };
  controls.selectScheme("spells");
  assert.deepEqual(selectors.map(s => s.value), ["spells", "spells"]);
  controls.selectScheme("spells");
  controls.selectScheme("items");
  assert.deepEqual(selectors.map(s => s.value), ["items", "items"]);
  assert.deepEqual(controls.state, initial);
  assert.equal(updates, 2);
});
