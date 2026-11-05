// Test/offline-tool mount for the sibling plugin's PUBLIC, versioned entry.
// Installed browser code uses Foundry's normal modules/<id>/ directory layout.
const entry = new URL('../../fvtt-zh-aliases/modules/truesight/api-v1.mjs', import.meta.url).href;
export function resolve(specifier, context, nextResolve) {
  if (specifier === '../../truesight/api-v1.mjs') return {url: entry, shortCircuit: true};
  return nextResolve(specifier, context);
}
