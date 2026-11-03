async (page) => {
  await page.goto('http://127.0.0.1:4178/tests/fixture.html');
  await page.waitForFunction(() => globalThis.fixtureReady);
  const panel = page.getByRole('complementary', { name: 'Slow Insert compendium search' });
  const input = page.getByRole('combobox', { name: 'Search items, spells, or monsters' });
  await page.getByRole('button', { name: 'Slow Insert — compendium search' }).click();
  await input.press('Escape');
  if (!await panel.isVisible()) throw Error('Slow Insert must not close on Escape');
  await page.evaluate(() => document.activeElement.blur());
  const before = await page.evaluate(() => fixtureState.nativeDismisses || 0);
  await page.keyboard.press('Escape');
  if (!await panel.isVisible()) throw Error('Native Escape must leave frameless sidebar alone');
  if (await page.evaluate(() => fixtureState.nativeDismisses) !== before + 1) throw Error('Native keybinding must run normally');
  return { passed: 3 };
}
