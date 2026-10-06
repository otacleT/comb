import { parseDecisions } from '../decision/parse.js';
import { headingBlocks } from '../markdown/blocks.js';
import type { ChangeStatus } from '../workflow/status.js';
import type { ChangeSnapshot, Project } from './load.js';
import { paths, rel, type ChangeFileName } from './paths.js';

export interface ListData {
  specs: { capability: string; prefix: string | null; file: string; requirements: { id: string; title: string }[] }[];
  decisions: { id: string; title: string; supersededBy: string | null }[];
  changes: string[];
  archived: string[];
}

export type ShowData =
  | { kind: 'requirement'; id: string; capability: string; file: string; line: number; title: string; text: string; pendingChanges: string[] }
  | { kind: 'decision'; id: string; file: string; line: number; title: string; text: string; supersededBy: string | null }
  | { kind: 'change'; id: string; files: string[]; status: ChangeStatus };

export function listProject(project: Project, changes: ChangeSnapshot[], archived: string[]): ListData {
  return {
    specs: [...project.specs.values()].map((s) => ({
      capability: s.name,
      prefix: s.capability.prefix,
      file: s.file,
      requirements: s.capability.requirements.map((r) => ({ id: r.id, title: r.title })),
    })),
    decisions: parseDecisions(project.decisionsText ?? '', 'comb/decisions.md').decisions.map((d) => ({ id: d.id, title: d.title, supersededBy: d.supersededBy })),
    changes: changes.map((c) => c.id),
    archived,
  };
}

/** A canonical requirement (REQ-…), a canonical decision (D-NNN) or an active change, by id. */
export function showItem(project: Project, changes: ChangeSnapshot[], key: string, statusOf: (c: ChangeSnapshot) => ChangeStatus): ShowData | null {
  for (const s of project.specs.values()) {
    const r = s.capability.requirements.find((x) => x.id === key);
    if (!r) continue;
    const pendingChanges = changes
      .filter((c) => c.deltas.some((d) => [...d.delta.modified.map((m) => m.id), ...d.delta.removed.map((x) => x.id)].includes(key)))
      .map((c) => c.id);
    return { kind: 'requirement', id: r.id, capability: s.name, file: s.file, line: r.line, title: r.title, text: r.block.trim(), pendingChanges };
  }
  const log = project.decisionsText ?? '';
  const d = parseDecisions(log, 'comb/decisions.md').decisions.find((x) => x.id === key);
  if (d) {
    const block = headingBlocks(log).find((b) => b.depth === 2 && b.line === d.line);
    const text = block ? log.slice(block.start, block.end).trim() : '';
    return { kind: 'decision', id: d.id, file: rel(project.root, paths.decisions(project.root)), line: d.line, title: d.title, text, supersededBy: d.supersededBy };
  }
  const c = changes.find((x) => x.id === key);
  if (!c) return null;
  const files = [
    ...(Object.keys(c.files) as ChangeFileName[]).map((n) => rel(project.root, paths.changeFile(project.root, c.id, n))),
    ...c.deltas.map((x) => x.file),
  ].sort();
  return { kind: 'change', id: c.id, files, status: statusOf(c) };
}
