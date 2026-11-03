import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { MODULE_VERSION } from "../module/scripts/panel.mjs";

const root = new URL("../module/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("module.json", root), "utf8"));

test("release is v0.5.7 with an explicit Quick Insert dependency", () => {
  assert.equal(manifest.id, "slow-insert");
  assert.equal(manifest.version, "0.5.7");
  assert.equal(manifest.version, MODULE_VERSION);
  assert.equal(manifest.relationships.requires[0].id, "quick-insert");
  assert.equal(manifest.relationships.requires[0].compatibility.minimum, "3.7.8");
  assert.equal(manifest.compatibility.maximum, "13");
});

test("all module entrypoints and localization resources exist", async () => {
  for (const file of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(x => x.path)]) {
    await access(new URL(file, root));
  }
  JSON.parse(await readFile(new URL("lang/en.json", root), "utf8"));
});
