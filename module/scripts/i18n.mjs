// @ts-check

/** @typedef {import('../../types/slow-insert.d.ts').SlowInsertEnvironment} SlowInsertEnvironment */

/**
 * Resolve at render time, after Foundry has loaded the selected language.
 * @param {string} key
 * @param {SlowInsertEnvironment} [environment]
 * @returns {string}
 */
export function localizeValue(key, environment = {}) {
  return environment.localize?.(key) ?? (/** @type {any} */ (globalThis)).game?.i18n?.localize(key) ?? key;
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} [data]
 * @param {SlowInsertEnvironment} [environment]
 * @returns {string}
 */
export function t(key, data = {}, environment = {}) {
  const template = localizeValue(`SLOWINSERT.${key}`, environment);
  // Foundry's {name} format, without interpreting document content as HTML.
  return template.replace(/\{([^}]+)\}/g, (token, name) =>
    Object.hasOwn(data, name) ? String(data[name]) : token);
}

/**
 * @param {SlowInsertEnvironment} [environment]
 * @returns {string}
 */
export function currentLocale(environment = {}) {
  const lang = environment.lang ?? (/** @type {any} */ (globalThis)).game?.i18n?.lang ?? "en";
  // Foundry's established Simplified Chinese language id is "cn".
  try { return Intl.getCanonicalLocales(lang === "cn" ? "zh-CN" : lang)[0] || "en"; }
  catch { return "en"; }
}
