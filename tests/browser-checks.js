// Run using playwright-cli run-code "$(cat tests/browser-checks.js)" with the fixture server running.
async (page) => {
  const passed = [];
  const check = (ok, name) => { if (!ok) throw new Error(name); passed.push(name); };
  await page.goto("http://127.0.0.1:4178/tests/fixture.html");
  await page.waitForFunction(() => globalThis.fixtureReady);
  await page.setViewportSize({ width: 1440, height: 900 });
  const panel = page.getByRole("complementary", { name: "Slow Insert compendium search" });
  const input = page.getByRole("combobox", { name: "Search items, spells, or monsters" });
  const rows = page.getByRole("listbox", { name: "Search results" }).getByRole("option");
  const query = async (value, expected) => {
    await input.fill(value);
    await page.waitForFunction(({ value, expected }) => {
      const current = document.querySelector(".si-search");
      return current.value === value && document.querySelectorAll(".si-result").length === expected
        && (expected === 0 || fixtureState.calls.at(-1) === value);
    }, { value, expected });
  };

  check(!await panel.isVisible(), "starts collapsed");
  await page.getByRole("button", { name: "Slow Insert — compendium search" }).click();
  await query("fire", 6);
  check(await rows.count() === 6, "item-only results exclude matching actors");
  check((await rows.allTextContents()).some(x => x.includes("PHB'14"))
    && (await rows.allTextContents()).some(x => x.includes("PHB'24")), "edition badges preserve duplicate names");
  await input.press("ArrowDown");
  await input.press("Enter");
  check(await page.evaluate(() => fixtureState.opened.length === 1), "keyboard selection opens an item");
  await page.getByRole("option", { name: "Fireball Spell PHB'24", exact: true }).dragTo(page.locator("#drop"));
  check(await page.evaluate(() => fixtureState.drop?.type === "Item"
    && fixtureState.drop?.uuid === "Compendium.fixture.spells.Item.item1"), "drag emits the correct Foundry UUID payload");
  check(await panel.isVisible(), "panel survives opening, outside clicks and dragging");

  const initial = await panel.boundingBox();
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#slow-insert-panel").getBoundingClientRect().right > 1300);
  check((await panel.boundingBox()).x > initial.x, "dock follows sidebar collapse");
  const handle = page.getByRole("separator", { name: "Resize Slow Insert (left and right arrows)" });
  await handle.focus();
  await handle.press("ArrowLeft");
  check(await page.evaluate(() => game.settings.get("slow-insert", "width") === 380), "keyboard resize saves client width");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 36, box.y + 100);
  await page.mouse.up();
  check(await page.evaluate(() => game.settings.get("slow-insert", "width") >= 416), "pointer resize saves client width");

  await query("unsafe", 1);
  check(await page.evaluate(() => !window.pwned && document.querySelectorAll(".si-source img, .si-name img").length === 0), "names and sources are rendered as safe text");
  await query("nothingmatches", 0);
  check((await page.getByRole("status").textContent()).includes("No matching entries"), "empty results are explained");
  await query("bulk", 100);
  check((await page.getByRole("status").textContent()).includes("100+"), "large result sets are capped");
  // Enter immediately after a different query must not open a stale bulk result.
  await input.fill("剑");
  await input.press("Enter");
  check(await page.evaluate(() => fixtureState.opened.at(-1) === "剑 / Sword"), "Enter flushes a pending search");
  await input.press("Escape");
  check(!await panel.isVisible(), "Escape collapses the panel");
  check(await page.evaluate(() => game.settings.get("slow-insert", "query") === "剑"), "closing remembers the query");
  await page.getByRole("button", { name: "Slow Insert — compendium search" }).click();
  check(await input.inputValue() === "剑", "reopening retains the query");

  await page.getByRole("button", { name: "Toggle GM-only restriction" }).click();
  const opened = await page.evaluate(() => fixtureState.opened.length);
  await rows.first().click();
  check(await page.evaluate(() => fixtureState.opened.length) === opened, "access is rechecked before opening a result");
  await input.fill("fire");
  await page.waitForFunction(() => document.querySelector(".si-status").textContent.includes("unavailable"));
  check(await rows.count() === 0, "GM-only changes clear player results");
  await page.getByRole("button", { name: "Toggle GM-only restriction" }).click();
  await page.getByRole("button", { name: "Rebuild the shared Quick Insert index" }).click();
  await page.waitForFunction(() => document.querySelector(".si-status").textContent.startsWith("6 results"));
  check(await page.evaluate(() => fixtureState.indexBuilds === 1), "reindex completion refreshes results");

  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForFunction(() => {
    const bounds = document.querySelector("#slow-insert-panel").getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth;
  });
  const narrow = await panel.boundingBox();
  check(narrow.x >= 0 && narrow.x + narrow.width <= 390, "narrow viewport stays on-screen");

  // Cold index path: the panel triggers one build when no index is available.
  await page.evaluate(() => { game.modules.get("slow-insert").api.close(); QuickInsert.hasIndex = false; });
  await page.getByRole("button", { name: "Slow Insert — compendium search" }).click();
  await page.waitForFunction(() => fixtureState.indexBuilds === 2 && document.querySelector(".si-status").textContent.startsWith("6 results"));
  check(true, "cold open builds the shared index");
  return { passed: passed.length, checks: passed };
}
