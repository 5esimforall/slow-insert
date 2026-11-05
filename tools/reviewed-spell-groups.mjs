import { digest } from "./audit-dedup.mjs";

/** Approval is for specific audited records, not for every future name match. */
export function reviewedSpellGroups(findings, records, approvals) {
  const index = new Map(records.map(record => [record.uuid, record]));
  const signature = uuids => [...uuids].sort().join("\n");
  const candidates = new Set((findings.spellSourceSuffixReview ?? []).map(group => signature(group.members.map(r => r.uuid))));
  const seen = new Set();
  return approvals.map(approval => {
    if (approval.risk !== "implementation" || !candidates.has(signature(approval.members.map(r => r.uuid)))) {
      throw new Error(`Spell approval needs review: ${approval.key}`);
    }
    const rows = approval.members.map(member => {
      const record = index.get(member.uuid);
      if (!record || digest(record) !== member.fingerprint || seen.has(member.uuid)) {
        throw new Error(`Spell approval is stale or overlapping: ${member.uuid}`);
      }
      seen.add(member.uuid);
      return record;
    });
    if (!rows.some(row => approval.key === `spell:${row.rules}:${row.identifier}`)) {
      throw new Error(`Spell approval has no canonical member: ${approval.key}`);
    }
    return { ...approval, rows };
  });
}
