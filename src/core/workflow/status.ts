import type { Diagnostic } from '../diagnostics.js';
import { parseQuestions } from '../decision/parse.js';
import { headingBlocks } from '../markdown/blocks.js';
import type { ChangeSnapshot } from '../project/load.js';
import { deltaHash } from './hash.js';
import { readReviewStamp } from './review-stamp.js';

export type ArtifactId = 'proposal' | 'delta' | 'review' | 'clarify' | 'tasks' | 'apply';
export type ArtifactState = 'done' | 'missing' | 'invalid' | 'in-progress' | 'stale' | 'blocked';

export interface ArtifactStatus {
  id: ArtifactId;
  state: ArtifactState;
  detail?: string;
}

export interface QuestionCounts {
  open: number;
  openHigh: number;
  answered: number;
  deferred: number;
}

export interface ChangeStatus {
  change: string;
  artifacts: ArtifactStatus[];
  next: ArtifactId | 'archive';
  tasks: { done: number; total: number };
  questions: QuestionCounts;
  baseDrift: string[];
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

const errorsIn = (validation: Diagnostic[], belongs: (file: string) => boolean): number =>
  validation.filter((d) => d.severity === 'error' && d.target?.file !== undefined && belongs(d.target.file)).length;

export function computeStatus(change: ChangeSnapshot, validation: Diagnostic[]): ChangeStatus {
  const tasks = countTasks(change.files.tasks);
  const deltaFiles = new Set(change.deltas.map((d) => d.file));
  const deltaErrors = errorsIn(validation, (f) => deltaFiles.has(f));
  const qdErrors = errorsIn(
    validation,
    (f) => f.endsWith(`changes/${change.id}/questions.md`) || f.endsWith(`changes/${change.id}/decisions.md`),
  );
  const proposal: ArtifactStatus =
    change.files.proposal === undefined
      ? { id: 'proposal', state: 'missing' }
      : proposalComplete(change.files.proposal)
        ? { id: 'proposal', state: 'done' }
        : { id: 'proposal', state: 'invalid', detail: 'needs ## Why, ## What Changes, ## Impact' };
  const delta: ArtifactStatus =
    change.deltas.length === 0
      ? { id: 'delta', state: 'missing' }
      : deltaErrors > 0
        ? { id: 'delta', state: 'invalid', detail: `${deltaErrors} error(s)` }
        : { id: 'delta', state: 'done' };
  const stamp = readReviewStamp(change.files.review);
  const review: ArtifactStatus =
    change.files.review === undefined
      ? { id: 'review', state: 'missing' }
      : stamp.reviewed === null
        ? { id: 'review', state: 'stale', detail: 'not marked reviewed (run comb mark-reviewed)' }
        : stamp.reviewed !== deltaHash(change)
          ? { id: 'review', state: 'stale', detail: 'the delta changed since the review' }
          : { id: 'review', state: 'done' };
  const questions = parseQuestions(change.files.questions ?? '', 'questions.md').questions;
  const counts: QuestionCounts = {
    open: questions.filter((q) => q.status === 'open').length,
    openHigh: questions.filter((q) => q.status === 'open' && q.severity === 'high').length,
    answered: questions.filter((q) => q.status === 'answered').length,
    deferred: questions.filter((q) => q.status === 'deferred').length,
  };
  const clarify: ArtifactStatus =
    qdErrors > 0
      ? { id: 'clarify', state: 'invalid', detail: `${qdErrors} error(s)` }
      : counts.openHigh > 0
        ? { id: 'clarify', state: 'blocked', detail: `${counts.openHigh} high question(s) open` }
        : counts.open > 0
          ? { id: 'clarify', state: 'done', detail: `${counts.open} open (medium/low)` }
          : { id: 'clarify', state: 'done' };
  const taskFile: ArtifactStatus = { id: 'tasks', state: change.files.tasks === undefined ? 'missing' : 'done' };
  const apply: ArtifactStatus =
    tasks.total === 0
      ? { id: 'apply', state: 'missing' }
      : tasks.done === tasks.total
        ? { id: 'apply', state: 'done' }
        : { id: 'apply', state: 'in-progress', detail: `${tasks.done}/${tasks.total}` };
  const artifacts = [proposal, delta, review, clarify, taskFile, apply];
  const next = artifacts.find((a) => a.state !== 'done')?.id ?? 'archive';
  const baseDrift = validation.filter((d) => d.code === 'BASE_DRIFT').map((d) => d.target?.id ?? '');
  return { change: change.id, artifacts, next, tasks, questions: counts, baseDrift };
}
