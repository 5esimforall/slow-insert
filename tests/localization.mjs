import { readFileSync } from "node:fs";
export const dictionaries = Object.fromEntries(["en", "cn"].map(lang => [lang,
  JSON.parse(readFileSync(new URL(`../module/lang/${lang}.json`, import.meta.url), "utf8"))]));
export function language(lang, overrides = {}) {
  const strings = { ...dictionaries.en, ...dictionaries[lang], ...overrides };
  return { lang, localize: key => Object.hasOwn(strings, key) ? strings[key] : key };
}
