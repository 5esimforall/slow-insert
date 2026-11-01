/** Resolve at render time, after Foundry has loaded the selected language. */
export function localizeValue(key, environment = {}) {
  return environment.localize?.(key) ?? globalThis.game?.i18n?.localize(key) ?? key;
}

export function t(key, data = {}, environment = {}) {
  const template = localizeValue(`SLOWINSERT.${key}`, environment);
  // Foundry's {name} format, without interpreting document content as HTML.
  return template.replace(/\{([^}]+)\}/g, (token, name) =>
    Object.hasOwn(data, name) ? String(data[name]) : token);
}

export function currentLocale(environment = {}) {
  const lang = environment.lang ?? globalThis.game?.i18n?.lang ?? "en";
  // Foundry's established Simplified Chinese language id is "cn".
  try { return Intl.getCanonicalLocales(lang === "cn" ? "zh-CN" : lang)[0] || "en"; }
  catch { return "en"; }
}
