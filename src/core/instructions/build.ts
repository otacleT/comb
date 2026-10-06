import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDecisions, parseQuestions } from '../decision/parse.js';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { paths, rel, type ChangeFileName } from '../project/paths.js';
import { nextRequirementId } from '../spec/ids.js';
import { changedSince, requirementHashes } from '../workflow/hash.js';
import { readReviewStamp } from '../workflow/review-stamp.js';

export type InstructionArtifact = 'proposal' | 'delta' | 'tasks' | 'review' | 'clarify';
export const INSTRUCTION_ARTIFACTS: readonly InstructionArtifact[] = ['proposal', 'delta', 'tasks', 'review', 'clarify'];

export interface QuestionSummary {
  id: string;
  title: string;
  severity: string;
}

export interface Lens {
  id: string;
  definition: string;
}

export interface Instructions {
  artifact: InstructionArtifact;
  change: string;
  outputPath: string;
  alsoWrite: string[];
  template: string;
  instruction: string;
  rules: string[];
  language: string;
  lenses: Lens[];
  context: {
    project: string;
    capabilities: string[];
    readFiles: string[];
    openQuestions: QuestionSummary[];
    changedSinceReview: string[] | null;
    batch: number;
  };
  ids: { nextRequirement: Record<string, string>; prefixesInUse: string[]; nextQuestion: string; nextDecision: string };
}

const fill = (t: string, vars: Record<string, string>): string =>
  t.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => vars[k] ?? m);

export function nextRequirementIds(project: Project, changes: ChangeSnapshot[]): Record<string, string> {
  // Ids are unique project-wide, so every capability counts against every id in use.
  const used = [
    ...[...project.specs.values()].flatMap((s) => [...s.capability.requirements.map((r) => r.id), ...s.capability.retired]),
    ...changes.flatMap((c) => c.deltas.flatMap((d) => d.delta.added.map((r) => r.id))),
  ];
  const out: Record<string, string> = {};
  for (const spec of project.specs.values()) {
    if (spec.capability.prefix) out[spec.name] = nextRequirementId(spec.capability.prefix, used);
  }
  for (const c of changes) {
    for (const d of c.deltas) {
      if (project.specs.has(d.capability) || !d.delta.prefix || out[d.capability] !== undefined) continue;
      out[d.capability] = nextRequirementId(d.delta.prefix, used);
    }
  }
  return out;
}

export function prefixesInUse(project: Project, changes: ChangeSnapshot[]): string[] {
  const prefixes = [
    ...[...project.specs.values()].map((s) => s.capability.prefix),
    ...changes.flatMap((c) => c.deltas.filter((d) => !project.specs.has(d.capability)).map((d) => d.delta.prefix)),
  ];
  return [...new Set(prefixes.filter((p): p is string => p !== null))].sort();
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const idNumber = (id: string): number => Number(id.split('-')[1] ?? 0);
const nextLocalId = (prefix: 'Q' | 'D', ids: string[]): string => `${prefix}-${Math.max(0, ...ids.map(idNumber)) + 1}`;

export function openQuestions(change: ChangeSnapshot): QuestionSummary[] {
  return parseQuestions(change.files.questions ?? '', 'questions.md')
    .questions.filter((q) => q.status === 'open')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || idNumber(a.id) - idNumber(b.id))
    .map((q) => ({ id: q.id, title: q.title, severity: q.severity }));
}

export function buildInstructions(
  artifact: InstructionArtifact,
  project: Project,
  change: ChangeSnapshot,
  all: ChangeSnapshot[],
  templatesDir: string,
): Instructions {
  const root = project.root;
  const changeFile = (name: ChangeFileName): string => rel(root, paths.changeFile(root, change.id, name));
  const has = (name: ChangeFileName): boolean => change.files[name] !== undefined;
  const specFiles = [...project.specs.values()].map((s) => s.file);
  const projectDecisions = existsSync(paths.decisions(root)) ? [rel(root, paths.decisions(root))] : [];
  const proposal = has('proposal') ? [changeFile('proposal')] : [];
  const deltas = change.deltas.map((d) => d.file);
  const ownQuestionsAndDecisions = [...(has('questions') ? [changeFile('questions')] : []), ...(has('decisions') ? [changeFile('decisions')] : [])];
  const touchedSpecs = change.deltas.map((d) => project.specs.get(d.capability)?.file).filter((f): f is string => f !== undefined);
  const readFiles: Record<InstructionArtifact, string[]> = {
    proposal: [...specFiles, ...projectDecisions],
    delta: [...specFiles, ...projectDecisions, ...proposal],
    tasks: [...proposal, ...deltas],
    review: [...specFiles, ...projectDecisions, ...proposal, ...deltas, ...ownQuestionsAndDecisions],
    clarify: [...ownQuestionsAndDecisions, ...deltas, ...touchedSpecs, ...projectDecisions],
  };
  const deltaPattern = `comb/changes/${change.id}/specs/<capability>/spec.md`;
  const outputPath = artifact === 'delta' ? deltaPattern : changeFile(artifact === 'clarify' ? 'decisions' : artifact);
  const alsoWrite =
    artifact === 'review' ? [changeFile('questions')] : artifact === 'clarify' ? [changeFile('questions'), deltaPattern] : [];
  const formats = artifact === 'review' ? ['review', 'questions'] : artifact === 'clarify' ? ['decisions', 'questions'] : [artifact];
  const read = (dir: string, name: string): string => readFileSync(join(templatesDir, dir, `${name}.md`), 'utf8');
  const vars = {
    change: change.id,
    language: project.config.language,
    questionsPath: changeFile('questions'),
    decisionsPath: changeFile('decisions'),
  };
  const questions = parseQuestions(change.files.questions ?? '', 'questions.md').questions;
  const decisions = parseDecisions(change.files.decisions ?? '', 'decisions.md').decisions;
  return {
    artifact,
    change: change.id,
    outputPath,
    alsoWrite,
    template: formats.map((f) => read('formats', f)).join('\n'),
    instruction: fill(read('instructions', artifact), vars),
    rules: project.config.rules[artifact] ?? [],
    language: project.config.language,
    lenses: artifact === 'review' ? project.config.review.lenses.map((id) => ({ id, definition: read('lenses', id) })) : [],
    context: {
      project: project.config.context,
      capabilities: [...project.specs.keys()],
      readFiles: readFiles[artifact],
      openQuestions: openQuestions(change),
      changedSinceReview: changedSince(readReviewStamp(change.files.review).requirements, requirementHashes(change)),
      batch: project.config.review.batch,
    },
    ids: {
      nextRequirement: nextRequirementIds(project, all),
      prefixesInUse: prefixesInUse(project, all),
      nextQuestion: nextLocalId('Q', questions.map((q) => q.id)),
      nextDecision: nextLocalId('D', decisions.map((d) => d.id)),
    },
  };
}
