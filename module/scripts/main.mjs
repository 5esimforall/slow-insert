import { preferenceSettingKey } from "./grouping-state.mjs";
import { registerSidebar, SIDEBAR_TAB } from "./sidebar.mjs";
import { t } from "./i18n.mjs";
import { MODULE_ID } from "./panel.mjs";
import { SOURCE_INDEX_FIELDS } from "./source.mjs";
import { FILTER_INDEX_FIELDS, ACTOR_FILTER_INDEX_FIELDS } from "./filters.mjs";
import { normalizeGrouping } from "./grouping.mjs";

import { registerRulesDisplay } from "./rules-visibility.mjs";

let panel;

Hooks.once("init", () => {
  registerRulesDisplay(game, MODULE_ID);
  // Register before Quick Insert requests pack indexes. No full-pack loads.
  if (game.system.id === "dnd5e") {
    const fields = CONFIG.Item.compendiumIndexFields;
    for (const field of [...SOURCE_INDEX_FIELDS, ...FILTER_INDEX_FIELDS]) if (!fields.includes(field)) fields.push(field);
    const actorFields = CONFIG.Actor.compendiumIndexFields;
    for (const field of [...SOURCE_INDEX_FIELDS, ...ACTOR_FILTER_INDEX_FIELDS]) if (!actorFields.includes(field)) actorFields.push(field);
  }
  game.settings.register(MODULE_ID, preferenceSettingKey(game.world, game.user?.id ?? game.userId), { scope: "client", config: false, type: Object, default: normalizeGrouping() });

  for (const [key, type, value] of [["searchInWindow", Boolean, false], ["query", String, ""], ["filters", Object, {}], ["sorting", Object, {}], ["browsePosition", Object, {}], ["filterExpansion", Object, {}]]) {
    game.settings.register(MODULE_ID, key, { scope: "client", config: false, type, default: value });
  }
  game.settings.register(MODULE_ID, "collapseDiagnostics", { scope: "client", config: false,
    type: Boolean, default: true,
    onChange: value => Hooks.callAll("slowInsertDiagnosticsChanged", value === true)
  });
  game.keybindings.register(MODULE_ID, "toggle", {
    name: "SLOWINSERT.Toggle",
    hint: "SLOWINSERT.ToggleHint",
    // Foundry maps Control to Command on macOS, including the controls UI.
    editable: [{ key: "KeyF", modifiers: ["Control"] }],
    repeat: true, // Consume held keys without repeatedly exchanging the layout.
    onDown: ({ event } = {}) => {
      const popout = ui.sidebar?.popouts?.[SIDEBAR_TAB];
      return (popout?.rendered ? popout.panel : panel)?.openOrSwap(event) ?? false;
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});

Hooks.once("setup", () => {
  if (game.modules.get("quick-insert")?.active) registerSidebar();
});

Hooks.once("ready", async () => {
  if (!game.modules.get("quick-insert")?.active || !globalThis.QuickInsert?.search) {
    ui.notifications.warn(t("DependencyWarning"));
    return;
  }
  // Respect Quick Insert's GM-only setting, including its decision not to index.
  if (!game.user.isGM && game.settings.get("quick-insert", "gmOnly")) return;

  const sidebar = ui[SIDEBAR_TAB];
  await sidebar.render({ force: true });
  panel = sidebar.panel;
  game.modules.get(MODULE_ID).api = Object.freeze({
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle(),
    registerPublications: (providerId, records) => panel.registerPublications(providerId, records),
    unregisterPublications: providerId => panel.unregisterPublications(providerId)
  });
});
