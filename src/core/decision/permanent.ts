import { diag, type Diagnostic } from '../diagnostics.js';
import { headingBlocks, type HeadingBlock } from '../markdown/blocks.js';
import type { Decision } from './model.js';
import { parseDecisions } from './parse.js';

const CANONICAL_FILE = 'comb/decisions.md';
const FIELD_LINE = /^\s*[-*]\s+\*\*[A-Za-z][A-Za-z ]*(?::\*\*|\*\*\s*:)/;

const idNumber = (id: string): number => Number(/^D-(\d+)$/.exec(id)?.[1] ?? 0);
export const formatPermanentId = (n: number): string => `D-${String(n).padStart(3, '0')}`;

/** Local D-n → canonical D-NNN, continuing after the highest canonical number (DESIGN §5.3 step 2). */
export function assignPermanentIds(local: Decision[], canonical: Decision[]): { map: Record<string, string>; diagnostics: Diagnostic[] } {
  const canonicalIds = new Set(canonical.map((d) => d.id));
  const clashes = local.filter((d) => canonicalIds.has(d.id));
  if (clashes.length > 0) {
    return {
      map: {},
      diagnostics: clashes.map((d) =>
        diag('error', 'DECISION_ID_CONFLICT', `${d.id} is both a local decision and a decision in ${CANONICAL_FILE}, so its references are ambiguous`,
          { file: CANONICAL_FILE, id: d.id }, 'Give the canonical decision a three-digit id (D-<NNN>)'),
      ),
    };
  }
  let next = Math.max(0, ...canonical.map((d) => idNumber(d.id))) + 1;
  const ordered = [...local].sort((a, b) => idNumber(a.id) - idNumber(b.id));
  return { map: Object.fromEntries(ordered.map((d) => [d.id, formatPermanentId(next++)])), diagnostics: [] };
}

/** Rewrites whole `D-<n>` tokens that are keys of `map`; every other id stays as it is. */
export const rewriteDecisionRefs = (text: string, map: Readonly<Record<string, string>>): string =>
  text.replace(/\bD-\d+\b/g, (id) => map[id] ?? id);

const decisionBlocks = (text: string): HeadingBlock[] => headingBlocks(text).filter((b) => b.depth === 2 && /^D-\d+:/.test(b.text));

/** Inserts a field bullet after the field bullets that follow a decision heading. */
function insertField(block: string, field: string): string {
  const lines = block.split('\n');
  let at = 1;
  for (let i = 1; i < lines.length && (lines[i]!.trim() === '' || FIELD_LINE.test(lines[i]!)); i++) {
    if (FIELD_LINE.test(lines[i]!)) at = i + 1;
  }
  lines.splice(at, 0, field);
  return lines.join('\n');
}

/** Appends the change's (already rewritten) decisions to the log, with `Change:`, and marks what they supersede (DESIGN §5.3 step 5). */
export function appendDecisions(canonicalText: string | null, localText: string, changeId: string): { text: string | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const added = decisionBlocks(localText)
    .map((b) => ({ n: idNumber(/^(D-\d+):/.exec(b.text)?.[1] ?? ''), block: localText.slice(b.start, b.end).trim() }))
    .sort((a, b) => a.n - b.n)
    .map(({ block }) => (/^\s*[-*]\s+\*\*Change(?::\*\*|\*\*\s*:)/m.test(block) ? block : insertField(block, `- **Change:** ${changeId}`)));
  if (added.length === 0) return { text: canonicalText, diagnostics };
  let text = `${(canonicalText ?? '# Decisions\n').replace(/\n*$/, '')}\n\n${added.join('\n\n')}\n`;
  for (const d of parseDecisions(localText, CANONICAL_FILE).decisions) {
    if (!d.supersedes) continue;
    const target = decisionBlocks(text).find((b) => b.text.startsWith(`${d.supersedes}:`));
    if (!target) continue; // validateChange already reported REF_UNKNOWN_DECISION
    const block = text.slice(target.start, target.end);
    const existing = /^\s*[-*]\s+\*\*Superseded by(?::\*\*|\*\*\s*:)\s*(\S+)/m.exec(block)?.[1];
    if (existing === d.id) continue;
    if (existing) {
      diagnostics.push(diag('error', 'DECISION_ID_CONFLICT', `${d.supersedes} is already superseded by ${existing}`,
        { file: CANONICAL_FILE, id: d.supersedes }, `Supersede ${existing} instead`));
      continue;
    }
    const body = block.trimEnd();
    text = text.slice(0, target.start) + insertField(body, `- **Superseded by:** ${d.id}`) + block.slice(body.length) + text.slice(target.end);
  }
  return { text, diagnostics };
}
