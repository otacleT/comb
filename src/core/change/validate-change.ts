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
  return out;
}

export const addedIds = (change: ChangeSnapshot, exceptFile?: string): string[] =>
  change.deltas.filter((d) => d.file !== exceptFile).flatMap((d) => d.delta.added.map((r) => r.id));

export function validateChange(project: Project, change: ChangeSnapshot, all: ChangeSnapshot[]): Diagnostic[] {
  const out: Diagnostic[] = [...change.diagnostics];
  const others = all.filter((c) => c.id !== change.id).flatMap((c) => addedIds(c));
  for (const d of change.deltas) {
    const otherAdded = new Set([...addedIds(change, d.file), ...others]);
    const base = project.specs.get(d.capability)?.capability ?? null;
    out.push(...d.diagnostics, ...validateDelta(d.delta, base, d.file, otherAdded));
  }
  return out;
}
