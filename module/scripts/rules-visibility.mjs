// @ts-check

import { isSupportedResult } from "./filters.mjs";
import { identifySource } from "./source-resolution.mjs";

export const RULES_CHANGED = "slowInsertRulesDisplayChanged";
const setting = "rulesDisplay";

/**
 * @param {any} game
 * @param {string} moduleId
 * @returns {void}
 */
export function registerRulesDisplay(game, moduleId) {
  if (game.system.id !== "dnd5e") return;
  game.settings.register(moduleId, setting, {
    name: "SLOWINSERT.Rules.Name", hint: "SLOWINSERT.Rules.Hint",
    scope: "client", config: true, type: String, default: "system",
    choices: { system: "SLOWINSERT.Rules.System", "5e": "SLOWINSERT.Rules.Legacy", "5r": "SLOWINSERT.Rules.Revised" },
    onChange: () => (/** @type {any} */ (globalThis)).Hooks.callAll(RULES_CHANGED)
  });
}

/**
 * Resolve the world default only for a client that follows it.
 * @param {any} game
 * @param {string} moduleId
 * @returns {boolean}
 */
export function hidesRevisedContent(game, moduleId) {
  if (game.system.id !== "dnd5e") return false;
  const mode = game.settings.get(moduleId, setting);
  return mode === "5e" || (mode === "system" && game.settings.get("dnd5e", "rulesVersion") === "legacy");
}

/**
 * @param {boolean} hideRevised
 * @param {import('../../types/slow-insert.d.ts').SlowInsertEnvironment} [environment]
 * @returns {(result: any) => boolean}
 */
export function rulesPredicate(hideRevised, environment) {
  return result => isSupportedResult(result)
    && (!hideRevised || identifySource(result.item, environment).rules !== "2024");
}
