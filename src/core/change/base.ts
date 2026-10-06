import { writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import type { ChangeMeta, ChangeSnapshot, Project } from '../project/load.js';
import { paths } from '../project/paths.js';
import { blockHash } from '../workflow/hash.js';

interface BaseTarget {
  id: string;
  hash: string;
  file: string;
  line: number;
}

/** MODIFIED and REMOVED targets that exist in the canonical spec, with their current hashes. */
function baseTargets(project: Project, change: ChangeSnapshot): BaseTarget[] {
  return change.deltas.flatMap((d) => {
    const requirements = project.specs.get(d.capability)?.capability.requirements ?? [];
    const targets = [...d.delta.modified.map((r) => ({ id: r.id, line: r.line })), ...d.delta.removed.map((x) => ({ id: x.id, line: x.line }))];
    return targets.flatMap((t) => {
      const current = requirements.find((r) => r.id === t.id);
      return current ? [{ id: t.id, hash: blockHash(current.block), file: d.file, line: t.line }] : [];
    });
  });
}

/** BASE_DRIFT for each recorded target whose canonical block changed after it was recorded (S1). */
export function baseDrift(project: Project, change: ChangeSnapshot): Diagnostic[] {
  const recorded = change.meta?.base ?? {};
  return baseTargets(project, change)
    .filter((t) => recorded[t.id] !== undefined && recorded[t.id] !== t.hash)
    .map((t) =>
      diag('warning', 'BASE_DRIFT', `${t.id} changed in the spec after this change was proposed`, { file: t.file, line: t.line, id: t.id },
        'Update the delta to the current spec; archive then needs --allow-base-drift'),
    );
}

/** Targets that `.comb.yaml` does not record yet. Recorded hashes are never overwritten. */
export function unrecordedBase(project: Project, change: ChangeSnapshot): Record<string, string> {
  const recorded = change.meta?.base ?? {};
  return Object.fromEntries(baseTargets(project, change).filter((t) => recorded[t.id] === undefined).map((t) => [t.id, t.hash]));
}

/** Writes the unrecorded targets into `.comb.yaml` and returns their ids. */
export function recordBase(project: Project, change: ChangeSnapshot): string[] {
  if (!change.meta) return [];
  const add = unrecordedBase(project, change);
  const ids = Object.keys(add);
  if (ids.length === 0) return [];
  const meta: ChangeMeta = { ...change.meta, base: { ...change.meta.base, ...add } };
  writeFileSync(paths.changeMeta(project.root, change.id), stringify(meta));
  return ids;
}
