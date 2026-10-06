import { diag, type Diagnostic } from '../diagnostics.js';
import { headingBlocks, type HeadingBlock } from '../markdown/blocks.js';
import { QUESTION_STATUSES, SEVERITIES, type Decision, type Question } from './model.js';

const FIELD_RE = /^\s*[-*]\s+\*\*([A-Za-z][A-Za-z ]*)(?::\*\*|\*\*\s*:)\s*(.*)$/;

/**
 * `- **Field:** value` (or `- **Field**: value`) bullets, names lower-cased and trailing ` # comment` removed,
 * and the remaining prose. A field written twice keeps its first value and is listed in `duplicates`.
 */
export function readFields(segment: string): { fields: Map<string, string>; prose: string; duplicates: string[] } {
  const fields = new Map<string, string>();
  const duplicates: string[] = [];
  const prose: string[] = [];
  for (const line of segment.split('\n')) {
    const m = FIELD_RE.exec(line);
    const name = m?.[1]?.trim().toLowerCase();
    if (m && name !== undefined) {
      if (!fields.has(name)) {
        fields.set(name, (m[2] ?? '').replace(/\s+#\s.*$/, '').trim());
        continue;
      }
      if (!duplicates.includes(name)) duplicates.push(name);
    }
    prose.push(line);
  }
  return { fields, prose: prose.join('\n').trim(), duplicates };
}

const display = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** One SPEC_PARSE per known field that is written twice (later lines would otherwise be ignored silently). */
function duplicateFields(duplicates: string[], known: readonly string[], t: { file: string; line: number; id: string }): Diagnostic[] {
  return duplicates
    .filter((n) => known.includes(n))
    .map((n) => diag('error', 'SPEC_PARSE', `${t.id}: ${display(n)} is written twice`, t, `Keep one "- **${display(n)}:**" line`));
}

/** The first word of an enum-like value, without Markdown decoration, HTML comments or a trailing note. */
const enumValue = (value: string): string =>
  value.replace(/<!--.*?-->/g, '').replace(/[`*]/g, '').trim().split(/[\s(（]/)[0]!.toLowerCase();

/** Checks an enum field: missing and bad values get separate messages, each with a fix. */
function enumField(
  raw: string | undefined, name: string, allowed: readonly string[], t: { file: string; line: number; id: string },
): { value: string; diagnostics: Diagnostic[] } {
  const fix = `Write "- **${name}:** <${allowed.join('|')}>"`;
  if (raw === undefined || raw === '') return { value: '', diagnostics: [diag('error', 'SPEC_PARSE', `${t.id}: ${name} is missing`, t, fix)] };
  const value = enumValue(raw);
  if (allowed.includes(value)) return { value, diagnostics: [] };
  return { value, diagnostics: [diag('error', 'SPEC_PARSE', `${t.id}: ${name} "${raw}" is not one of ${allowed.join(', ')}`, t, fix)] };
}

/**
 * The level-2 blocks of a questions or decisions file. An entry heading (`Q-1: …`, `D-1: …`) at any other level
 * would be dropped or merged into the previous entry, so it is reported and cuts the previous block short.
 */
function entryBlocks(text: string, file: string, idPrefix: 'Q' | 'D', fix: string): { blocks: HeadingBlock[]; diagnostics: Diagnostic[] } {
  const all = headingBlocks(text);
  const misplaced = all.filter((h) => h.depth !== 2 && new RegExp(`^${idPrefix}-\\d+\\b`).test(h.text));
  const diagnostics = misplaced.map((h) =>
    diag('error', 'SPEC_PARSE', `"${h.text}" must be a level-2 heading`, { file, line: h.line }, fix),
  );
  const blocks = all
    .filter((h) => h.depth === 2)
    .map((b) => {
      const cut = misplaced.find((h) => h.start > b.start && h.start < b.end);
      return cut ? { ...b, end: cut.start } : b;
    });
  return { blocks, diagnostics };
}

const QUESTION_FIELDS = ['status', 'severity', 'refs', 'lens', 'decision'] as const;
const DECISION_FIELDS = ['date', 'refs', 'from', 'supersedes', 'superseded by', 'change'] as const;
const byLine = (a: Diagnostic, b: Diagnostic): number => (a.target?.line ?? 0) - (b.target?.line ?? 0);

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
  const fix = 'Use "## Q-<n>: <question>"';
  const { blocks, diagnostics } = entryBlocks(text, file, 'Q', fix);
  const seen = new Set<string>();
  for (const b of blocks) {
    const m = /^(Q-\d+):\s*(.*)$/.exec(b.text);
    if (!m) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `unexpected heading "${b.text}"`, { file, line: b.line }, fix));
      continue;
    }
    const id = m[1] as string;
    const { fields, prose, duplicates } = readFields(text.slice(b.contentStart, b.end));
    const t = { file, line: b.line, id };
    const status = enumField(fields.get('status'), 'Status', QUESTION_STATUSES, t);
    const severity = enumField(fields.get('severity'), 'Severity', SEVERITIES, t);
    const question: Question = {
      id,
      title: (m[2] ?? '').trim(),
      status: status.value,
      severity: severity.value,
      refs: parseIdList(fields.get('refs')),
      lens: orNull(fields.get('lens')),
      decision: orNull(fields.get('decision')),
      answer: /^\*\*Answer:\*\*\s*(.+)$/m.exec(prose)?.[1]?.trim() ?? null,
      line: b.line,
    };
    if (seen.has(id)) diagnostics.push(diag('error', 'SPEC_PARSE', `duplicate question ${id}`, t));
    seen.add(id);
    diagnostics.push(...status.diagnostics, ...severity.diagnostics, ...duplicateFields(duplicates, QUESTION_FIELDS, t));
    questions.push(question);
  }
  return { questions, diagnostics: diagnostics.sort(byLine) };
}

export function parseDecisions(text: string, file: string): { decisions: Decision[]; diagnostics: Diagnostic[] } {
  const decisions: Decision[] = [];
  const fix = 'Use "## D-<n>: <rule title>"';
  const { blocks, diagnostics } = entryBlocks(text, file, 'D', fix);
  const seen = new Set<string>();
  for (const b of blocks) {
    const m = /^(D-\d+):\s*(.*)$/.exec(b.text);
    if (!m) {
      diagnostics.push(diag('error', 'SPEC_PARSE', `unexpected heading "${b.text}"`, { file, line: b.line }, fix));
      continue;
    }
    const id = m[1] as string;
    const { fields, prose, duplicates } = readFields(text.slice(b.contentStart, b.end));
    const whyAt = prose.search(/^\*\*Why:\*\*/m);
    const rule = (whyAt >= 0 ? prose.slice(0, whyAt) : prose).trim();
    const why = whyAt >= 0 ? prose.slice(whyAt).replace(/^\*\*Why:\*\*\s*/, '').trim() : '';
    const t = { file, line: b.line, id };
    if (seen.has(id)) diagnostics.push(diag('error', 'SPEC_PARSE', `duplicate decision ${id}`, t));
    seen.add(id);
    if (rule === '') diagnostics.push(diag('error', 'SPEC_PARSE', `${id}: the rule text is missing`, t, 'Write the rule as a paragraph under the fields'));
    diagnostics.push(...duplicateFields(duplicates, DECISION_FIELDS, t));
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
  return { decisions, diagnostics: diagnostics.sort(byLine) };
}
