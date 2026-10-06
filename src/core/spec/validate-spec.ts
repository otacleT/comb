import { diag, type Diagnostic } from '../diagnostics.js';
import { isRequirementId, prefixOf } from './ids.js';
import type { Capability, Delta, Requirement } from './model.js';

export function checkRequirementShape(r: Requirement, prefix: string | null, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const target = { file, line: r.line, ...(r.id ? { id: r.id } : {}) };
  if (!isRequirementId(r.id)) {
    out.push(diag('error', 'REQ_ID_FORMAT', `invalid requirement id "${r.id}"`, target, 'Use REQ-<PREFIX>-<NNN>, e.g. REQ-ORDER-001'));
  } else if (prefix && prefixOf(r.id) !== prefix) {
    out.push(diag('error', 'REQ_ID_PREFIX', `id "${r.id}" does not use prefix ${prefix}`, target));
  }
  if (r.title === '') out.push(diag('error', 'SPEC_PARSE', 'requirement has no title', target));
  if (r.scenarios.length === 0) {
    out.push(diag('error', 'REQ_NO_SCENARIO', `${r.id || 'requirement'} has no scenario`, target, 'Add at least one "#### Scenario: <name>"'));
  }
  return out;
}

export function validateCapability(cap: Capability, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!cap.prefix) out.push(diag('error', 'SPEC_PARSE', 'frontmatter "prefix" is required', { file, line: 1 }, 'Add "prefix: <PREFIX>"'));
  if (!cap.hasRequirementsHeading) out.push(diag('error', 'SPEC_PARSE', 'missing "## Requirements" section', { file }));
  const seen = new Set<string>();
  for (const r of cap.requirements) {
    out.push(...checkRequirementShape(r, cap.prefix, file));
    const target = { file, line: r.line, id: r.id };
    if (seen.has(r.id)) out.push(diag('error', 'REQ_ID_DUPLICATE', `duplicate id ${r.id}`, target));
    seen.add(r.id);
    if (cap.retired.includes(r.id)) out.push(diag('error', 'REQ_ID_RETIRED', `${r.id} was retired and must not be reused`, target));
  }
  return out;
}

export function validateDelta(
  delta: Delta,
  base: Capability | null,
  file: string,
  otherAdded: ReadonlySet<string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const prefix = base?.prefix ?? delta.prefix;
  const changeCount =
    delta.added.length + delta.modified.length + delta.removed.length + delta.addedSections.length + delta.modifiedSections.length +
    (delta.purpose !== null ? 1 : 0);
  if (changeCount === 0) out.push(diag('error', 'DELTA_EMPTY', 'delta has no changes', { file }));
  if (!base) {
    if (!delta.prefix) out.push(diag('error', 'SPEC_PARSE', `new capability "${delta.capability}" needs "prefix" in frontmatter`, { file, line: 1 }));
    if (!delta.purpose) out.push(diag('error', 'SPEC_PARSE', `new capability "${delta.capability}" needs "## Purpose"`, { file }));
  }
  const baseReqs = new Map((base?.requirements ?? []).map((r) => [r.id, r]));
  const retired = new Set(base?.retired ?? []);
  const where = new Map<string, string[]>();
  const note = (id: string, kind: string): void => {
    where.set(id, [...(where.get(id) ?? []), kind]);
  };

  for (const r of delta.added) {
    note(r.id, 'ADDED');
    out.push(...checkRequirementShape(r, prefix, file));
    const t = { file, line: r.line, id: r.id };
    if (baseReqs.has(r.id)) out.push(diag('error', 'DELTA_ID_EXISTS', `${r.id} already exists`, t, 'Use MODIFIED, or take the next free id'));
    if (retired.has(r.id)) out.push(diag('error', 'REQ_ID_RETIRED', `${r.id} was retired`, t));
    if (otherAdded.has(r.id)) out.push(diag('error', 'REQ_ID_DUPLICATE', `${r.id} is also added by another delta or change`, t));
  }
  for (const r of delta.modified) {
    note(r.id, 'MODIFIED');
    out.push(...checkRequirementShape(r, prefix, file));
    const t = { file, line: r.line, id: r.id };
    const old = baseReqs.get(r.id);
    if (!old) {
      out.push(diag('error', 'DELTA_TARGET_MISSING', `${r.id} does not exist in the current spec`, t, 'Use ADDED for new requirements'));
      continue;
    }
    const kept = new Set(r.scenarios.map((s) => s.name));
    const dropped = old.scenarios.map((s) => s.name).filter((n) => !kept.has(n));
    if (dropped.length > 0) {
      out.push(diag('warning', 'SCENARIO_DROPPED', `${r.id} drops scenarios: ${dropped.join(', ')}`, t,
        'MODIFIED must contain the whole requirement, including unchanged scenarios'));
    }
  }
  for (const x of delta.removed) {
    note(x.id, 'REMOVED');
    const t = { file, line: x.line, id: x.id };
    if (!baseReqs.has(x.id)) out.push(diag('error', 'DELTA_TARGET_MISSING', `${x.id} does not exist in the current spec`, t));
    if (!x.reason) out.push(diag('error', 'REMOVED_NO_REASON', `${x.id} needs **Reason:**`, t));
  }
  for (const [id, kinds] of where) {
    if (kinds.length > 1) out.push(diag('error', 'DELTA_CONFLICT', `${id} appears in ${kinds.join(' and ')}`, { file, id }));
  }
  for (const s of [...delta.addedSections, ...delta.modifiedSections]) {
    if (s.heading === 'Requirements') {
      out.push(diag('error', 'SPEC_PARSE', 'a delta section cannot be named "Requirements"', { file, line: s.line },
        'Change requirements under ADDED / MODIFIED / REMOVED Requirements'));
    }
  }
  const baseSections = new Set((base?.sections ?? []).map((s) => s.heading));
  for (const s of delta.modifiedSections) {
    if (!baseSections.has(s.heading)) out.push(diag('error', 'DELTA_TARGET_MISSING', `section "${s.heading}" does not exist`, { file, line: s.line }));
  }
  for (const s of delta.addedSections) {
    if (baseSections.has(s.heading)) out.push(diag('error', 'DELTA_ID_EXISTS', `section "${s.heading}" already exists`, { file, line: s.line }));
  }
  return out;
}
