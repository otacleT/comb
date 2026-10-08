import { diag, type Diagnostic } from '../diagnostics.js';
import type { Decision, Question } from './model.js';

export interface RefContext {
  requirements: ReadonlySet<string>;
  canonicalDecisions: ReadonlySet<string>;
  localDecisions: ReadonlySet<string>;
  questions: ReadonlySet<string>;
}

/** "none: <reason>", also with a full-width colon or the reason in parentheses. */
const NONE_WITH_REASON = /^none\s*(?:[:：]\s*\S|[(（])/i;

export function validateQuestions(questions: Question[], file: string, ctx: RefContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const q of questions) {
    const t = { file, line: q.line, id: q.id };
    for (const r of q.refs) {
      if (!ctx.requirements.has(r)) out.push(diag('error', 'REF_UNKNOWN_REQ', `${q.id} refers to unknown requirement ${r}`, t));
    }
    if (q.status !== 'answered') continue;
    if (!q.decision) {
      out.push(diag('error', 'QUESTION_UNRESOLVED_LINK', `${q.id} is answered but has no Decision`, t,
        'Add "- **Decision:** D-<n>" or "- **Decision:** none: <reason>"'));
    } else if (/^none\b/i.test(q.decision) && !NONE_WITH_REASON.test(q.decision)) {
      out.push(diag('error', 'QUESTION_UNRESOLVED_LINK', `${q.id} is answered with no decision but gives no reason`, t,
        'Write "- **Decision:** none: <reason>"'));
    } else if (!/^none\b/i.test(q.decision) && !ctx.localDecisions.has(q.decision) && !ctx.canonicalDecisions.has(q.decision)) {
      out.push(diag('error', 'REF_UNKNOWN_DECISION', `${q.id} points to unknown decision ${q.decision}`, t));
    }
  }
  return out;
}

export function validateDecisions(decisions: Decision[], file: string, ctx: RefContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of decisions) {
    const t = { file, line: d.line, id: d.id };
    for (const r of d.refs) {
      if (!ctx.requirements.has(r)) out.push(diag('error', 'REF_UNKNOWN_REQ', `${d.id} refers to unknown requirement ${r}`, t));
    }
    if (d.from && !ctx.questions.has(d.from)) {
      out.push(diag('error', 'REF_UNKNOWN_QUESTION', `${d.id} comes from unknown question ${d.from}`, t));
    }
    if (d.supersedes && !ctx.canonicalDecisions.has(d.supersedes)) {
      out.push(diag('error', 'REF_UNKNOWN_DECISION', `${d.id} supersedes unknown decision ${d.supersedes}`, t,
        'Supersedes must name a decision in comb/decisions.md'));
    }
  }
  return out;
}

export function checkDecisionRefs(
  refs: string[],
  known: ReadonlySet<string>,
  target: { file: string; line: number; id: string },
): Diagnostic[] {
  return refs.filter((r) => !known.has(r)).map((r) => diag('error', 'REF_UNKNOWN_DECISION', `${target.id} cites unknown decision ${r}`, target));
}
