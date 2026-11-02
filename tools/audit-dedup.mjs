/** Offline, non-destructive compendium audit. Never opens original databases.
 * Usage: node tools/audit-dedup.mjs --data-root PATH --world ID --out PATH
 * Raw LevelDB files are verified before/after cloning, read only in a temporary
 * directory, and discarded. Reports contain metadata and hashes, not book text.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const digest = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export const normalizeName = name => String(name ?? "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
export function withoutLocation(doc) {
  // Preserve all system fields, effects, flags, names, images and internal IDs.
  // Exclude only top-level storage/audit metadata. This is intentionally strict.
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !["_id", "_stats", "folder", "sort", "ownership"].includes(key)));
}
export function hydrate(rows, collection) {
  const index = new Map(rows), missing = [];
  function resolve(doc, coll, id) {
    const result = structuredClone(doc);
    for (const field of ["items", "effects"]) {
      if (!Array.isArray(result[field])) continue;
      result[field] = result[field].map(child => {
        if (child && typeof child === "object") return child;
        const key = `!${coll}.${field}!${id}.${child}`;
        const value = index.get(key);
        if (!value) { missing.push(key); return { unresolvedEmbeddedReference: child }; }
        return resolve(value, `${coll}.${field}`, `${id}.${child}`);
      });
    }
    return result;
  }
  const documents = rows.filter(([key]) => key.startsWith(`!${collection}!`)).map(([key, doc]) => resolve(doc, collection, key.split("!")[2]));
  return { documents, missing };
}
export function canonicalUuid(uuid, type = "Item") {
  if (typeof uuid !== "string") return null;
  if (/^Compendium\.[^.]+\.[^.]+\.[^.]+$/.test(uuid)) {
    const bits = uuid.split("."); bits.splice(3, 0, type); return bits.join(".");
  }
  return /^(Compendium\.|Item\.|Actor\.)/.test(uuid) ? uuid : null;
}
function references(doc, type) {
  const paths = [
    ["stats.compendiumSource", doc._stats?.compendiumSource],
    ["stats.duplicateSource", doc._stats?.duplicateSource],
    ["flags.core.sourceId", doc.flags?.core?.sourceId],
    ["native-class-growth.originalUuid", doc.flags?.["native-class-growth"]?.originalUuid]
  ];
  return paths.filter(([, value]) => canonicalUuid(value, type)).map(([field, value]) => ({ field, uuid: canonicalUuid(value, type) }));
}
function flagNamespaces(value, result = new Set()) {
  if (!value || typeof value !== "object") return result;
  if (value.flags && typeof value.flags === "object") for (const [key, flags] of Object.entries(value.flags)) {
    if (flags && Object.keys(flags).length) result.add(key);
  }
  for (const child of Object.values(value)) if (child && typeof child === "object") flagNamespaces(child, result);
  return result;
}
function grantReferences(value, out = new Set()) {
  if (typeof value === "string" && value.startsWith("Compendium.")) {
    const uuid=canonicalUuid(value); if (uuid) out.add(uuid);
  } else if (value && typeof value === "object") for (const child of Object.values(value)) grantReferences(child,out);
  return [...out];
}
function project(doc, pack, aliases) {
  const system = doc.system ?? {}, source = system.source ?? system.details?.source ?? {};
  const uuid = pack.worldDocument ? `${pack.type}.${doc._id}` : `Compendium.${pack.id}.${pack.type}.${doc._id}`;
  const sourceObject = typeof source === "string" ? { custom: source } : source;
  const structuredSystem = structuredClone(system);
  delete structuredSystem.description; delete structuredSystem.source; delete structuredSystem.identifier;
  if (structuredSystem.details) { delete structuredSystem.details.biography; delete structuredSystem.details.source; }
  const description = system.description?.value ?? system.details?.biography?.value ?? "";
  const resolvedAliases = [...new Set([...(aliases[doc._id] ?? []), ...(aliases[doc.name] ?? [])])];
  return {
    uuid, pack: pack.id, package: pack.package, packLabel: pack.label, world: Boolean(pack.worldDocument),
    documentType: pack.type, type: doc.type, name: doc.name, aliases: resolvedAliases,
    nameKey: normalizeName(doc.name), identifier: system.identifier ?? null,
    rules: sourceObject.rules || null, revision: sourceObject.revision ?? null,
    source: sourceObject, packSource: pack.flags?.dnd5e?.sourceBook ?? null,
    packageSourceBooks: Object.keys(pack.packageSourceBooks ?? {}),
    parent: { classIdentifier: system.classIdentifier, requirements: system.requirements, type: system.type, prerequisite: system.prerequisite },
    provenance: references(doc, pack.type), plutonium: doc.flags?.plutonium ?? doc.flags?.["plutonium-cn"] ?? null,
    grants: grantReferences(system.advancement),
    flags: [...flagNamespaces(doc)].sort(), rootFlagKeys: Object.keys(doc.flags ?? {}).sort(),
    activityCount: Object.keys(system.activities ?? {}).length, effectCount: doc.effects?.length ?? 0, embeddedItemCount: doc.items?.length ?? 0,
    descriptionPresent: Boolean(description), descriptionHasChinese: /[\u3400-\u9fff]/.test(description),
    hashes: {
      strict: digest(withoutLocation(doc)), system: digest(system), structuredSystem: digest(structuredSystem),
      description: digest(description), effects: digest(doc.effects ?? []), flags: digest(doc.flags ?? {}),
      embeddedItems: digest(doc.items ?? []), image: digest(doc.img ?? null)
    },
    fields: Object.fromEntries(Object.entries(system).map(([key,value]) => [key,digest(value)])),
    stats: { systemVersion: doc._stats?.systemVersion, coreVersion: doc._stats?.coreVersion,
      modifiedTime: doc._stats?.modifiedTime ?? null },
    basics: { level: system.level, school: system.school, activation: system.activation, duration: system.duration,
      range: system.range, target: system.target, materials: system.materials, properties: system.properties,
      rarity: system.rarity, attunement: system.attunement, magicalBonus: system.magicalBonus,
      cr: system.details?.cr, creatureType: system.details?.type, size: system.traits?.size }
  };
}
async function fileDigests(root) {
  const output = {};
  for (const ent of (await fs.readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (ent.isDirectory()) {
      for (const [key,value] of Object.entries(await fileDigests(path.join(root,ent.name)))) output[`${ent.name}/${key}`] = value;
    } else if (ent.isFile()) output[ent.name] = createHash("sha256").update(await fs.readFile(path.join(root,ent.name))).digest("hex");
    else throw new Error(`Unexpected database entry: ${root}/${ent.name}`);
  }
  return output;
}
export async function run({dataRoot, worldId, out, levelModule}) {
  if (!dataRoot || !worldId || !out || !levelModule) throw new Error("data-root, world, out and level-module required");
  dataRoot = path.resolve(dataRoot); out = path.resolve(out);
  if (out === dataRoot || out.startsWith(dataRoot + path.sep)) throw new Error("Audit output must be outside Foundry Data");
  if (!/^[a-zA-Z0-9_-]+$/.test(worldId)) throw new Error("Invalid world id");
  const { ClassicLevel } = await import(pathToFileURL(path.resolve(levelModule)).href);
  const temp = await fs.mkdtemp("/private/tmp/slow-insert-dedup-audit-");
  const proofs = [], failures = [];
  async function readSnapshot(source, label) {
    const destination = path.join(temp, `db-${proofs.length}`);
    const before = await fileDigests(source);
    execFileSync("cp", ["-cR", source, destination]);
    const after = await fileDigests(source), copy = await fileDigests(destination);
    if (digest(before) !== digest(after) || digest(before) !== digest(copy)) throw new Error(`Database changed during snapshot: ${label}`);
    const db = new ClassicLevel(destination,{valueEncoding:"json",createIfMissing:false});
    let rows;
    try { rows = await db.iterator().all(); } finally { await db.close(); }
    proofs.push({label,source,sha256:digest(before),files:Object.keys(before).length,verifiedCopy:true,originalOpened:false});
    await fs.rm(destination,{recursive:true});
    return rows;
  }
  await fs.mkdir(out,{recursive:true});
  try {
    const worldRoot = path.join(dataRoot,"worlds",worldId);
    const settingsRows = await readSnapshot(path.join(worldRoot,"data/settings"),"world settings");
    const settings = {};
    for (const [,row] of settingsRows) if (["core.moduleConfiguration","core.compendiumConfiguration","babele.translationSources"].includes(row.key) || row.key?.startsWith("quick-insert.")) {
      try { settings[row.key]=JSON.parse(row.value); } catch { settings[row.key]=row.value; }
    }
    const world = JSON.parse(await fs.readFile(path.join(worldRoot,"world.json"),"utf8"));
    const manifests = [path.join(worldRoot,"world.json"),path.join(dataRoot,"systems",world.system,"system.json"),
      ...Object.entries(settings["core.moduleConfiguration"]??{}).filter(([,active])=>active).map(([id])=>path.join(dataRoot,"modules",id,"module.json"))];
    const packs = [], aliases = {}, records = [], excluded = [];
    const indexing = settings["quick-insert.indexingDisabled"] ?? {};
    for (const filename of manifests) {
      let manifest; try {manifest=JSON.parse(await fs.readFile(filename,"utf8"));} catch(error) {failures.push({manifest:filename,error:String(error)});continue;}
      for (const pack of manifest.packs ?? []) {
        if (!["Item","Actor"].includes(pack.type)) continue;
        const entry = {...pack,id:`${manifest.id}.${pack.name}`,package:manifest.id,packageVersion:manifest.version,
          path:path.resolve(path.dirname(filename),pack.path), packageSourceBooks:manifest.flags?.dnd5e?.sourceBooks ?? {}};
        if (entry.path.endsWith(".db")) {
          const migrated = entry.path.slice(0,-3);
          if (await fs.stat(path.join(migrated,"CURRENT")).then(s=>s.isFile()).catch(()=>false)) {
            entry.declaredPath = entry.path; entry.path = migrated;
          }
        }
        if (indexing.entities?.[pack.type]?.includes(4) || indexing.packs?.[entry.id]?.includes(4)) {excluded.push({pack:entry.id,reason:"Quick Insert GM indexing exclusion"});continue;}
        packs.push(entry);
      }
    }
    // Read aliases from installed active translation packages, not from guessed names.
    // These are alias evidence, not a simulation of Babele runtime precedence.
    for (const [moduleId, dir] of [["dnd-simplified-chinese-babele-patch","translation/cn"],["mm2025-zh-complete","translations"]]) {
      if (!settings["core.moduleConfiguration"]?.[moduleId]) continue;
      for (const pack of packs) {
        let translation; try {translation=JSON.parse(await fs.readFile(path.join(dataRoot,"modules",moduleId,dir,`${pack.id}.json`),"utf8"));} catch {continue;}
        const entries = Array.isArray(translation.entries) ? translation.entries.map(v=>[v.id??v._id,v]) : Object.entries(translation.entries ?? {});
        aliases[pack.id] ??= {};
        for (const [key,value] of entries) if (key && typeof value?.name==="string") (aliases[pack.id][key]??=[]).push(value.name);
      }
    }
    if (!indexing.directory?.root?.includes(4)) for (const [type,collection] of [["Item","items"],["Actor","actors"]]) {
      if (!indexing.entities?.[type]?.includes(4)) packs.push({id:`world.${collection}`,package:worldId,label:`World ${type}`,type,path:path.join(worldRoot,"data",collection),worldDocument:true});
    }
    for (const pack of packs) {
      try {
        const rows = await readSnapshot(pack.path,pack.id);
        const {documents,missing} = hydrate(rows,pack.type==="Item"?"items":"actors");
        if (missing.length) failures.push({pack:pack.id,unresolvedEmbedded:missing});
        let count=0, omitted=0;
        for (const doc of documents) {
          if (pack.type==="Actor" && doc.type!=="npc") {omitted++;continue;}
          records.push(project(doc,pack,aliases[pack.id]??{}));count++;
        }
        pack.audit={rootDocuments:documents.length,audited:count,omittedNonNpcActors:omitted,rows:rows.length,unresolvedEmbedded:missing.length};
      } catch(error) {failures.push({pack:pack.id,error:String(error)});}
    }
    const scope = {generatedAt:new Date().toISOString(),world:worldId,system:world.system,coreVersion:world.coreVersion,systemVersion:world.systemVersion,
      method:"Verified offline snapshots of enabled Item/NPC packs and world roots; GM Quick Insert exclusions applied; not a live-index dump",
      limitations:["No runtime migrations or module hooks executed","Babele files provide aliases only, not authoritative runtime translation precedence","Character actors, embedded actor items as independent results, other document types and inactive packs excluded","Hashes are persisted-data comparisons, not proof of semantic equivalence"],
      activeModules:Object.values(settings["core.moduleConfiguration"]??{}).filter(Boolean).length,indexing,excluded,failures,recordCount:records.length};
    await fs.writeFile(path.join(out,"records.json"),JSON.stringify(records));
    await fs.writeFile(path.join(out,"scope.json"),JSON.stringify(scope,null,2));
    await fs.writeFile(path.join(out,"packs.json"),JSON.stringify(packs,null,2));
    await fs.writeFile(path.join(out,"snapshot-proof.json"),JSON.stringify(proofs,null,2));
    console.log(JSON.stringify({records:records.length,packs:packs.length,failures,verifiedSnapshots:proofs.length}));
    return {scope,packs,records};
  } finally { await fs.rm(temp,{recursive:true}); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=Object.fromEntries(process.argv.slice(2).reduce((all,arg,index,values)=>arg.startsWith("--")?[...all,[arg.slice(2),values[index+1]]]:all,[]));
  await run({dataRoot:args["data-root"],worldId:args.world,out:args.out,levelModule:args["level-module"]});
}
