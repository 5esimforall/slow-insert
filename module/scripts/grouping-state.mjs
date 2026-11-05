import { GROUP_RULE_VERSION, normalizeGrouping, migratePins } from './grouping.mjs';

// Client settings are origin-wide in Foundry. Include the world explicitly;
// neither the cache nor its undo slot is a world document or shared GM setting.
export const groupingSettingKey = world => `groupingState-${encodeURIComponent(world?.id ?? 'unknown')}`;
export function validSnapshot(value) {
  if (!value || value.version !== 1 || value.ruleVersion !== GROUP_RULE_VERSION
    || !value.records || typeof value.records !== 'object' || Array.isArray(value.records) || !value.groups || typeof value.groups !== 'object' || Array.isArray(value.groups)) return null;
  const records=Object.entries(value.records),groups=Object.entries(value.groups);
  if(records.length>100000||groups.length>50000)return null;
  for(const [uuid,r] of records)if(!r||uuid.length>500||typeof r.fingerprint!=='string'||r.fingerprint.length>2000
    || (r.nameFingerprint!==null&&typeof r.nameFingerprint!=='string') || (r.key!==null&&typeof r.key!=='string'))return null;
  for(const [key,g] of groups)if(!g||key.length>500||g.kind!=='spell'||!['2014','2024'].includes(g.rules)||!Number.isInteger(g.level)||typeof g.school!=='string'||![null,'implementation'].includes(g.risk)
    || !['identifier','source-suffix'].includes(g.reason)||!Array.isArray(g.members)||g.members.length<2
    || new Set(g.members).size!==g.members.length||g.members.some(id=>!Object.hasOwn(value.records,id)||value.records[id].key!==key))return null;
  for(const [uuid,r] of records)if(r.key&&(!Object.hasOwn(value.groups,r.key)||!value.groups[r.key].members.includes(uuid)))return null;
  return structuredClone(value);
}
export function normalizeGroupingState(value,legacy) {
  const saved=value?.version===2?value:null;
  const active=validSnapshot(saved?.active);
  const previous=saved?.previous && (saved.previous.active===null||validSnapshot(saved.previous.active))
    ? {active:validSnapshot(saved.previous.active),preferences:normalizeGrouping(saved.previous.preferences)}:null;
  return {version:2,preferences:normalizeGrouping(saved?.preferences??legacy),active,previous};
}
export function applyGroupingState(state,snapshot) {
  const active=validSnapshot(snapshot);
  if(!active)throw new Error('Invalid grouping snapshot');
  return {version:2,preferences:{...normalizeGrouping(state.preferences),pins:migratePins(state.preferences.pins,active)},active,
    previous:{active:state.active,preferences:structuredClone(state.preferences)}};
}
export function undoGroupingState(state) {
  if(!state.previous)return state;
  return {version:2,preferences:{...normalizeGrouping(state.previous.preferences),enabled:state.preferences.enabled},active:state.previous.active,previous:null};
}
