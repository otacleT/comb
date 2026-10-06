import { diag, type Diagnostic } from '../diagnostics.js';
import { headingBlocks } from '../markdown/blocks.js';
import { QUESTION_STATUSES, SEVERITIES, type Decision, type Question } from './model.js';

const FIELD_RE = /^\s*[-*]\s+\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*)$/;

/** `- **Field:** value` bullets (names lower-cased, trailing ` # comment` removed) and the remaining prose. */
export function readFields(segment: string): { fields: Map<string, string>; prose: string } {
  const fields = new Map<string, string>();
  const prose: string[] = [];
  for (const line of segment.split('\n')) {
    const m = FIELD_RE.exec(line);
    const name = m?.[1]?.trim().toLowerCase();
    if (m && name !== undefined && !fields.has(name)) {
      fields.set(name, (m[2] ?? '').replace(/\s+#\s.*$/, '').trim());
      continue;
    }
    prose.push(line);
  }
  return { fields, prose: prose.join('\n').trim() };
}

export function parseIdList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,、\s]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '' && !/^[—–-]+$/.test(t) && !t.startsWith('('));
}

const firstToken = (value: string | undefined): string | null => {
  const t = value?.trim().split(/\s+/)[0];
  return t ? t : null;
};

const orNull = (value: string | undefined): string | null => (value ? value : null);

export function parseQuestions(text: string, file: string): { questions: Question[]; diagnostics: Diagnostic[] } {
  const questions: Question[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const b of headingBlocks(text).filter((h) => h.depth === 2)) {
    const m = /^(Q-\d+):\s*(.*)$/.exec(b.text);
    if (!m) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `unexpected heading "${b.text}"`, { file, line: b.line }, 'Use "## Q-<n>: <question>"'));
      continue;
    }
    const id = m[1] as string;
    const { fields, prose } = readFields(text.slice(b.contentStart, b.end));
    const question: Question = {
      id,
      title: (m[2] ?? '').trim(),
      status: (fields.get('status') ?? '').toLowerCase(),
      severity: (fields.get('severity') ?? '').toLowerCase(),
      refs: parseIdList(fields.get('refs')),
      lens: orNull(fields.get('lens')),
      decision: orNull(fields.get('decision')),
      answer: /^\*\*Answer:\*\*\s*(.+)$/m.exec(prose)?.[1]?.trim() ?? null,
      line: b.line,
    };
    const t = { file, line: b.line, id };
    if (seen.has(id)) diagnostics.push(diag('error', 'SPEC_PARSE', `duplicate question ${id}`, t));
    seen.add(id);
    if (!(QUESTION_STATUSES as readonly string[]).includes(question.status)) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `${id}: Status must be one of ${QUESTION_STATUSES.join(', ')}`, t));
    }
    if (!(SEVERITIES as readonly string[]).includes(question.severity)) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `${id}: Severity must be one of ${SEVERITIES.join(', ')}`, t));
    }
    questions.push(question);
  }
  return { questions, diagnostics };
}

export function parseDecisions(text: string, file: string): { decisions: Decision[]; diagnostics: Diagnostic[] } {
  const decisions: Decision[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const b of headingBlocks(text).filter((h) => h.depth === 2)) {
    const m = /^(D-\d+):\s*(.*)$/.exec(b.text);
    if (!m) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `unexpected heading "${b.text}"`, { file, line: b.line }, 'Use "## D-<n>: <rule title>"'));
      continue;
    }
    const id = m[1] as string;
    const { fields, prose } = readFields(text.slice(b.contentStart, b.end));
    const whyAt = prose.search(/^\*\*Why:\*\*/m);
    const rule = (whyAt >= 0 ? prose.slice(0, whyAt) : prose).trim();
    const why = whyAt >= 0 ? prose.slice(whyAt).replace(/^\*\*Why:\*\*\s*/, '').trim() : '';
    const t = { file, line: b.line, id };
    if (seen.has(id)) diagnostics.push(diag('error', 'SPEC_PARSE', `duplicate decision ${id}`, t));
    seen.add(id);
    if (rule === '') diagnostics.push(diag('error', 'SPEC_PARSE', `${id}: the rule text is missing`, t, 'Write the rule as a paragraph under the fields'));
    decisions.push({
      id,
      title: (m[2] ?? '').trim(),
      date: orNull(fields.get('date')),
      refs: parseIdList(fields.get('refs')),
      from: firstToken(fields.get('from')),
      supersedes: firstToken(fields.get('supersedes')),
      supersededBy: firstToken(fields.get('superseded by')),
      change: orNull(fields.get('change')),
      rule,
      why: why === '' ? null : why,
      line: b.line,
    });
  }
  return { decisions, diagnostics };
}
