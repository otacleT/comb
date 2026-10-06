import { diag, type Diagnostic } from '../diagnostics.js';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { validateCapability, validateDelta } from '../spec/validate-spec.js';

export function validateProject(project: Project): Diagnostic[] {
  const out: Diagnostic[] = [...project.diagnostics];
  const owner = new Map<string, string>();
  for (const spec of project.specs.values()) {
    out.push(...spec.diagnostics, ...validateCapability(spec.capability, spec.file));
    for (const r of spec.capability.requirements) {
      const prev = owner.get(r.id);
      if (prev !== undefined && prev !== spec.name) {
        out.push(diag('error', 'REQ_ID_DUPLICATE', `${r.id} is also defined in ${prev}`, { file: spec.file, line: r.line, id: r.id }));
      }
      if (prev === undefined) owner.set(r.id, spec.name);
    }
  }
  const prefixOwner = new Map<string, string>();
  for (const spec of project.specs.values()) {
    const prefix = spec.capability.prefix;
    if (!prefix) continue;
    const prev = prefixOwner.get(prefix);
    if (prev !== undefined) {
      out.push(diag('error', 'REQ_ID_PREFIX', `prefix ${prefix} is already used by ${prev}`, { file: spec.file, line: 1 }, 'Give each capability its own prefix'));
    } else {
      prefixOwner.set(prefix, spec.name);
    }
  }
  return out;
}

export const addedIds = (change: ChangeSnapshot, exceptFile?: string): string[] =>
  change.deltas.filter((d) => d.file !== exceptFile).flatMap((d) => d.delta.added.map((r) => r.id));

export function validateChange(project: Project, change: ChangeSnapshot, all: ChangeSnapshot[]): Diagnostic[] {
  const out: Diagnostic[] = [...change.diagnostics];
  const others = all.filter((c) => c.id !== change.id);
  const othersAdded = others.flatMap((c) => addedIds(c));
  // Requirement ids and prefixes are unique across the whole project, not just within a capability.
  const idOwner = new Map<string, string>();
  const retiredOwner = new Map<string, string>();
  const prefixOwner = new Map<string, string>();
  for (const spec of project.specs.values()) {
    for (const r of spec.capability.requirements) if (!idOwner.has(r.id)) idOwner.set(r.id, spec.name);
    for (const id of spec.capability.retired) if (!retiredOwner.has(id)) retiredOwner.set(id, spec.name);
    if (spec.capability.prefix && !prefixOwner.has(spec.capability.prefix)) prefixOwner.set(spec.capability.prefix, spec.name);
  }
  for (const c of others) {
    for (const d of c.deltas) {
      if (!project.specs.has(d.capability) && d.delta.prefix && !prefixOwner.has(d.delta.prefix)) prefixOwner.set(d.delta.prefix, d.capability);
    }
  }
  for (const d of change.deltas) {
    const otherAdded = new Set([...addedIds(change, d.file), ...othersAdded]);
    const base = project.specs.get(d.capability)?.capability ?? null;
    out.push(...d.diagnostics, ...validateDelta(d.delta, base, d.file, otherAdded));
    if (!base && d.delta.prefix) {
      const owner = prefixOwner.get(d.delta.prefix);
      if (owner !== undefined && owner !== d.capability) {
        out.push(diag('error', 'REQ_ID_PREFIX', `prefix ${d.delta.prefix} is already used by ${owner}`, { file: d.file, line: 1 },
          'Choose a prefix that is not in ids.prefixesInUse'));
      }
    }
    for (const r of d.delta.added) {
      const t = { file: d.file, line: r.line, id: r.id };
      const owner = idOwner.get(r.id);
      if (owner !== undefined && owner !== d.capability) out.push(diag('error', 'REQ_ID_DUPLICATE', `${r.id} is already defined in ${owner}`, t));
      const retiredBy = retiredOwner.get(r.id);
      if (retiredBy !== undefined && retiredBy !== d.capability) out.push(diag('error', 'REQ_ID_RETIRED', `${r.id} was retired in ${retiredBy}`, t));
    }
  }
  return out;
}
