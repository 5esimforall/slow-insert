/** Exercise the runtime classifier against an existing metadata audit. Reads
 * only saved reports, never a live world or original database. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSourceEnvironment } from "../module/scripts/source-resolution.mjs";
import { resolveSource } from "../module/scripts/source.mjs";

export async function auditSources(input, output) {
  const read = name => fs.readFile(path.join(input, name), "utf8").then(JSON.parse);
  const [records, rawPacks, scope] = await Promise.all([read("records.json"), read("packs.json"), read("scope.json")]);
  const modules = new Map(), packs = new Map();
  const system = { id: scope.system }, world = { id: scope.world };
  for (const pack of rawPacks) {
    const pkg = { active: true, flags: { dnd5e: { sourceBooks: pack.packageSourceBooks } } };
    if (pack.package === system.id) Object.assign(system, pkg);
    else if (pack.package === world.id) Object.assign(world, pkg);
    else modules.set(pack.package, pkg);
    packs.set(pack.id, { title: pack.label, metadata: {
      flags: pack.flags, packageName: pack.package,
      packageType: pack.package === system.id ? "system" : pack.package === world.id ? "world" : "module"
    } });
  }
  const strings = JSON.parse(await fs.readFile(new URL("../module/lang/en.json", import.meta.url), "utf8"));
  const env = prepareSourceEnvironment({ packs, modules, system, world, lang: "en", localize: key => strings[key] ?? key });
  const counts = {}, options = new Map(), rows = [];
  for (const record of records) {
    const item = {
      uuid: record.uuid, name: record.name, package: record.pack, packageName: record.packLabel,
      documentType: record.documentType, subType: record.type, system: { source: record.source }
    };
    const source = resolveSource(item, env);
    counts[source.status] = (counts[source.status] ?? 0) + 1;
    for (const option of source.options) {
      const old = options.get(option.value) ?? { ...option, count: 0 };
      old.count++;
      options.set(option.value, old);
    }
    rows.push({ uuid: record.uuid, name: record.name, source: record.source, status: source.status, label: source.label, keys: source.keys, tooltip: source.title });
  }
  const summary = {
    method: "Runtime resolver over saved offline metadata; not a live index, no importer runtime catalog or migrations",
    input: path.resolve(input), inputGeneratedAt: scope.generatedAt, count: rows.length, counts,
    publications: [...options.values()].filter(option => option.section === "books").length,
    reviewOptions: [...options.values()].filter(option => option.section === "review").length,
    options: [...options.values()].sort((a, b) => b.count - a.count)
  };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  await fs.writeFile(path.join(output, "classifications.json"), JSON.stringify(rows, null, 2) + "\n");
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: node tools/audit-sources.mjs INPUT_AUDIT OUTPUT_DIRECTORY");
  const summary = await auditSources(input, output);
  console.log(JSON.stringify({ count: summary.count, counts: summary.counts, publications: summary.publications, reviewOptions: summary.reviewOptions }, null, 2));
}
