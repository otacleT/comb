import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocsContext } from '../docs/load.js';
import type { DocSource } from '../docs/profile.js';
import { writtenMarker } from '../docs/header.js';
import { sourceFiles } from '../docs/sources.js';
import type { DocState } from '../docs/status.js';

export interface DocsInstructions {
  artifact: 'docs';
  profile: string;
  dir: string;
  language: string;
  instruction: string;
  /** The profile's writing discipline (its SKILL.md). */
  discipline: string;
  /** `marker` is the exact first line to write: it carries the source hash the document is written for. */
  outputs: { id: string; path: string; state: DocState; marker: string; audience: string; sources: DocSource[]; template: string }[];
  context: { project: string; readFiles: string[] };
}

export function buildDocsInstructions(docs: DocsContext, templatesDir: string): DocsInstructions {
  const { project, profile, inputs, status } = docs;
  const instruction = readFileSync(join(templatesDir, 'instructions', 'docs.md'), 'utf8')
    .replace(/\{\{dir\}\}/g, status.dir)
    .replace(/\{\{language\}\}/g, project.config.language);
  return {
    artifact: 'docs',
    profile: profile.id,
    dir: status.dir,
    language: project.config.language,
    instruction,
    discipline: profile.skill,
    outputs: profile.outputs.map((o, i) => ({
      id: o.id,
      path: status.outputs[i]!.path,
      state: status.outputs[i]!.state,
      marker: writtenMarker(status.outputs[i]!.sourceHash),
      audience: o.audience,
      sources: o.sources,
      template: o.template,
    })),
    context: { project: project.config.context, readFiles: sourceFiles([...new Set(profile.outputs.flatMap((o) => o.sources))], inputs) },
  };
}
