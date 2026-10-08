import { diag, type Diagnostic } from '../diagnostics.js';
import { headingBlocks } from '../markdown/blocks.js';

export interface DocRefs {
  requirements: ReadonlySet<string>;
  retired: ReadonlySet<string>;
  decisions: ReadonlySet<string>;
  /** Change id → the question ids of its archived questions.md. */
  questions: ReadonlyMap<string, ReadonlySet<string>>;
  /** Whether comb/config.yaml has a non-empty context (what `config:context` cites). */
  context: boolean;
  /** Superseded decision → the decision that replaced it. */
  superseded: ReadonlyMap<string, string>;
}

export interface Citations {
  requirements: string[];
  decisions: string[];
  questions: { change: string; id: string }[];
  context: boolean;
}

const REQ_RE = /\bREQ-[A-Z][A-Z0-9]*-\d{3,}\b/g;
const DECISION_RE = /\bD-\d{3,}\b/g;
const QUESTION_RE = /\b([a-z0-9]+(?:-[a-z0-9]+)*)#(Q-\d+)\b/g;
const CONTEXT = 'config:context';

export function extractCitations(text: string): Citations {
  const questions = new Map<string, { change: string; id: string }>();
  for (const m of text.matchAll(QUESTION_RE)) questions.set(`${m[1]}#${m[2]}`, { change: m[1]!, id: m[2]! });
  return {
    requirements: [...new Set(text.match(REQ_RE) ?? [])],
    decisions: [...new Set(text.match(DECISION_RE) ?? [])],
    questions: [...questions.values()],
    context: text.includes(CONTEXT),
  };
}

const citesAnything = (c: Citations): boolean => c.requirements.length + c.decisions.length + c.questions.length > 0 || c.context;

const DATED_CHANGE_RE = /^\d{4}-\d{2}-\d{2}-(.+)$/;

/**
 * Every cited id must exist in the canonical sources (documents reflect archived content only). Outside a document
 * that tells the decision history (`history`), citing a superseded decision is a warning.
 */
export function checkCitations(text: string, file: string, refs: DocRefs, opts: { history?: boolean } = {}): Diagnostic[] {
  const c = extractCitations(text);
  const fix = 'Cite an id that exists in the canonical specs and decisions, or remove the statement';
  const questionFix = (q: { change: string; id: string }): string => {
    const undated = DATED_CHANGE_RE.exec(q.change)?.[1];
    return undated !== undefined && refs.questions.get(undated)?.has(q.id) ? `Cite it as ${undated}#${q.id} (without the date)` : fix;
  };
  return [
    ...c.requirements
      .filter((id) => !refs.requirements.has(id))
      .map((id) => diag('error', 'REF_UNKNOWN_REQ', refs.retired.has(id) ? `${id} was removed from the specs` : `${id} is not in the specs`, { file, id }, fix)),
    ...c.decisions.filter((id) => !refs.decisions.has(id)).map((id) => diag('error', 'REF_UNKNOWN_DECISION', `${id} is not in comb/decisions.md`, { file, id }, fix)),
    ...c.questions
      .filter((q) => !refs.questions.get(q.change)?.has(q.id))
      .map((q) => diag('error', 'REF_UNKNOWN_QUESTION', `${q.change}#${q.id} is not a question of an archived change`, { file, id: `${q.change}#${q.id}` }, questionFix(q))),
    ...(opts.history ? [] : c.decisions
      .filter((id) => refs.superseded.has(id))
      .map((id) => diag('warning', 'DOC_CITES_SUPERSEDED', `${id} was superseded by ${refs.superseded.get(id)}`, { file, id }, 'Cite the decision that replaced it, or rewrite the document with /comb:docs'))),
    ...(c.context && !refs.context
      ? [diag('error', 'REF_EMPTY_CONTEXT', 'config:context is cited, but comb/config.yaml has no context', { file }, 'Write the context in comb/config.yaml, or cite requirements instead')]
      : []),
  ];
}

/** `##` and `###` sections (heading included) without any citation, except "## Gaps" and everything under it. */
export function uncitedSections(text: string, file: string): Diagnostic[] {
  const blocks = headingBlocks(text).filter((b) => b.depth === 2 || b.depth === 3);
  const gaps = blocks.filter((b) => b.depth === 2 && b.text === 'Gaps');
  return blocks
    .filter((b) => !gaps.some((g) => b.start >= g.start && b.start < g.end))
    .filter((b) => !citesAnything(extractCitations(text.slice(b.start, b.end))))
    .map((b) => diag('warning', 'DOC_UNCITED_SECTION', `"${b.text}" cites nothing`, { file, line: b.line }, 'Cite the requirements or decisions it comes from, or move it under ## Gaps'));
}
