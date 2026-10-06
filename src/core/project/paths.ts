import { join, relative, sep } from 'node:path';

export const CHANGE_FILES = ['proposal', 'tasks', 'review', 'questions', 'decisions'] as const;
export type ChangeFileName = (typeof CHANGE_FILES)[number];

export const paths = {
  comb: (root: string) => join(root, 'comb'),
  config: (root: string) => join(root, 'comb', 'config.yaml'),
  decisions: (root: string) => join(root, 'comb', 'decisions.md'),
  specsDir: (root: string) => join(root, 'comb', 'specs'),
  spec: (root: string, cap: string) => join(root, 'comb', 'specs', cap, 'spec.md'),
  changesDir: (root: string) => join(root, 'comb', 'changes'),
  change: (root: string, id: string) => join(root, 'comb', 'changes', id),
  changeMeta: (root: string, id: string) => join(root, 'comb', 'changes', id, '.comb.yaml'),
  changeFile: (root: string, id: string, name: ChangeFileName) => join(root, 'comb', 'changes', id, `${name}.md`),
  delta: (root: string, id: string, cap: string) => join(root, 'comb', 'changes', id, 'specs', cap, 'spec.md'),
  archiveDir: (root: string) => join(root, 'comb', 'changes', 'archive'),
};

/** Root-relative path with forward slashes (stable in JSON output). */
export const rel = (root: string, p: string): string => relative(root, p).split(sep).join('/');
