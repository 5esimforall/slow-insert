import { t } from "./i18n.mjs";
import { SlowInsertPanel, MODULE_ID } from "./panel.mjs";
import { SOURCE_INDEX_FIELDS } from "./source.mjs";
import { FILTER_INDEX_FIELDS, ACTOR_FILTER_INDEX_FIELDS } from "./filters.mjs";
import { GROUP_INDEX_FIELDS, GROUP_ACTOR_INDEX_FIELDS, normalizeGrouping } from "./grouping.mjs";

let panel;

Hooks.once("init", () => {
  // Register before Quick Insert requests pack indexes. No full-pack loads.
  if (game.system.id === "dnd5e") {
    const fields = CONFIG.Item.compendiumIndexFields;
    for (const field of [...SOURCE_INDEX_FIELDS, ...FILTER_INDEX_FIELDS, ...GROUP_INDEX_FIELDS]) if (!fields.includes(field)) fields.push(field);
    const actorFields = CONFIG.Actor.compendiumIndexFields;
    for (const field of [...SOURCE_INDEX_FIELDS, ...ACTOR_FILTER_INDEX_FIELDS, ...GROUP_ACTOR_INDEX_FIELDS]) if (!actorFields.includes(field)) actorFields.push(field);
  }
  game.settings.register(MODULE_ID, "grouping", { scope: "client", config: false, type: Object, default: normalizeGrouping() });

  for (const [key, type, value] of [["width", Number, 360], ["query", String, ""], ["filters", Object, {}]]) {
    game.settings.register(MODULE_ID, key, { scope: "client", config: false, type, default: value });
  }
  game.keybindings.register(MODULE_ID, "toggle", {
    name: "SLOWINSERT.Toggle",
    hint: "SLOWINSERT.ToggleHint",
    editable: [{ key: "Space", modifiers: ["Control", "Alt"] }],
    onDown: () => { panel?.toggle(); return Boolean(panel); },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
  game.keybindings.register(MODULE_ID, "dismiss", {
    name: "SLOWINSERT.Panel.Close",
    hint: "SLOWINSERT.DismissHint",
    uneditable: [{ key: "Escape" }],
    onDown: context => panel?.onEscape(context.event) ?? false,
    // Core dismiss is DEFERRED and always consumes Escape (opening the menu
    // when no windows remain). Run before that fallback, but yield explicitly
    // to all native windows, dialogs, menus, tours and drag workflows.
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});

Hooks.once("ready", () => {
  if (!game.modules.get("quick-insert")?.active || !globalThis.QuickInsert?.search) {
    ui.notifications.warn(t("DependencyWarning"));
    return;
  }
  // Respect Quick Insert's GM-only setting, including its decision not to index.
  if (!game.user.isGM && game.settings.get("quick-insert", "gmOnly")) return;

  panel = new SlowInsertPanel();
  panel.mount();
  game.modules.get(MODULE_ID).api = Object.freeze({
    open: () => panel.open(), close: () => panel.close(), toggle: () => panel.toggle()
  });
});
