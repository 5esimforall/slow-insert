async (page) => {
  // Disable browser caching so repeated local runs execute the current module.
  await page.route("**/*", route => route.continue());
  const checks = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  await page.goto("http://127.0.0.1:4178/tests/fixture.html");
  await page.waitForFunction(() => globalThis.fixtureReady);
  const launcher = page.getByRole("button", { name: "Slow Insert — compendium search" });
  const panel = page.getByRole("complementary", { name: "Slow Insert compendium search" });
  const input = page.getByRole("combobox", { name: "Search items, spells, or monsters" });
  await launcher.click();
  await input.fill("fire");
  // Stand-in framed applications exercise the same two registries as Foundry v13.
  const openWindow = async (legacy, delay = 0, dialog = false) => page.evaluate(({ legacy, delay, dialog }) => {
    const element = document.createElement("section");
    element.id = "fixture-document-window";
    element.tabIndex = 0;
    element.textContent = "Document popup";
    document.body.append(element);
    const app = { rendered: true, hasFrame: true, element: legacy ? [element] : element,
      async close(options) {
        fixtureState.closeOptions = options;
        app.rendered = false;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        element.remove();
        delete ui.windows.sheet;
        foundry.applications.instances.delete("sheet");
      }
    };
    if (legacy) ui.windows.sheet = app;
    else foundry.applications.instances.set("sheet", app);
    if (dialog) element.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); app.close();
    });
  }, { legacy, delay, dialog });

  await page.evaluate(() => {
    const outside = document.createElement("input");
    outside.id = "fixture-outside-input";
    outside.setAttribute("aria-label", "Outside input");
    document.body.append(outside);
  });
  for (const legacy of [true, false]) for (const focus of ["panel", "body", "outside-input"]) {
    await openWindow(legacy);
    if (focus === "panel") await input.focus();
    else if (focus === "outside-input") await page.getByRole("textbox", { name: "Outside input" }).focus();
    else await page.evaluate(() => document.activeElement.blur());
    const nativeBefore = await page.evaluate(() => fixtureState.nativeDismisses || 0);
    await page.keyboard.press("Escape");
    check(await page.locator("#fixture-document-window").count() === 0, `${legacy ? "V1" : "V2"} window closes with focus on ${focus}`);
    check(await panel.isVisible(), "same Escape does not close Slow Insert");
    check(await page.evaluate(() => fixtureState.closeOptions?.closeKey === true), "native close-key semantics are preserved");
    check(await page.evaluate(() => fixtureState.nativeDismisses) === nativeBefore + 1, "Escape is forwarded exactly once");
    await page.keyboard.press("Escape");
    check(!await panel.isVisible(), `next Escape closes Slow Insert with focus on ${focus}`);
    check(await page.evaluate(() => fixtureState.nativeDismisses) === nativeBefore + 1, "panel close does not also trigger native menu fallback");
    await launcher.click();
  }

  await openWindow(false, 0, true);
  await page.locator("#fixture-document-window").press("Escape");
  check(await panel.isVisible(), "dialog-owned Escape does not leak into the panel");
  await page.keyboard.press("Escape");
  check(!await panel.isVisible(), "global Escape closes the panel after focus returns to the page");
  await launcher.click();

  await page.getByRole("combobox", { name: "Quick reference" }).selectOption("spells");
  await input.press("Escape");
  check(!await panel.isVisible(), "expanded filters do not add an extra Escape step");
  await launcher.click();
  await input.dispatchEvent("keydown", { key: "Escape", code: "Escape", repeat: true });
  check(await panel.isVisible(), "held Escape does not dismiss the next layer");

  await openWindow(false, 250);
  await input.press("Escape");
  await input.press("Escape");
  check(await panel.isVisible(), "closing animation continues to take priority");
  await page.locator("#fixture-document-window").waitFor({ state: "detached" });
  await input.press("Escape");
  check(!await panel.isVisible(), "a fresh press after animation closes Slow Insert");
  return { passed: checks.length, checks };
}
