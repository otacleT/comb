import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { paths, rel } from '../project/paths.js';
import { nextRequirementId } from '../spec/ids.js';

export type InstructionArtifact = 'proposal' | 'delta' | 'tasks';
export const INSTRUCTION_ARTIFACTS: readonly InstructionArtifact[] = ['proposal', 'delta', 'tasks'];

export interface Instructions {
  artifact: InstructionArtifact;
  change: string;
  outputPath: string;
  template: string;
  instruction: string;
  rules: string[];
  language: string;
  context: { project: string; capabilities: string[]; readFiles: string[] };
  ids: { nextRequirement: Record<string, string> };
}

const fill = (t: string, vars: Record<string, string>): string =>
  t.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => vars[k] ?? m);

export function nextRequirementIds(project: Project, changes: ChangeSnapshot[]): Record<string, string> {
  const inFlight = changes.flatMap((c) => c.deltas.flatMap((d) => d.delta.added.map((r) => r.id)));
  const out: Record<string, string> = {};
  for (const spec of project.specs.values()) {
    const prefix = spec.capability.prefix;
    if (!prefix) continue;
    const used = [...spec.capability.requirements.map((r) => r.id), ...spec.capability.retired, ...inFlight];
    out[spec.name] = nextRequirementId(prefix, used);
  }
  for (const c of changes) {
    for (const d of c.deltas) {
      if (project.specs.has(d.capability) || !d.delta.prefix || out[d.capability] !== undefined) continue;
      out[d.capability] = nextRequirementId(d.delta.prefix, inFlight);
    }
  }
  return out;
}

export function buildInstructions(
  artifact: InstructionArtifact,
  project: Project,
  change: ChangeSnapshot,
  all: ChangeSnapshot[],
  templatesDir: string,
): Instructions {
  const root = project.root;
  const specFiles = [...project.specs.values()].map((s) => s.file);
  const decisions = existsSync(paths.decisions(root)) ? [rel(root, paths.decisions(root))] : [];
  const proposal = change.files.proposal !== undefined ? [rel(root, paths.changeFile(root, change.id, 'proposal'))] : [];
  const deltas = change.deltas.map((d) => d.file);
  const readFiles =
    artifact === 'proposal'
      ? [...specFiles, ...decisions]
      : artifact === 'delta'
        ? [...specFiles, ...decisions, ...proposal]
        : [...proposal, ...deltas];
  const outputPath =
    artifact === 'delta'
      ? `comb/changes/${change.id}/specs/<capability>/spec.md`
      : rel(root, paths.changeFile(root, change.id, artifact));
  const vars = { change: change.id, language: project.config.language };
  return {
    artifact,
    change: change.id,
    outputPath,
    template: readFileSync(join(templatesDir, 'formats', `${artifact}.md`), 'utf8'),
    instruction: fill(readFileSync(join(templatesDir, 'instructions', `${artifact}.md`), 'utf8'), vars),
    rules: project.config.rules[artifact] ?? [],
    language: project.config.language,
    context: { project: project.config.context, capabilities: [...project.specs.keys()], readFiles },
    ids: { nextRequirement: nextRequirementIds(project, all) },
  };
}
