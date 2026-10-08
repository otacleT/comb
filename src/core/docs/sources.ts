import { createHash } from 'node:crypto';
import { parseDecisions, parseQuestions } from '../decision/parse.js';
import type { ArchivedQuestions, Project } from '../project/load.js';
import type { DocRefs } from './citations.js';
import type { DocSource } from './profile.js';

export interface DocInputs {
  context: string;
  specs: { file: string; text: string }[];
  decisions: { file: string; text: string } | null;
  questions: ArchivedQuestions[];
}

export function docInputs(project: Project, questions: ArchivedQuestions[]): DocInputs {
  return {
    context: project.config.context,
    specs: [...project.specs.values()].map((s) => ({ file: s.file, text: s.text })),
    decisions: project.decisionsText === null ? null : { file: 'comb/decisions.md', text: project.decisionsText },
    questions,
  };
}

const byFile = <T extends { file: string }>(xs: readonly T[]): T[] => [...xs].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

/** The root-relative files an output reads (config means comb/config.yaml). */
export function sourceFiles(sources: readonly DocSource[], inputs: DocInputs): string[] {
  const files = sources.flatMap((s) => {
    if (s === 'config') return ['comb/config.yaml'];
    if (s === 'specs') return byFile(inputs.specs).map((f) => f.file);
    if (s === 'decisions') return inputs.decisions ? [inputs.decisions.file] : [];
    return byFile(inputs.questions).map((f) => f.file);
  });
  return [...new Set(files)];
}

/** Hash of the declared sources only, so an output goes stale exactly when what it is built from changes. */
export function sourceHash(sources: readonly DocSource[], inputs: DocInputs): string {
  const parts: string[] = [];
  for (const s of [...new Set(sources)].sort()) {
    if (s === 'config') parts.push(`config:context\n${inputs.context}`);
    if (s === 'specs') for (const f of byFile(inputs.specs)) parts.push(`${f.file}\n${f.text}`);
    if (s === 'decisions') parts.push(`comb/decisions.md\n${inputs.decisions?.text ?? ''}`);
    if (s === 'open-questions') for (const f of byFile(inputs.questions)) parts.push(`${f.file}\n${f.text}`);
  }
  return `sha256:${createHash('sha256').update(parts.join('\n\n')).digest('hex').slice(0, 16)}`;
}

/** What documents may cite: canonical requirements (and retired ones, to name them), spec sections, decisions and archived questions. */
export function docRefs(project: Project, questions: ArchivedQuestions[]): DocRefs {
  const capabilities = [...project.specs.values()].map((s) => s.capability);
  const decisions = parseDecisions(project.decisionsText ?? '', 'comb/decisions.md').decisions;
  const byChange = new Map<string, Set<string>>();
  for (const q of questions) {
    const ids = byChange.get(q.change) ?? new Set<string>();
    for (const x of parseQuestions(q.text, q.file).questions) ids.add(x.id);
    byChange.set(q.change, ids);
  }
  return {
    requirements: new Set(capabilities.flatMap((c) => c.requirements.map((r) => r.id))),
    retired: new Set(capabilities.flatMap((c) => c.retired)),
    decisions: new Set(decisions.map((d) => d.id)),
    questions: byChange,
    context: project.config.context.trim() !== '',
    superseded: new Map(decisions.filter((d) => d.supersededBy !== null).map((d) => [d.id, d.supersededBy as string])),
    sections: new Map([...project.specs.entries()].map(([name, s]) => [name, s.capability.sections.map((x) => x.heading)])),
  };
}
