/** Analyze audit fingerprints. This tool does not read or modify Foundry data. */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const validIdentifier = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function bookEdition(value) {
  const text=String(value??"").toLowerCase();
  if (/(phb|dmg|mm)[\s'’]*(?:20)?(?:24|25)\b|\bx(?:phb|dmg|mm)\b|srd\s*5\.2/.test(text)) return "2024";
  if (/(phb|dmg|mm)[\s'’]*(?:20)?14\b|srd\s*5\.1/.test(text)) return "2014";
  return null;
}
export function editionEvidence(record) {
  const evidence=[
    ["source.rules",["2014","2024"].includes(record.rules)?record.rules:null,record.rules],
    ...[["source.book",record.source?.book],["source.custom",record.source?.custom],["pack.sourceBook",record.packSource],
      ["single-book package",record.packageSourceBooks?.length===1?record.packageSourceBooks[0]:null]]
      .map(([field,value])=>[field,bookEdition(value),value])
  ].filter(([,edition])=>edition).map(([field,edition,value])=>({field,edition,value}));
  const editions=[...new Set(evidence.map(e=>e.edition))];
  return {status:editions.length>1?"conflict":editions.length===1?"consistent":"unknown",edition:editions.length===1?editions[0]:null,evidence};
}
export function groupBy(records, key) {
  const groups=new Map();
  for (const record of records) { const value=key(record); if (value==null) continue; const id=JSON.stringify(value); if(!groups.has(id))groups.set(id,[]);groups.get(id).push(record); }
  return [...groups.values()].filter(group=>group.length>1);
}
const count=groups=>({groups:groups.length,members:groups.reduce((n,g)=>n+g.length,0),excessRows:groups.reduce((n,g)=>n+g.length-1,0)});
const frequency=values=>{const out={};for(const value of values)out[value]=(out[value]??0)+1;return out;};
export function analyze(records,scope={}) {
  const index=new Map(records.map(r=>[r.uuid,r]));
  const edition=new Map(records.map(r=>[r.uuid,editionEvidence(r)]));
  const strict=groupBy(records,r=>[r.documentType,r.type,r.hashes.strict]);
  const strictAllowlisted=strict.filter(group=> {
    if(group.some(r=>r.world||edition.get(r.uuid).status!=="consistent"))return false;
    if(new Set(group.map(r=>r.uuid.split(".").at(-1))).size!==1)return false;
    const packages=[...new Set(group.map(r=>r.package))].sort().join("|");
    return ["dnd-monster-manual|dnd5e","dnd-players-handbook|dnd5e"].includes(packages);
  });
  const names=groupBy(records,r=>[r.documentType,r.type,r.nameKey]);
  const identifiers=groupBy(records,r=>r.identifier?[r.documentType,r.type,r.identifier]:null);
  const crossEdition=identifiers.filter(g=>new Set(g.map(r=>r.rules).filter(Boolean)).size>1);
  const spells=groupBy(records,r=>r.type==="spell"&&validIdentifier(r.identifier)&&r.rules?[r.identifier,r.rules]:null);
  const spellProblems=spells.filter(g=>g.some(r=>edition.get(r.uuid).status==="conflict"||r.basics.level==null||!r.basics.school)
    || new Set(g.map(r=>JSON.stringify([r.basics.level,r.basics.school]))).size>1);
  const problemUuids=new Set(spellProblems.flatMap(g=>g.map(r=>r.uuid)));
  const spellCandidates=spells.filter(g=>!g.some(r=>problemUuids.has(r.uuid)));
  const provenance=records.flatMap(child=>child.provenance.map(p=>({child:child.uuid,source:p.uuid,field:p.field,target:index.has(p.uuid)})));
  const resolved=provenance.filter(p=>p.target&&p.child!==p.source);
  const provenanceConflicts=resolved.filter(p=>{const a=index.get(p.child),b=index.get(p.source);return a.rules&&b.rules&&a.rules!==b.rules;});
  const editionConflicts=records.filter(r=>edition.get(r.uuid).status==="conflict");
  const grants=new Map();
  for(const r of records)for(const target of r.grants??[]) {if(!grants.has(target))grants.set(target,[]);grants.get(target).push({uuid:r.uuid,name:r.name,type:r.type,identifier:r.identifier});}
  const brief=r=>({uuid:r.uuid,name:r.name,aliases:r.aliases,pack:r.pack,type:r.type,rules:r.rules,edition:edition.get(r.uuid),
    identifier:r.identifier,source:r.source,packSource:r.packSource,parent:r.parent,grantedBy:grants.get(r.uuid)??[],
    flags:r.flags,activities:r.activityCount,effects:r.effectCount,basics:r.basics});
  const groupRecord=(g,kind,n)=>({id:`${kind}-${String(n+1).padStart(4,"0")}`,kind,name:g[0].name,type:g[0].type,rules:[...new Set(g.map(r=>r.rules))],
    count:g.length,identifiers:[...new Set(g.map(r=>r.identifier))],differentSystemFields:[...new Set(g.flatMap(r=>Object.keys(r.fields)))].filter(key=>new Set(g.map(r=>r.fields[key]??null)).size>1),
    differentPayloads:new Set(g.map(r=>r.hashes.strict)).size,members:g.map(brief)});
  const summary={scope:{...scope},total:records.length,types:frequency(records.map(r=>r.type)),
    identifiers:{missing:records.filter(r=>!r.identifier).length,literalHyphen:records.filter(r=>r.identifier==="-").length,
      hyphenFeats:records.filter(r=>r.identifier==="-"&&r.type==="feat").length,
      canonicalSyntax:records.filter(r=>validIdentifier(r.identifier)).length,
      noncanonicalSyntax:records.filter(r=>r.identifier&&!validIdentifier(r.identifier)).length},
    rulesTags:frequency(records.map(r=>r.rules??"unknown")),editionEvidence:frequency([...edition.values()].map(r=>r.status)),
    translationAliasRecords:records.filter(r=>r.aliases.length).length,worldRecords:records.filter(r=>r.world).length,
    cohorts:{sameName:count(names),sameIdentifier:count(identifiers),crossEditionIdentifier:count(crossEdition),
      strictPayload:count(strict),allowlistedExact:count(strictAllowlisted),spellFamilyCandidates:count(spellCandidates),spellConflictOrMissingFacets:count(spellProblems)},
    provenance:{records:records.filter(r=>r.provenance.length).length,edges:provenance.length,resolved:resolved.length,
      crossRules:provenanceConflicts.length,strictPayloadEqual:resolved.filter(p=>index.get(p.child).hashes.strict===index.get(p.source).hashes.strict).length},
    caveat:"Cohorts overlap and must not be added. excessRows is only a candidate display reduction, never a count of deletable records. Offline persisted records are not runtime-migrated documents."};
  const results={summary,
    exactCandidates:strict.map((g,n)=>groupRecord(g,"exact",n)),
    exactAllowlist:strictAllowlisted.map(g=>g.map(r=>r.uuid)),
    spellCandidates:spellCandidates.map((g,n)=>groupRecord(g,"spell-family",n)),
    spellProblems:spellProblems.map((g,n)=>groupRecord(g,"spell-review",n)),
    editionConflicts:editionConflicts.map(brief),
    provenanceConflicts:provenanceConflicts.map(p=>({field:p.field,child:brief(index.get(p.child)),source:brief(index.get(p.source))})),
    examples:Object.fromEntries(["forcecage","fireball","spell-scroll","potion-of-resistance","longsword","extra-attack"].map(id=>[id,records.filter(r=>r.identifier===id).map(brief)]))};
  return results;
}
const csv=value=>`"${String(value??"").replaceAll('"','""')}"`;
async function main(out) {
  const records=JSON.parse(await fs.readFile(path.join(out,"records.json"),"utf8"));
  const scope=JSON.parse(await fs.readFile(path.join(out,"scope.json"),"utf8"));
  const results=analyze(records,scope);
  await fs.writeFile(path.join(out,"findings.json"),JSON.stringify(results,null,2));
  await fs.writeFile(path.join(out,"summary.json"),JSON.stringify(results.summary,null,2));
  for(const [filename,rows] of [
    ["exact-candidates.csv",[["group","name","type","rules","uuid","pack","initialAllowlist"],...results.exactCandidates.flatMap(g=>g.members.map(r=>[g.id,r.name,r.type,r.rules,r.uuid,r.pack,results.exactAllowlist.some(a=>a.includes(r.uuid))]))]],
    ["edition-conflicts.csv",[["name","type","uuid","taggedRules","evidence"],...results.editionConflicts.map(r=>[r.name,r.type,r.uuid,r.rules,JSON.stringify(r.edition.evidence)])]],
    ["spell-review.csv",[["group","name","uuid","rules","level","school"],...results.spellProblems.flatMap(g=>g.members.map(r=>[g.id,r.name,r.uuid,r.rules,r.basics.level,r.basics.school]))]],
    ["spell-families.csv",[["group","name","uuid","rules","level","school","flags","status"],...results.spellCandidates.flatMap(g=>g.members.map(r=>[g.id,r.name,r.uuid,r.rules,r.basics.level,r.basics.school,r.flags.join(";"),"candidate only; implementations retained"]))]]
  ]) await fs.writeFile(path.join(out,filename),"\ufeff"+rows.map(row=>row.map(csv).join(",")).join("\n")+"\n");
  console.log(JSON.stringify(results.summary,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main(path.resolve(process.argv[2]));
