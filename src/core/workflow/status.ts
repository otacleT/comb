import { hasErrors, type Diagnostic } from '../diagnostics.js';
import { headingBlocks } from '../markdown/blocks.js';
import type { ChangeSnapshot } from '../project/load.js';

export type ArtifactId = 'proposal' | 'delta' | 'review' | 'clarify' | 'tasks' | 'apply';
export type ArtifactState = 'done' | 'missing' | 'invalid' | 'in-progress';

export interface ArtifactStatus {
  id: ArtifactId;
  state: ArtifactState;
  detail?: string;
}

export interface ChangeStatus {
  change: string;
  artifacts: ArtifactStatus[];
  next: ArtifactId | 'archive';
  tasks: { done: number; total: number };
}

export const ARTIFACT_ORDER: readonly ArtifactId[] = ['proposal', 'delta', 'review', 'clarify', 'tasks', 'apply'];

export function countTasks(text: string | undefined): { done: number; total: number } {
  const boxes = [...(text ?? '').matchAll(/^\s*[-*]\s+\[( |x|X)\]/gm)];
  return { done: boxes.filter((m) => m[1] !== ' ').length, total: boxes.length };
}

export function proposalComplete(text: string): boolean {
  const h2 = new Set(headingBlocks(text).filter((b) => b.depth === 2).map((b) => b.text));
  return ['Why', 'What Changes', 'Impact'].every((h) => h2.has(h));
}

export function computeStatus(change: ChangeSnapshot, validation: Diagnostic[]): ChangeStatus {
  const tasks = countTasks(change.files.tasks);
  const errors = validation.filter((d) => d.severity === 'error').length;
  const proposal: ArtifactStatus =
    change.files.proposal === undefined
      ? { id: 'proposal', state: 'missing' }
      : proposalComplete(change.files.proposal)
        ? { id: 'proposal', state: 'done' }
        : { id: 'proposal', state: 'invalid', detail: 'needs ## Why, ## What Changes, ## Impact' };
  const delta: ArtifactStatus =
    change.deltas.length === 0
      ? { id: 'delta', state: 'missing' }
      : hasErrors(validation)
        ? { id: 'delta', state: 'invalid', detail: `${errors} error(s)` }
        : { id: 'delta', state: 'done' };
  const review: ArtifactStatus = { id: 'review', state: change.files.review === undefined ? 'missing' : 'done' };
  const clarify: ArtifactStatus = { id: 'clarify', state: 'done', detail: 'questions arrive in M2' };
  const taskFile: ArtifactStatus = { id: 'tasks', state: change.files.tasks === undefined ? 'missing' : 'done' };
  const apply: ArtifactStatus =
    tasks.total === 0
      ? { id: 'apply', state: 'missing' }
      : tasks.done === tasks.total
        ? { id: 'apply', state: 'done' }
        : { id: 'apply', state: 'in-progress', detail: `${tasks.done}/${tasks.total}` };
  const artifacts = [proposal, delta, review, clarify, taskFile, apply];
  const next = artifacts.find((a) => a.state !== 'done')?.id ?? 'archive';
  return { change: change.id, artifacts, next, tasks };
}
