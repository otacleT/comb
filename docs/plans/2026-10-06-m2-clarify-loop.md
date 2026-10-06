# M2 Clarify Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the convergence loop work in a real Claude Code session: review → answerable questions → recorded decisions → updated delta → re-review (V0_SCOPE experiences E3 and E4).

**Architecture:**
- Pure parsers and validators for `questions.md` and `decisions.md` live in `src/core/decision/`.
- `src/core/workflow/` gains delta and requirement hashes plus a review stamp in the frontmatter of `review.md`. `comb mark-reviewed` writes the stamp, and `comb status` uses it to detect stale reviews and to block on open high-severity questions.
- `comb instructions review|clarify` serves the lens definitions and the formats from `templates/`.
- The `review` and `clarify` skills and their slash commands are generated from `templates/skills/`.
- A benchmark project in `bench/order-lifecycle/`, built from Spike 01, measures review recall for E3.

**Tech Stack:** Node ≥22.12, TypeScript 7 (strict, NodeNext, `"types": ["node"]`), commander 15, yaml, mdast-util-from-markdown, mdast-util-to-string, vitest 5.

**Spec:** `docs/DESIGN.md` (§3.5–§3.7, §4, §5, §6, §7), `docs/V0_SCOPE.md` (M4–M7, S2, E3, E4), `docs/IMPLEMENTATION_PLAN.md` (M2 table)

## Global Constraints

- Everything in the M1 plan's Global Constraints still applies, except that the Node floor is now `>=22.12` (D-017).
- Question ids are change-local `Q-<n>`. Decision ids are change-local `D-<n>` inside `changes/<id>/decisions.md`, and project-wide `D-<NNN>` in `comb/decisions.md` (D-012). Ids are compared as exact strings: `D-1` and `D-001` are different ids.
- Field bullets use `- **<Field>:** <value>`. Recognized fields (case-insensitive):
  - questions: `Status` (`open|answered|deferred`), `Severity` (`high|medium|low`), `Refs`, `Lens`, `Decision`
  - decisions: `Date`, `Refs`, `From`, `Supersedes`, `Change`, `Superseded by`

  `**Answer:**` and `**Why:**` are paragraph markers, not bullets.
- `review.md` frontmatter keys: `lenses` (written by the agent), and `reviewed` and `requirements` (written only by `comb mark-reviewed`).
- New diagnostic codes, all added to DESIGN §4/§7.2:
  - `REF_UNKNOWN_QUESTION` (error, exit 1)
  - `REVIEW_MISSING` (error, exit 1)
- The canonical files (`comb/specs/**`, `comb/decisions.md`) are still never written by M2 code.
- Work on branch `feat/m2-clarify-loop`. This plan is that branch's first commit.

## Review Focus

1. **Questions and decisions written by an LLM with small format deviations**: capitalized values (`Answered`), trailing `# …` comments copied from examples, Japanese titles, extra spaces. These should parse to the intended values, and real errors should give a `SPEC_PARSE` with a fix. Pinned in Task 1.
2. **A delta re-saved with CRLF line endings after review must not make the review stale**, while any real text change must. Pinned in Task 3.
3. **`review.md` without frontmatter, or with broken frontmatter.** `mark-reviewed` should add the stamp in the first case and report `SPEC_PARSE` in the second, without destroying the body. Pinned in Task 3.
4. **An answered question that points to a misspelled decision, or to a decision in another change**, should give `REF_UNKNOWN_DECISION` rather than being silently accepted. Pinned in Task 2.
5. **A canonical spec that cites a decision missing from `comb/decisions.md`** (for example after a hand edit) should give `REF_UNKNOWN_DECISION` on `validate`, not a crash or silence. Pinned in Task 2.

---

### Task 1: Parse questions and decisions

**Files:**
- Create: `src/core/decision/model.ts`, `src/core/decision/parse.ts`
- Modify: `test/helpers/fixtures.ts` (add `DECISIONS_MD`, `QUESTIONS_MD`, `LOCAL_DECISIONS_MD`)
- Test: `test/core/decision/parse.test.ts`

**Interfaces:**
- Consumes: `headingBlocks` (M1), `diag`
- Produces:
  - `Question { id; title; status; severity; refs: string[]; lens: string|null; decision: string|null; answer: string|null; line }`
  - `Decision { id; title; date: string|null; refs: string[]; from: string|null; supersedes: string|null; supersededBy: string|null; change: string|null; rule: string; why: string|null; line }`
  - `QUESTION_STATUSES`, `SEVERITIES`
  - `readFields(segment): { fields: Map<string,string>; prose: string }` (field names lower-cased)
  - `parseIdList(value?): string[]`
  - `parseQuestions(text, file): { questions; diagnostics }`
  - `parseDecisions(text, file): { decisions; diagnostics }`

- [ ] **Step 1: Add the fixtures**

Append to `test/helpers/fixtures.ts`:

```ts
export const DECISIONS_MD = `# Decisions

## D-021: Price is fixed when the order is created
- **Date:** 2026-10-01
- **Refs:** REQ-ORDER-001
- **Change:** seed-orders

The order keeps the listing price shown at "Buy".

**Why:** Later listing edits must not change an existing order.
`;

export const QUESTIONS_MD = `# Questions

## Q-1: 期限後の発送を受け付けるか
- **Status:** Answered
- **Severity:** high
- **Refs:** REQ-ORDER-001, REQ-ORDER-002
- **Lens:** edge-cases
- **Decision:** D-1

The spec currently allows this sequence:
1. The buyer pays (REQ-ORDER-002)

**Options**
- **A.** Reject — Spec change: REQ-ORDER-002 gains a deadline guard
- **B.** Accept — Spec change: none

**Recommendation:** A — a cancelled order must never ship.

**Answer:** A (2026-10-06)

## Q-2: Who may cancel after shipment?
- **Status:** open
- **Severity:** medium   # high | medium | low
- **Refs:** REQ-ORDER-002

Body.
`;

export const LOCAL_DECISIONS_MD = `# Decisions

## D-1: Shipping after the deadline is rejected
- **Date:** 2026-10-06
- **Refs:** REQ-ORDER-002
- **From:** Q-1
- **Supersedes:** D-021

After the deadline, "mark shipped" is rejected with SHIP_WINDOW_CLOSED.

**Why:** a cancelled order must never ship.
`;
```

- [ ] **Step 2: Write the failing test**

`test/core/decision/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDecisions, parseIdList, parseQuestions } from '../../../src/core/decision/parse.js';
import { DECISIONS_MD, LOCAL_DECISIONS_MD, QUESTIONS_MD } from '../../helpers/fixtures.js';

describe('parseIdList', () => {
  it('splits ids and drops placeholders and notes', () => {
    expect(parseIdList('REQ-ORDER-001, REQ-ORDER-019 (new)、REQ-PAY-001')).toEqual(['REQ-ORDER-001', 'REQ-ORDER-019', 'REQ-PAY-001']);
    expect(parseIdList('—')).toEqual([]);
    expect(parseIdList(undefined)).toEqual([]);
  });
});

describe('parseQuestions', () => {
  it('reads fields tolerantly (case, trailing comments, Japanese titles)', () => {
    const { questions, diagnostics } = parseQuestions(QUESTIONS_MD, 'q.md');
    expect(diagnostics).toEqual([]);
    expect(questions.map((q) => [q.id, q.status, q.severity])).toEqual([
      ['Q-1', 'answered', 'high'],
      ['Q-2', 'open', 'medium'],
    ]);
    const q1 = questions[0]!;
    expect(q1.title).toBe('期限後の発送を受け付けるか');
    expect(q1.refs).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    expect(q1.lens).toBe('edge-cases');
    expect(q1.decision).toBe('D-1');
    expect(q1.answer).toBe('A (2026-10-06)');
    expect(questions[1]!.decision).toBeNull();
    expect(questions[1]!.line).toBe(21);
  });

  it('reports bad headings, statuses, severities and duplicates', () => {
    const text = '## Not a question\n\n## Q-1: a\n- **Status:** maybe\n- **Severity:** urgent\n\n## Q-1: again\n- **Status:** open\n- **Severity:** low\n';
    const { diagnostics } = parseQuestions(text, 'q.md');
    expect(diagnostics.map((d) => [d.code, d.target?.line])).toEqual([
      ['SPEC_PARSE', 1],
      ['SPEC_PARSE', 3],
      ['SPEC_PARSE', 3],
      ['SPEC_PARSE', 7],
    ]);
  });
});

describe('parseDecisions', () => {
  it('reads a change-local decision', () => {
    const { decisions, diagnostics } = parseDecisions(LOCAL_DECISIONS_MD, 'd.md');
    expect(diagnostics).toEqual([]);
    expect(decisions).toEqual([
      {
        id: 'D-1',
        title: 'Shipping after the deadline is rejected',
        date: '2026-10-06',
        refs: ['REQ-ORDER-002'],
        from: 'Q-1',
        supersedes: 'D-021',
        supersededBy: null,
        change: null,
        rule: 'After the deadline, "mark shipped" is rejected with SHIP_WINDOW_CLOSED.',
        why: 'a cancelled order must never ship.',
        line: 3,
      },
    ]);
  });

  it('reads the canonical log', () => {
    const { decisions } = parseDecisions(DECISIONS_MD, 'comb/decisions.md');
    expect(decisions.map((d) => [d.id, d.change])).toEqual([['D-021', 'seed-orders']]);
  });

  it('requires the rule text', () => {
    const { diagnostics } = parseDecisions('## D-1: x\n- **Refs:** REQ-A-001\n\n**Why:** y\n', 'd.md');
    expect(diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run test/core/decision/parse.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement**

`src/core/decision/model.ts`:

```ts
export const QUESTION_STATUSES = ['open', 'answered', 'deferred'] as const;
export const SEVERITIES = ['high', 'medium', 'low'] as const;

export interface Question {
  id: string;
  title: string;
  status: string;
  severity: string;
  refs: string[];
  lens: string | null;
  decision: string | null;
  answer: string | null;
  line: number;
}

export interface Decision {
  id: string;
  title: string;
  date: string | null;
  refs: string[];
  from: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  change: string | null;
  rule: string;
  why: string | null;
  line: number;
}
```

`src/core/decision/parse.ts`:

```ts
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
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run test/core/decision/parse.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/decision test/core/decision test/helpers/fixtures.ts
git commit -m "feat(core): parse questions and decisions"
```

---

### Task 2: Validate references between requirements, questions and decisions

**Files:**
- Create: `src/core/decision/validate.ts`
- Modify: `src/core/change/validate-change.ts` (wire into `validateProject` and `validateChange`)
- Modify: `test/cli/validate.test.ts`, `test/core/change/change.test.ts` (projects that use `ORDER_SPEC` now need `comb/decisions.md` because the spec cites `D-021`)
- Modify: `docs/DESIGN.md` (§4 table: `REF_UNKNOWN_QUESTION`)
- Test: `test/core/decision/validate.test.ts`

**Interfaces:**
- Consumes: `parseQuestions`, `parseDecisions`, `Project`, `ChangeSnapshot`, `paths`, `rel`
- Produces:
  - `RefContext { requirements; canonicalDecisions; localDecisions; questions }` (all `ReadonlySet<string>`)
  - `validateQuestions(questions, file, ctx)`, `validateDecisions(decisions, file, ctx)`
  - `checkDecisionRefs(refs, known, target)`
  - Codes:
    - `REF_UNKNOWN_REQ`
    - `REF_UNKNOWN_DECISION`
    - `REF_UNKNOWN_QUESTION`
    - `QUESTION_UNRESOLVED_LINK`
    - `SPEC_PARSE` (from the parsers)

- [ ] **Step 1: Write the failing test**

`test/core/decision/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateChange, validateProject } from '../../../src/core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, DECISIONS_MD, LOCAL_DECISIONS_MD, metaYaml, ORDER_SPEC, QUESTIONS_MD } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const codes = (ds: { code: string }[]): string[] => ds.map((d) => d.code).sort();

function project(files: Record<string, string>) {
  const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/specs/order-lifecycle/spec.md': ORDER_SPEC, ...files });
  const all = loadAllChanges(root);
  return { project: loadProject(root), all };
}

describe('decision references in canonical specs', () => {
  it('reports a canonical requirement citing a decision missing from comb/decisions.md', () => {
    const { project: p } = project({});
    const ds = validateProject(p);
    expect(codes(ds)).toEqual(['REF_UNKNOWN_DECISION']);
    expect(ds[0]!.target).toEqual({ file: 'comb/specs/order-lifecycle/spec.md', line: 15, id: 'REQ-ORDER-001' });
  });

  it('accepts it when the decision exists', () => {
    expect(validateProject(project({ 'comb/decisions.md': DECISIONS_MD }).project)).toEqual([]);
  });
});

describe('questions and decisions of a change', () => {
  // MODIFIED keeps the existing scenario name, so no SCENARIO_DROPPED warning interferes.
  const delta = `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-002 Payment\nPay within 2 days (D-1).\n\n#### Scenario: Paid in time\n- **GIVEN** an unpaid order\n`;
  const base = {
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/c/.comb.yaml': metaYaml('c'),
    'comb/changes/c/specs/order-lifecycle/spec.md': delta,
  };

  it('accepts consistent questions, decisions and delta references', () => {
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/questions.md': QUESTIONS_MD,
      'comb/changes/c/decisions.md': LOCAL_DECISIONS_MD,
    });
    expect(validateChange(p, all[0]!, all)).toEqual([]);
  });

  it('reports every broken link', () => {
    const questions = QUESTIONS_MD.replace('- **Decision:** D-1', '- **Decision:** D-9').replace(
      '- **Refs:** REQ-ORDER-002\n\nBody.',
      '- **Refs:** REQ-ORDER-404\n\nBody.',
    );
    const decisions = LOCAL_DECISIONS_MD.replace('- **From:** Q-1', '- **From:** Q-7').replace('D-021', 'D-999');
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/specs/order-lifecycle/spec.md': delta.replace('(D-1)', '(D-1, D-5)'),
      'comb/changes/c/questions.md': `${questions}\n## Q-3: unanswered link\n- **Status:** answered\n- **Severity:** low\n`,
      'comb/changes/c/decisions.md': decisions,
    });
    expect(codes(validateChange(p, all[0]!, all))).toEqual(
      ['QUESTION_UNRESOLVED_LINK', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_DECISION', 'REF_UNKNOWN_QUESTION', 'REF_UNKNOWN_REQ'].sort(),
    );
  });

  it('accepts "none: <reason>" as the decision of an answered question', () => {
    const { project: p, all } = project({
      ...base,
      'comb/changes/c/specs/order-lifecycle/spec.md': delta.replace(' (D-1)', ''),
      'comb/changes/c/questions.md': '## Q-1: x\n- **Status:** answered\n- **Severity:** low\n- **Decision:** none: already covered by REQ-ORDER-002\n',
    });
    expect(validateChange(p, all[0]!, all)).toEqual([]);
  });

  it('reports format errors in questions.md through validateChange', () => {
    const { project: p, all } = project({ ...base, 'comb/changes/c/questions.md': '## Q-1: x\n- **Status:** maybe\n- **Severity:** low\n' });
    const ds = validateChange(p, all[0]!, all);
    expect(ds.filter((d) => d.code === 'SPEC_PARSE').map((d) => d.target?.file)).toEqual(['comb/changes/c/questions.md']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run test/core/decision/validate.test.ts`
Expected: FAIL (the canonical test sees `[]` instead of `REF_UNKNOWN_DECISION`, and the link test sees no errors)

- [ ] **Step 3: Implement**

`src/core/decision/validate.ts`:

```ts
import { diag, type Diagnostic } from '../diagnostics.js';
import type { Decision, Question } from './model.js';

export interface RefContext {
  requirements: ReadonlySet<string>;
  canonicalDecisions: ReadonlySet<string>;
  localDecisions: ReadonlySet<string>;
  questions: ReadonlySet<string>;
}

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
    } else if (!/^none\s*:/i.test(q.decision) && !ctx.localDecisions.has(q.decision) && !ctx.canonicalDecisions.has(q.decision)) {
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
```

In `src/core/change/validate-change.ts`, add the imports:

```ts
import { parseDecisions, parseQuestions } from '../decision/parse.js';
import { checkDecisionRefs, validateDecisions, validateQuestions } from '../decision/validate.js';
import { paths, rel } from '../project/paths.js';
```

and this helper below the imports:

```ts
const CANONICAL_DECISIONS_FILE = 'comb/decisions.md';

const canonicalDecisionIds = (project: Project): { ids: Set<string>; diagnostics: Diagnostic[] } => {
  const parsed = parseDecisions(project.decisionsText ?? '', CANONICAL_DECISIONS_FILE);
  return { ids: new Set(parsed.decisions.map((d) => d.id)), diagnostics: parsed.diagnostics };
};
```

In `validateProject`, insert this just before the final `return out;`:

```ts
  const canonical = canonicalDecisionIds(project);
  out.push(...canonical.diagnostics);
  for (const spec of project.specs.values()) {
    for (const r of spec.capability.requirements) {
      out.push(...checkDecisionRefs(r.decisionRefs, canonical.ids, { file: spec.file, line: r.line, id: r.id }));
    }
  }
```

In `validateChange`, insert this just before the final `return out;`:

```ts
  const canonical = canonicalDecisionIds(project);
  const questionsFile = rel(project.root, paths.changeFile(project.root, change.id, 'questions'));
  const decisionsFile = rel(project.root, paths.changeFile(project.root, change.id, 'decisions'));
  const questions = parseQuestions(change.files.questions ?? '', questionsFile);
  const decisions = parseDecisions(change.files.decisions ?? '', decisionsFile);
  out.push(...questions.diagnostics, ...decisions.diagnostics);
  const ctx = {
    requirements: new Set([...idOwner.keys(), ...change.deltas.flatMap((d) => d.delta.added.map((r) => r.id))]),
    canonicalDecisions: canonical.ids,
    localDecisions: new Set(decisions.decisions.map((d) => d.id)),
    questions: new Set(questions.questions.map((q) => q.id)),
  };
  out.push(...validateQuestions(questions.questions, questionsFile, ctx), ...validateDecisions(decisions.decisions, decisionsFile, ctx));
  const knownDecisions = new Set([...ctx.canonicalDecisions, ...ctx.localDecisions]);
  for (const d of change.deltas) {
    for (const r of [...d.delta.added, ...d.delta.modified]) {
      out.push(...checkDecisionRefs(r.decisionRefs, knownDecisions, { file: d.file, line: r.line, id: r.id }));
    }
  }
```

Update the existing projects that use `ORDER_SPEC` and are validated end-to-end, so they include the canonical decision. Add `DECISIONS_MD` to the fixture imports of both files.

- `test/cli/validate.test.ts`: in `passes on a valid project` and `reports delta errors with exit 1`, add `'comb/decisions.md': DECISIONS_MD,` to the `makeProject({...})` object.
- `test/core/change/change.test.ts`: in `detects a requirement id defined in two capabilities` and `rejects two canonical specs that share a prefix`, add `'comb/decisions.md': DECISIONS_MD,` to the `makeProject({...})` object.

In `docs/DESIGN.md` §4, add this row after `REF_UNKNOWN_DECISION`:

```markdown
| `REF_UNKNOWN_QUESTION` | error | Decision の From に存在しない質問がある |
```

- [ ] **Step 4: Run the whole suite and confirm it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (all tests, including the 6 new ones); no type errors

- [ ] **Step 5: Commit**

```bash
git add src/core/decision/validate.ts src/core/change/validate-change.ts test docs/DESIGN.md
git commit -m "feat(validate): check references between requirements, questions and decisions"
```

---

### Task 3: Delta hashes, the review stamp and `comb mark-reviewed`

**Files:**
- Create: `src/core/workflow/hash.ts`, `src/core/workflow/review-stamp.ts`, `src/cli/commands/mark-reviewed.ts`
- Modify: `src/cli/app.ts` (register), `docs/DESIGN.md` (§3.5 frontmatter, §7.1 command table, §7.2 codes: `REVIEW_MISSING`)
- Test: `test/core/workflow/hash.test.ts`, `test/core/workflow/review-stamp.test.ts`, `test/cli/mark-reviewed.test.ts`

**Interfaces:**
- Consumes: `ChangeSnapshot`, `splitFrontmatter`, `loadChange`, `paths`, `rel`
- Produces:
  - `deltaHash(change): string` (`sha256:<16 hex>`; the deltas sorted by file, text already LF-normalized)
  - `requirementHashes(change): Record<string, string>` (ADDED/MODIFIED → `sha256:<16 hex>` of the trimmed block; REMOVED → `removed`)
  - `changedSince(recorded | null, current): string[] | null` (sorted ids; `null` when there is no record)
  - `ReviewStamp { reviewed: string | null; requirements: Record<string,string> | null }`
  - `readReviewStamp(text | undefined): ReviewStamp`
  - `stampReview(text, reviewed, requirements): string | null` (`null` when the frontmatter is broken)
  - Command: `comb mark-reviewed --change <id> [--json]`. A missing review gives `REVIEW_MISSING` (exit 1); an unknown change gives `CHANGE_NOT_FOUND` (exit 2).

- [ ] **Step 1: Write the failing tests**

`test/core/workflow/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadChange } from '../../../src/core/project/load.js';
import { changedSince, deltaHash, requirementHashes } from '../../../src/core/workflow/hash.js';
import { CONFIG_YAML, metaYaml } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const DELTA = `## ADDED Requirements\n\n### Requirement: REQ-ORDER-003 New\nx\n\n#### Scenario: s\n- **GIVEN** a\n\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-001\n**Reason:** r\n`;
const changeWith = (delta: string) =>
  loadChange(
    makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/changes/c/.comb.yaml': metaYaml('c'),
      'comb/changes/c/specs/order-lifecycle/spec.md': delta,
    }),
    'c',
  )!;

describe('deltaHash', () => {
  it('is stable across line endings and changes with the text', () => {
    const h = deltaHash(changeWith(DELTA));
    expect(h).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(deltaHash(changeWith(DELTA.replace(/\n/g, '\r\n')))).toBe(h);
    expect(deltaHash(changeWith(DELTA.replace('x\n', 'y\n')))).not.toBe(h);
  });
});

describe('requirementHashes / changedSince', () => {
  it('hashes added/modified blocks and marks removals', () => {
    const hashes = requirementHashes(changeWith(DELTA));
    expect(Object.keys(hashes).sort()).toEqual(['REQ-ORDER-001', 'REQ-ORDER-003']);
    expect(hashes['REQ-ORDER-001']).toBe('removed');
    expect(hashes['REQ-ORDER-003']).toMatch(/^sha256:/);
  });

  it('lists ids whose hash changed, appeared or disappeared', () => {
    expect(changedSince(null, { 'REQ-A-001': 'x' })).toBeNull();
    expect(changedSince({ 'REQ-A-001': 'x', 'REQ-A-002': 'y' }, { 'REQ-A-001': 'x', 'REQ-A-003': 'z' })).toEqual(['REQ-A-002', 'REQ-A-003']);
  });
});
```

`test/core/workflow/review-stamp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readReviewStamp, stampReview } from '../../../src/core/workflow/review-stamp.js';

describe('review stamp', () => {
  it('reads nothing from a missing or unstamped review', () => {
    expect(readReviewStamp(undefined)).toEqual({ reviewed: null, requirements: null });
    expect(readReviewStamp('# Review\n')).toEqual({ reviewed: null, requirements: null });
  });

  it('adds a frontmatter to a review without one, keeping the body', () => {
    const stamped = stampReview('# Review: c\n\nbody\n', 'sha256:aaaa', { 'REQ-A-001': 'sha256:bbbb' })!;
    expect(stamped.endsWith('# Review: c\n\nbody\n')).toBe(true);
    expect(readReviewStamp(stamped)).toEqual({ reviewed: 'sha256:aaaa', requirements: { 'REQ-A-001': 'sha256:bbbb' } });
  });

  it('keeps other frontmatter keys and replaces an old stamp', () => {
    const once = stampReview('---\nlenses: [consistency]\n---\n# R\n', 'sha256:1', {})!;
    const twice = stampReview(once, 'sha256:2', { 'REQ-A-001': 'removed' })!;
    expect(twice).toContain('lenses:');
    expect(readReviewStamp(twice)).toEqual({ reviewed: 'sha256:2', requirements: { 'REQ-A-001': 'removed' } });
    expect(twice.endsWith('# R\n')).toBe(true);
  });

  it('refuses a broken frontmatter', () => {
    expect(stampReview('---\nlenses: [x]\n# R\n', 'sha256:1', {})).toBeNull();
  });
});
```

`test/cli/mark-reviewed.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

const files = {
  'comb/config.yaml': CONFIG_YAML,
  'comb/changes/c/.comb.yaml': metaYaml('c'),
  'comb/changes/c/specs/payment/spec.md': '---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 X\nx\n\n#### Scenario: s\n- **GIVEN** a\n',
};

describe('comb mark-reviewed', () => {
  it('stamps review.md with the current delta hash', async () => {
    const root = makeProject({ ...files, 'comb/changes/c/review.md': '# Review: c\n' });
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.data.reviewed).toMatch(/^sha256:[0-9a-f]{16}$/);
    const review = readFileSync(join(root, 'comb/changes/c/review.md'), 'utf8');
    expect(review).toContain(`reviewed: ${env.data.reviewed}`);
    expect(review).toContain('REQ-PAY-001: sha256:');
  });

  it('reports a missing review with exit 1', async () => {
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], makeProject(files));
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('REVIEW_MISSING');
  });

  it('reports a broken frontmatter without touching the file', async () => {
    const root = makeProject({ ...files, 'comb/changes/c/review.md': '---\nlenses: [x]\n# R\n' });
    const r = await runCli(['mark-reviewed', '--change', 'c', '--json'], root);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('SPEC_PARSE');
    expect(readFileSync(join(root, 'comb/changes/c/review.md'), 'utf8')).toBe('---\nlenses: [x]\n# R\n');
  });

  it('returns exit 2 for an unknown change', async () => {
    expect((await runCli(['mark-reviewed', '--change', 'nope', '--json'], makeProject(files))).code).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run test/core/workflow/hash.test.ts test/core/workflow/review-stamp.test.ts test/cli/mark-reviewed.test.ts`
Expected: FAIL (modules not found / unknown command)

- [ ] **Step 3: Implement**

`src/core/workflow/hash.ts`:

```ts
import { createHash } from 'node:crypto';
import type { ChangeSnapshot } from '../project/load.js';

const short = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Hash of every delta of the change (texts are LF-normalized at load time). */
export function deltaHash(change: ChangeSnapshot): string {
  const parts = [...change.deltas].sort((a, b) => a.file.localeCompare(b.file)).map((d) => `${d.file}\n${d.text}`);
  return `sha256:${short(parts.join('\n\u0000\n'))}`;
}

export function requirementHashes(change: ChangeSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of change.deltas) {
    for (const r of [...d.delta.added, ...d.delta.modified]) out[r.id] = `sha256:${short(r.block.trim())}`;
    for (const x of d.delta.removed) out[x.id] = 'removed';
  }
  return out;
}

export function changedSince(recorded: Record<string, string> | null, current: Record<string, string>): string[] | null {
  if (recorded === null) return null;
  const ids = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...ids].filter((id) => recorded[id] !== current[id]).sort();
}
```

`src/core/workflow/review-stamp.ts`:

```ts
import { stringify } from 'yaml';
import { splitFrontmatter } from '../markdown/frontmatter.js';

export interface ReviewStamp {
  reviewed: string | null;
  requirements: Record<string, string> | null;
}

export function readReviewStamp(text: string | undefined): ReviewStamp {
  if (text === undefined) return { reviewed: null, requirements: null };
  const fm = splitFrontmatter(text);
  const reviewed = typeof fm.data.reviewed === 'string' ? fm.data.reviewed : null;
  const raw = fm.data.requirements;
  const requirements =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every((v) => typeof v === 'string')
      ? (raw as Record<string, string>)
      : null;
  return { reviewed, requirements };
}

/** Writes `reviewed` and `requirements` into the frontmatter, keeping other keys and the body. */
export function stampReview(text: string, reviewed: string, requirements: Record<string, string>): string | null {
  const fm = splitFrontmatter(text);
  if (fm.error) return null;
  return `---\n${stringify({ ...fm.data, reviewed, requirements })}---\n${text.slice(fm.bodyOffset)}`;
}
```

`src/cli/commands/mark-reviewed.ts`:

```ts
import { writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { diag } from '../../core/diagnostics.js';
import { loadChange } from '../../core/project/load.js';
import { paths, rel } from '../../core/project/paths.js';
import { deltaHash, requirementHashes } from '../../core/workflow/hash.js';
import { stampReview } from '../../core/workflow/review-stamp.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

export function registerMarkReviewed(program: Command, ctx: CliContext): void {
  program
    .command('mark-reviewed')
    .description('record that review.md reflects the current delta')
    .requiredOption('--change <id>', 'change id')
    .option('--json', 'JSON output')
    .action((opts: { change: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'mark-reviewed', json);
      if (!root) return;
      const change = loadChange(root, opts.change);
      if (!change) {
        usageError(ctx, 'mark-reviewed', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
        return;
      }
      const path = paths.changeFile(root, change.id, 'review');
      const file = rel(root, path);
      if (change.files.review === undefined) {
        finish(ctx, envelope('mark-reviewed', null, [diag('error', 'REVIEW_MISSING', `${file} does not exist`, { file }, 'Run the review first')]), json, () => '');
        return;
      }
      const reviewed = deltaHash(change);
      const stamped = stampReview(change.files.review, reviewed, requirementHashes(change));
      if (stamped === null) {
        finish(ctx, envelope('mark-reviewed', null, [diag('error', 'SPEC_PARSE', 'review.md has a broken frontmatter', { file, line: 1 })]), json, () => '');
        return;
      }
      writeFileSync(path, stamped);
      finish(ctx, envelope('mark-reviewed', { change: change.id, reviewed }, []), json, (d) => `marked ${file} as reviewed (${d.reviewed})`);
    });
}
```

In `src/cli/app.ts`, import `registerMarkReviewed` from `./commands/mark-reviewed.js` and append it to `registrars` (after `registerInstructions`).

In `docs/DESIGN.md`, make three edits:

- §3.5: replace the `reviewed:` frontmatter line of the example with these two lines:

  ```
  reviewed: sha256:…        # comb mark-reviewed が書く（delta の内容ハッシュ）
  requirements: { REQ-ORDER-019: "sha256:…" }   # comb mark-reviewed が書く（要件ごとのハッシュ。再レビューで変更箇所を特定する）
  ```

- §7.1: in the `mark-reviewed` row, change the description to "`review.md` の frontmatter に、delta のハッシュと要件ごとのハッシュを書く".
- §7.2: add this code row:

  ```markdown
  | `REVIEW_MISSING` | 1 | `mark-reviewed` の対象の review.md がない |
  ```

- [ ] **Step 4: Run the whole suite and confirm it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; no type errors

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow/hash.ts src/core/workflow/review-stamp.ts src/cli test/core/workflow test/cli/mark-reviewed.test.ts docs/DESIGN.md
git commit -m "feat: stamp reviews with delta hashes via comb mark-reviewed"
```

---

### Task 4: Status — stale reviews and the clarify gate

**Files:**
- Modify: `src/core/workflow/status.ts`, `src/cli/commands/status.ts`
- Modify: `test/core/workflow/status.test.ts`

**Interfaces:**
- Consumes: `deltaHash`, `readReviewStamp`, `parseQuestions`
- Produces:
  - `ArtifactState` adds `'stale' | 'blocked'`
  - `QuestionCounts { open; openHigh; answered; deferred }`
  - `ChangeStatus` adds `questions: QuestionCounts`
  - Rules:
    - The delta is `invalid` only for errors whose target file is a delta file.
    - The review is `stale` when the stamp is missing or differs from `deltaHash`.
    - Clarify is `invalid` for errors in this change's questions/decisions files, and `blocked` when any open question is high.

- [ ] **Step 1: Update and extend the tests (they fail first)**

In `test/core/workflow/status.test.ts`:

1. Add the imports:

   ```ts
   import { deltaHash } from '../../../src/core/workflow/hash.js';
   import { stampReview } from '../../../src/core/workflow/review-stamp.js';
   ```

2. In `marks the delta invalid when validation has errors`, attribute the diagnostic to the delta file:

   ```ts
   const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'DELTA_EMPTY', 'x', { file: 'comb/changes/x/specs/c/spec.md' })]);
   ```

3. Replace the test `goes to review after a valid delta, then tasks/apply, then archive` with:

   ```ts
   it('goes to review after a valid delta, then tasks/apply, then archive', () => {
     const reviewed = stampReview('r', deltaHash(snapshot({}, true)), {})!;
     expect(computeStatus(snapshot({ proposal: PROPOSAL, tasks: '- [ ] a' }, true), []).next).toBe('review');
     const s = computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, tasks: '- [x] a\n- [ ] b' }, true), []);
     expect(s.next).toBe('apply');
     expect(s.tasks).toEqual({ done: 1, total: 2 });
     expect(s.artifacts[5]).toEqual({ id: 'apply', state: 'in-progress', detail: '1/2' });
     expect(computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, tasks: '- [x] a' }, true), []).next).toBe('archive');
   });

   it('marks the review stale when it was never stamped or the delta changed since', () => {
     const unstamped = computeStatus(snapshot({ proposal: PROPOSAL, review: 'r' }, true), []);
     expect(unstamped.artifacts[2]).toEqual({ id: 'review', state: 'stale', detail: 'not marked reviewed (run comb mark-reviewed)' });
     const old = computeStatus(snapshot({ proposal: PROPOSAL, review: stampReview('r', 'sha256:0000000000000000', {})! }, true), []);
     expect(old.artifacts[2]).toEqual({ id: 'review', state: 'stale', detail: 'the delta changed since the review' });
     expect(old.next).toBe('review');
   });

   it('blocks clarify while a high question is open and counts questions', () => {
     const reviewed = stampReview('r', deltaHash(snapshot({}, true)), {})!;
     const questions =
       '## Q-1: a\n- **Status:** open\n- **Severity:** high\n\n## Q-2: b\n- **Status:** open\n- **Severity:** low\n\n## Q-3: c\n- **Status:** deferred\n- **Severity:** medium\n';
     const s = computeStatus(snapshot({ proposal: PROPOSAL, review: reviewed, questions, tasks: '- [ ] a' }, true), []);
     expect(s.artifacts[3]).toEqual({ id: 'clarify', state: 'blocked', detail: '1 high question(s) open' });
     expect(s.next).toBe('clarify');
     expect(s.questions).toEqual({ open: 2, openHigh: 1, answered: 0, deferred: 1 });
     const lowOnly = computeStatus(
       snapshot({ proposal: PROPOSAL, review: reviewed, questions: questions.replace('high', 'medium'), tasks: '- [ ] a' }, true),
       [],
     );
     expect(lowOnly.artifacts[3]).toEqual({ id: 'clarify', state: 'done', detail: '2 open (medium/low)' });
   });

   it('marks clarify invalid for format errors in questions.md', () => {
     const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'SPEC_PARSE', 'x', { file: 'comb/changes/x/questions.md' })]);
     expect(s.artifacts[3]).toEqual({ id: 'clarify', state: 'invalid', detail: '1 error(s)' });
     expect(s.artifacts[1]!.state).toBe('done');
   });
   ```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run test/core/workflow/status.test.ts`
Expected: FAIL (review stays `done`, there are no `questions` counts, and clarify stays `done`)

- [ ] **Step 3: Implement**

Replace `computeStatus` and the related types in `src/core/workflow/status.ts`. Keep `countTasks` and `proposalComplete`, and remove the now-unused `hasErrors` import.

```ts
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
}
```

(`ARTIFACT_ORDER`, `countTasks` and `proposalComplete` stay as they are.)

```ts
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
  return { change: change.id, artifacts, next, tasks, questions: counts };
}
```

In `src/cli/commands/status.ts`, extend `detailOf` with a questions line just before `next:`:

```ts
    `questions: ${s.questions.open} open (${s.questions.openHigh} high), ${s.questions.answered} answered, ${s.questions.deferred} deferred`,
```

- [ ] **Step 4: Run the whole suite and confirm it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; no type errors

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow/status.ts src/cli/commands/status.ts test/core/workflow/status.test.ts
git commit -m "feat(status): stale reviews and the high-question clarify gate"
```

---

### Task 5: `comb instructions review|clarify`, lenses and formats

**Files:**
- Modify: `src/core/instructions/build.ts` (rewrite), `src/cli/commands/instructions.ts` (human output)
- Create:
  - `templates/formats/review.md`, `templates/formats/questions.md`, `templates/formats/decisions.md`
  - `templates/instructions/review.md`, `templates/instructions/clarify.md`
  - `templates/lenses/consistency.md`, `templates/lenses/formalization.md`, `templates/lenses/edge-cases.md`, `templates/lenses/change-impact.md`
- Test: `test/core/instructions/review-clarify.test.ts` (new); `test/core/instructions/build.test.ts` must keep passing unchanged

**Interfaces:**
- Consumes: `parseQuestions`, `parseDecisions`, `changedSince`, `requirementHashes`, `readReviewStamp`, `paths`, `rel`
- Produces:
  - `InstructionArtifact = 'proposal' | 'delta' | 'tasks' | 'review' | 'clarify'`
  - `QuestionSummary { id; title; severity }`
  - `Lens { id; definition }`
  - `Instructions` adds:
    - `alsoWrite: string[]`
    - `lenses: Lens[]`
    - `context.openQuestions: QuestionSummary[]` (high → medium → low, then by number)
    - `context.changedSinceReview: string[] | null`
    - `context.batch: number`
    - `ids.nextQuestion`, `ids.nextDecision` (change-local)
  - `openQuestions(change): QuestionSummary[]`
  - Template variables: `{{change}}`, `{{language}}`, `{{questionsPath}}`, `{{decisionsPath}}`

- [ ] **Step 1: Write the templates**

`templates/formats/review.md`:

```markdown
---
lenses: [consistency, formalization, edge-cases, change-impact]
---
# Review: <change-id>

## Summary
<counts by severity and the questions created, e.g. "high 2 / medium 3 / low 1 — Q-1..Q-6">

## Findings
### consistency
- **F-1 (high)** <one-line finding> → Q-1
### formalization
- …
### edge-cases
- …
### change-impact
- …

## Behavior model
<from the formalization lens: glossary, state × event table, coverage map, assumption ledger — or "Not applicable: <reason>">

## Checked and consistent
- <what you checked and found consistent, so the next review does not redo it>
```

`templates/formats/questions.md`:

```markdown
# Questions

## Q-1: <the question, short>
- **Status:** open
- **Severity:** high
- **Refs:** REQ-ORDER-005, REQ-ORDER-019
- **Lens:** edge-cases

The spec currently allows this sequence:
1. <a step in domain language> (REQ-ORDER-004)
2. <the next step> (REQ-ORDER-019)
Result: <what goes wrong>. This conflicts with REQ-ORDER-005 "<quote>".

**Options**
- **A.** <behavior> — Spec change: <which requirement gains or changes what>
- **B.** <behavior> — Spec change: <…>
- **C.** Specify a different rule

**Recommendation:** A — <one-line reason>
```

`templates/formats/decisions.md`:

```markdown
# Decisions

## D-1: <the rule, as a short title>
- **Date:** 2026-10-06
- **Refs:** REQ-ORDER-005, REQ-ORDER-019
- **From:** Q-1

<the rule in one or two sentences, precise enough to implement>

**Why:** <the reason the user gave, in their words>

<!-- When an answered question needs no decision, the question gets "- **Decision:** none: <reason>" instead. -->
<!-- When a decision replaces one in comb/decisions.md, add "- **Supersedes:** D-<NNN>". -->
<!-- An answered question gets "- **Status:** answered", "- **Decision:** D-1" and a line "**Answer:** <option> (<date>)". -->
```

`templates/instructions/review.md`:

```markdown
Review change "{{change}}". Write review.md at outputPath and the questions to {{questionsPath}}. Prose in {{language}}; headings, field names and keywords stay in English.

1. Read every file in context.readFiles: the base specs, the project decisions, the proposal, the delta(s), and this change's existing questions and decisions.
2. If context.changedSinceReview is a list, this is a re-review: focus on those requirements and everything they affect. Keep earlier findings that still apply, and never re-ask an answered question.
3. Apply every lens in `lenses` (their full definitions are included). Record the findings per lens in review.md.
4. Turn the findings into questions in {{questionsPath}}, following the template:
   - one question per root cause (merge findings that share a cause);
   - a concrete numbered sequence the spec allows, citing a requirement id for each step, then the result and the statement it conflicts with;
   - 2-3 options built from these repairs: (i) forbid the last step in that situation, (ii) change or forbid an earlier step, (iii) give the last step a different effect, (iv) relax the rule and state the current behavior explicitly — plus "Specify a different rule"; each with "Spec change:";
   - one recommendation with a one-line reason;
   - Severity: high = money, irreversible steps, states that must never be reached, or work that cannot start; medium = implementers would diverge; low = wording;
   - "Status: open"; number new questions from ids.nextQuestion; leave existing questions as they are.
5. Never fix the spec yourself: every gap becomes a question. Every "Assumption:" in the proposal becomes a question unless a decision already covers it.
6. Fill "Checked and consistent" honestly.
7. Run `comb validate --change {{change}} --json` and fix format errors in your files. Then run `comb mark-reviewed --change {{change}}`.
8. Tell the user the counts by severity and suggest /comb:clarify.
```

`templates/instructions/clarify.md`:

```markdown
Clarify change "{{change}}" with the user, in {{language}}. Resolve open questions, record every answer, and apply it to the delta.

1. Read context.readFiles. Work through context.openQuestions (highest severity first), at most context.batch at a time.
2. If the user's request already contains answers (for example "Q-1: A, Q-3: B" or "all recommended"), use them. Otherwise present each question briefly — the sequence, the options with their spec change, your recommendation — and let the user choose. Use a multiple-choice question tool if you have one; otherwise ask in text. Never answer for the user.
3. For every answer:
   - If it changes the spec: add a decision to {{decisionsPath}}, numbered from ids.nextDecision, with Date, Refs, "From: Q-<n>", the rule, and "**Why:**" in the user's words. Add "Supersedes: D-<NNN>" only when it replaces a decision in comb/decisions.md. Then edit the delta so the requirements and scenarios state exactly that rule (MODIFIED blocks stay whole), citing the decision, e.g. "(D-1)". A requirement that is not in the delta yet is copied in as MODIFIED first.
   - If it needs no spec change: set "Decision: none: <reason>".
   - Update the question: "Status: answered", "Decision: …", and a line "**Answer:** <option> (<date>)".
   - If the user postpones it: "Status: deferred".
4. Run `comb validate --change {{change}} --json` and fix every error.
5. Run `comb status --change {{change}}`. The review is now stale; tell the user what was decided and what remains open, and suggest /comb:review to re-check the changed requirements.

Never edit comb/specs/ or comb/decisions.md.
```

`templates/lenses/consistency.md`:

```markdown
# Lens: consistency

Goal: find statements that cannot all be true at once, or that disagree with what is already decided.

For every requirement the delta adds or modifies, and the base spec around it, check:
- requirement vs requirement: two MUST / MUST NOT statements that conflict for some state or event;
- requirement vs its scenarios: a THEN that contradicts the requirement text, or a scenario that cannot happen under the rules;
- tables and conventions vs requirements: transition tables, timers, money rules or status lists that say something different from the requirement text;
- requirements vs decisions (comb/decisions.md and this change's decisions.md): a requirement that silently reverses a decision;
- terms: one word used for two things, or two words for one thing.

For each conflict, write the shortest concrete sequence where both statements apply, name both sources (requirement ids, sections, decision ids), and ask which one is right.
```

`templates/lenses/formalization.md`:

```markdown
# Lens: formalization

Goal: expose ambiguity and gaps by forcing the change into a precise behavior model, the way a formal-methods engineer would before writing one. You do not write a formal model; you write the memo and ask about everything that does not fit.

Apply this lens when the change touches stateful behavior (statuses, lifecycles, timers, money, permissions). Otherwise write "Not applicable: <reason>" under "## Behavior model".

1. Glossary: the entities, their states, the actors, the operations and events (including timers and external events), and the values that matter (amounts, counts, deadlines).
2. Normalize every affected requirement: trigger → constraint → exception → boundary (what happens exactly at the limit: at the deadline instant, at zero, at the cap).
3. Coverage map: every requirement id → the states and events it governs. A requirement you cannot place is a finding.
4. State × event table for each stateful entity: for every (state, event) pair write "→ <target state>", "rejected (<error>)", or "?" when the spec does not say. Every "?" that a user, a job or an external system can actually trigger is a finding.
5. Assumption ledger: every guard, actor, bound, deadline or exception you had to assume. Each assumption that changes behavior is a finding.

Write the glossary, the table, the coverage map and the ledger under "## Behavior model" in review.md (compact tables). Turn the findings into questions. Never pick a default to make the model work — ask.
```

`templates/lenses/edge-cases.md`:

```markdown
# Lens: edge cases

Goal: find the sequences the spec does not handle — where real systems break.

Walk through these families with concrete sequences:
- Time: the gap between a deadline and the job that acts on it; timers that are paused, resumed or replaced; actions exactly at the deadline instant; time zones and calendar boundaries.
- Races: two actors on the same thing at once (buyer vs seller, a user vs a scheduled job, two users); retries and double submissions.
- External events: duplicated, delayed, out-of-order or missing callbacks (payment provider, carrier, bank, card network); events that arrive after the state they refer to has moved on.
- Money: every flow in and out (charges, refunds, fees, payouts, chargebacks, points). Can more go out than came in? Can anything happen twice? What is irreversible?
- Permissions and identity: who may do each operation; what happens to work in flight when an account is restricted or deleted.
- Failure and recovery: a step that fails halfway; manual support or admin operations and how they interact with automation.

Report only sequences that the spec as written allows (cite the requirement for each step) or leaves undefined. Prefer a few deep findings over many shallow ones.
```

`templates/lenses/change-impact.md`:

```markdown
# Lens: change impact

Goal: make sure the change does not break what is already specified or decided.

Read the base specs in comb/specs/ in full, not only the requirements the delta touches.
- For each MODIFIED or REMOVED requirement: which other requirements, scenarios, tables and decisions relied on the old text? Are they still true?
- For each ADDED requirement: does it open a new path into states or money flows that existing rules did not anticipate?
- Look for unchanged text that now contradicts the change (tables, conventions, other capabilities), and for obligations the delta should have updated but did not.
- For every decision in comb/decisions.md whose Refs touch the same requirements: does the change silently reverse it? Reversing is allowed only through a new decision that supersedes it.

When the change only adds a new capability, check it against the other capabilities and the project-wide decisions instead.
```

- [ ] **Step 2: Write the failing test**

`test/core/instructions/review-clarify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildInstructions, openQuestions } from '../../../src/core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { stampReview } from '../../../src/core/workflow/review-stamp.js';
import { CONFIG_YAML, DECISIONS_MD, LOCAL_DECISIONS_MD, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const QUESTIONS = `## Q-1: low one\n- **Status:** open\n- **Severity:** low\n\n## Q-2: answered\n- **Status:** answered\n- **Severity:** high\n- **Decision:** D-1\n\n## Q-3: high one\n- **Status:** open\n- **Severity:** high\n\n## Q-4: medium one\n- **Status:** open\n- **Severity:** medium\n`;

function setup(review?: string) {
  const files: Record<string, string> = {
    'comb/config.yaml': `${CONFIG_YAML}review:\n  lenses: [consistency, edge-cases]\n  batch: 2\n`,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': DECISIONS_MD,
    'comb/changes/c/.comb.yaml': metaYaml('c'),
    'comb/changes/c/proposal.md': '# Change: c\n',
    'comb/changes/c/specs/order-lifecycle/spec.md': '## ADDED Requirements\n\n### Requirement: REQ-ORDER-011 X\nx\n\n#### Scenario: s\n- **GIVEN** a\n',
    'comb/changes/c/questions.md': QUESTIONS,
    'comb/changes/c/decisions.md': LOCAL_DECISIONS_MD,
  };
  if (review !== undefined) files['comb/changes/c/review.md'] = review;
  const root = makeProject(files);
  const all = loadAllChanges(root);
  return { project: loadProject(root), change: all[0]!, all };
}

describe('openQuestions', () => {
  it('orders open questions by severity, then number', () => {
    expect(openQuestions(setup().change).map((q) => q.id)).toEqual(['Q-3', 'Q-4', 'Q-1']);
  });
});

describe('review instructions', () => {
  it('serves the configured lenses, the files to read and the outputs', () => {
    const { project, change, all } = setup();
    const ins = buildInstructions('review', project, change, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/c/review.md');
    expect(ins.alsoWrite).toEqual(['comb/changes/c/questions.md']);
    expect(ins.lenses.map((l) => l.id)).toEqual(['consistency', 'edge-cases']);
    expect(ins.lenses[1]!.definition).toContain('# Lens: edge cases');
    expect(ins.context.readFiles).toEqual([
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
      'comb/changes/c/proposal.md',
      'comb/changes/c/specs/order-lifecycle/spec.md',
      'comb/changes/c/questions.md',
      'comb/changes/c/decisions.md',
    ]);
    expect(ins.template).toContain('## Behavior model');
    expect(ins.template).toContain('**Recommendation:**');
    expect(ins.instruction).toContain('comb mark-reviewed --change c');
    expect(ins.instruction).toContain('comb/changes/c/questions.md');
    expect(ins.instruction).not.toContain('{{');
    expect(ins.ids.nextQuestion).toBe('Q-5');
    expect(ins.context.changedSinceReview).toBeNull();
  });

  it('lists the requirements changed since the last stamped review', () => {
    const review = stampReview('# Review: c\n', 'sha256:0000000000000000', { 'REQ-ORDER-011': 'sha256:old' })!;
    const { project, change, all } = setup(review);
    expect(buildInstructions('review', project, change, all, TEMPLATES_DIR).context.changedSinceReview).toEqual(['REQ-ORDER-011']);
  });
});

describe('clarify instructions', () => {
  it('serves open questions, the batch size and the next decision id', () => {
    const { project, change, all } = setup();
    const ins = buildInstructions('clarify', project, change, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/c/decisions.md');
    expect(ins.alsoWrite).toEqual(['comb/changes/c/questions.md', 'comb/changes/c/specs/<capability>/spec.md']);
    expect(ins.context.openQuestions.map((q) => [q.id, q.severity])).toEqual([
      ['Q-3', 'high'],
      ['Q-4', 'medium'],
      ['Q-1', 'low'],
    ]);
    expect(ins.context.batch).toBe(2);
    expect(ins.ids.nextDecision).toBe('D-2');
    expect(ins.context.readFiles).toEqual([
      'comb/changes/c/questions.md',
      'comb/changes/c/decisions.md',
      'comb/changes/c/specs/order-lifecycle/spec.md',
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
    ]);
    expect(ins.template).toContain('## D-1:');
    expect(ins.lenses).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run test/core/instructions/review-clarify.test.ts`
Expected: FAIL (`openQuestions` is not exported / `review` is not a known artifact)

- [ ] **Step 4: Implement**

Replace `src/core/instructions/build.ts` with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDecisions, parseQuestions } from '../decision/parse.js';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { paths, rel, type ChangeFileName } from '../project/paths.js';
import { nextRequirementId } from '../spec/ids.js';
import { changedSince, requirementHashes } from '../workflow/hash.js';
import { readReviewStamp } from '../workflow/review-stamp.js';

export type InstructionArtifact = 'proposal' | 'delta' | 'tasks' | 'review' | 'clarify';
export const INSTRUCTION_ARTIFACTS: readonly InstructionArtifact[] = ['proposal', 'delta', 'tasks', 'review', 'clarify'];

export interface QuestionSummary {
  id: string;
  title: string;
  severity: string;
}

export interface Lens {
  id: string;
  definition: string;
}

export interface Instructions {
  artifact: InstructionArtifact;
  change: string;
  outputPath: string;
  alsoWrite: string[];
  template: string;
  instruction: string;
  rules: string[];
  language: string;
  lenses: Lens[];
  context: {
    project: string;
    capabilities: string[];
    readFiles: string[];
    openQuestions: QuestionSummary[];
    changedSinceReview: string[] | null;
    batch: number;
  };
  ids: { nextRequirement: Record<string, string>; prefixesInUse: string[]; nextQuestion: string; nextDecision: string };
}

const fill = (t: string, vars: Record<string, string>): string =>
  t.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => vars[k] ?? m);

export function nextRequirementIds(project: Project, changes: ChangeSnapshot[]): Record<string, string> {
  // Ids are unique project-wide, so every capability counts against every id in use.
  const used = [
    ...[...project.specs.values()].flatMap((s) => [...s.capability.requirements.map((r) => r.id), ...s.capability.retired]),
    ...changes.flatMap((c) => c.deltas.flatMap((d) => d.delta.added.map((r) => r.id))),
  ];
  const out: Record<string, string> = {};
  for (const spec of project.specs.values()) {
    if (spec.capability.prefix) out[spec.name] = nextRequirementId(spec.capability.prefix, used);
  }
  for (const c of changes) {
    for (const d of c.deltas) {
      if (project.specs.has(d.capability) || !d.delta.prefix || out[d.capability] !== undefined) continue;
      out[d.capability] = nextRequirementId(d.delta.prefix, used);
    }
  }
  return out;
}

export function prefixesInUse(project: Project, changes: ChangeSnapshot[]): string[] {
  const prefixes = [
    ...[...project.specs.values()].map((s) => s.capability.prefix),
    ...changes.flatMap((c) => c.deltas.filter((d) => !project.specs.has(d.capability)).map((d) => d.delta.prefix)),
  ];
  return [...new Set(prefixes.filter((p): p is string => p !== null))].sort();
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const idNumber = (id: string): number => Number(id.split('-')[1] ?? 0);
const nextLocalId = (prefix: 'Q' | 'D', ids: string[]): string => `${prefix}-${Math.max(0, ...ids.map(idNumber)) + 1}`;

export function openQuestions(change: ChangeSnapshot): QuestionSummary[] {
  return parseQuestions(change.files.questions ?? '', 'questions.md')
    .questions.filter((q) => q.status === 'open')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || idNumber(a.id) - idNumber(b.id))
    .map((q) => ({ id: q.id, title: q.title, severity: q.severity }));
}

export function buildInstructions(
  artifact: InstructionArtifact,
  project: Project,
  change: ChangeSnapshot,
  all: ChangeSnapshot[],
  templatesDir: string,
): Instructions {
  const root = project.root;
  const changeFile = (name: ChangeFileName): string => rel(root, paths.changeFile(root, change.id, name));
  const has = (name: ChangeFileName): boolean => change.files[name] !== undefined;
  const specFiles = [...project.specs.values()].map((s) => s.file);
  const projectDecisions = existsSync(paths.decisions(root)) ? [rel(root, paths.decisions(root))] : [];
  const proposal = has('proposal') ? [changeFile('proposal')] : [];
  const deltas = change.deltas.map((d) => d.file);
  const ownQuestionsAndDecisions = [...(has('questions') ? [changeFile('questions')] : []), ...(has('decisions') ? [changeFile('decisions')] : [])];
  const touchedSpecs = change.deltas.map((d) => project.specs.get(d.capability)?.file).filter((f): f is string => f !== undefined);
  const readFiles: Record<InstructionArtifact, string[]> = {
    proposal: [...specFiles, ...projectDecisions],
    delta: [...specFiles, ...projectDecisions, ...proposal],
    tasks: [...proposal, ...deltas],
    review: [...specFiles, ...projectDecisions, ...proposal, ...deltas, ...ownQuestionsAndDecisions],
    clarify: [...ownQuestionsAndDecisions, ...deltas, ...touchedSpecs, ...projectDecisions],
  };
  const deltaPattern = `comb/changes/${change.id}/specs/<capability>/spec.md`;
  const outputPath = artifact === 'delta' ? deltaPattern : changeFile(artifact === 'clarify' ? 'decisions' : artifact);
  const alsoWrite =
    artifact === 'review' ? [changeFile('questions')] : artifact === 'clarify' ? [changeFile('questions'), deltaPattern] : [];
  const formats = artifact === 'review' ? ['review', 'questions'] : artifact === 'clarify' ? ['decisions', 'questions'] : [artifact];
  const read = (dir: string, name: string): string => readFileSync(join(templatesDir, dir, `${name}.md`), 'utf8');
  const vars = {
    change: change.id,
    language: project.config.language,
    questionsPath: changeFile('questions'),
    decisionsPath: changeFile('decisions'),
  };
  const questions = parseQuestions(change.files.questions ?? '', 'questions.md').questions;
  const decisions = parseDecisions(change.files.decisions ?? '', 'decisions.md').decisions;
  return {
    artifact,
    change: change.id,
    outputPath,
    alsoWrite,
    template: formats.map((f) => read('formats', f)).join('\n'),
    instruction: fill(read('instructions', artifact), vars),
    rules: project.config.rules[artifact] ?? [],
    language: project.config.language,
    lenses: artifact === 'review' ? project.config.review.lenses.map((id) => ({ id, definition: read('lenses', id) })) : [],
    context: {
      project: project.config.context,
      capabilities: [...project.specs.keys()],
      readFiles: readFiles[artifact],
      openQuestions: openQuestions(change),
      changedSinceReview: changedSince(readReviewStamp(change.files.review).requirements, requirementHashes(change)),
      batch: project.config.review.batch,
    },
    ids: {
      nextRequirement: nextRequirementIds(project, all),
      prefixesInUse: prefixesInUse(project, all),
      nextQuestion: nextLocalId('Q', questions.map((q) => q.id)),
      nextDecision: nextLocalId('D', decisions.map((d) => d.id)),
    },
  };
}
```

In `src/cli/commands/instructions.ts`, replace the `human` function with:

```ts
const human = (i: Instructions): string =>
  [
    `# ${i.artifact} for ${i.change} → ${i.outputPath}${i.alsoWrite.length > 0 ? ` (also: ${i.alsoWrite.join(', ')})` : ''}`,
    i.instruction.trim(),
    i.rules.length > 0 ? `Rules:\n${i.rules.map((r) => `- ${r}`).join('\n')}` : '',
    `Read first:\n${i.context.readFiles.map((f) => `- ${f}`).join('\n') || '- (none)'}`,
    i.context.openQuestions.length > 0
      ? `Open questions:\n${i.context.openQuestions.map((q) => `- ${q.id} (${q.severity}) ${q.title}`).join('\n')}`
      : '',
    i.lenses.length > 0 ? i.lenses.map((l) => l.definition.trim()).join('\n\n') : '',
    `Next ids: ${JSON.stringify({ ...i.ids.nextRequirement, question: i.ids.nextQuestion, decision: i.ids.nextDecision })}`,
    `Template:\n${i.template.trim()}`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');
```

- [ ] **Step 5: Run the whole suite and confirm it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (the existing `build.test.ts` is unchanged and still passes); no type errors

- [ ] **Step 6: Commit**

```bash
git add src/core/instructions/build.ts src/cli/commands/instructions.ts templates test/core/instructions/review-clarify.test.ts
git commit -m "feat: review and clarify instructions with lenses and formats"
```

---

### Task 6: The `review` and `clarify` skills

**Files:**
- Create: `templates/skills/review.md`, `templates/skills/clarify.md`
- Modify: `test/agents/claude-code.test.ts`, `test/core/project/init.test.ts` (the generated file lists now include the new workflows)

**Interfaces:**
- Consumes: `claudeCode` adapter (M1 + F1). Workflows are discovered from `templates/skills/*.md`.
- Produces: `.claude/skills/comb-review/SKILL.md`, `.claude/skills/comb-clarify/SKILL.md`, `.claude/commands/comb/review.md`, `.claude/commands/comb/clarify.md`

- [ ] **Step 1: Update the tests (they fail first)**

In `test/agents/claude-code.test.ts`:
- Change the `listWorkflows` expectation to `['clarify', 'explore', 'propose', 'review']`.
- Change the generated paths expectation to:

  ```ts
  expect(files.map((f) => f.path)).toEqual([
    '.claude/skills/comb-clarify/SKILL.md',
    '.claude/commands/comb/clarify.md',
    '.claude/skills/comb-explore/SKILL.md',
    '.claude/commands/comb/explore.md',
    '.claude/skills/comb-propose/SKILL.md',
    '.claude/commands/comb/propose.md',
    '.claude/skills/comb-review/SKILL.md',
    '.claude/commands/comb/review.md',
  ]);
  ```

- Change the indexes `files[2]` → `files[4]` and `files[3]` → `files[5]`, which are the propose skill and command.

In `test/core/project/init.test.ts`, change the `created` expectation of `creates the comb folder, config and agent files` to:

```ts
    expect(r.created).toEqual([
      'comb/config.yaml',
      'comb/decisions.md',
      'comb/specs/.gitkeep',
      'comb/changes/archive/.gitkeep',
      '.claude/skills/comb-clarify/SKILL.md',
      '.claude/commands/comb/clarify.md',
      '.claude/skills/comb-explore/SKILL.md',
      '.claude/commands/comb/explore.md',
      '.claude/skills/comb-propose/SKILL.md',
      '.claude/commands/comb/propose.md',
      '.claude/skills/comb-review/SKILL.md',
      '.claude/commands/comb/review.md',
    ]);
```

Add a test to `test/agents/claude-code.test.ts`:

```ts
  it('generates review and clarify commands that drive the CLI', () => {
    const files = claudeCode.files(TEMPLATES_DIR, '9.9.9');
    const review = files.find((f) => f.path === '.claude/commands/comb/review.md')!.content;
    expect(review).toContain('comb instructions review');
    expect(review).toContain('comb mark-reviewed');
    const clarify = files.find((f) => f.path === '.claude/commands/comb/clarify.md')!.content;
    expect(clarify).toContain('comb instructions clarify');
    expect(clarify).toContain('never answer');
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run test/agents test/core/project/init.test.ts`
Expected: FAIL (the workflows are not there yet)

- [ ] **Step 3: Write the skill templates**

`templates/skills/review.md`:

```markdown
---
description: Review a Comb change through the consistency, formalization, edge-case and change-impact lenses, and turn every finding into an answerable question. Use after a change is proposed or updated.
---
# Comb: review

The `comb` CLI is the source of truth for lenses, formats and rules. Follow what it returns.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `review` (ask if there are several).
2. Run `comb instructions review --change <id> --json` and follow `data.instruction`, using `data.lenses`, `data.template`, `data.context` and `data.ids`.
3. Write `data.outputPath` and the files in `data.alsoWrite`. Do not edit the delta or anything under `comb/specs/`.
4. Run `comb validate --change <id> --json` until `ok` is `true`, then run `comb mark-reviewed --change <id>`.
5. Report the questions created by severity, and the next step from `comb status --change <id>`.
```

`templates/skills/clarify.md`:

```markdown
---
description: Walk the user through a Comb change's open questions, record each answer as a decision, and update the spec delta. Use after a review, or when the user answers questions.
---
# Comb: clarify

The `comb` CLI is the source of truth for formats and rules. Follow what it returns.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `clarify`.
2. Run `comb instructions clarify --change <id> --json` and follow `data.instruction`, using `data.context.openQuestions`, `data.context.batch`, `data.template` and `data.ids.nextDecision`.
3. The user decides: never answer a question on the user's behalf. Answers the user already gave in their request count.
4. After writing the decisions, the questions and the delta edits, run `comb validate --change <id> --json` until `ok` is `true`.
5. Run `comb status --change <id>` and tell the user what was decided, what remains open, and that `/comb:review` should re-check the changed requirements.

Never edit `comb/specs/` or `comb/decisions.md` directly.
```

- [ ] **Step 4: Run the whole suite and confirm it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS; no type errors

- [ ] **Step 5: Commit**

```bash
git add templates/skills test/agents test/core/project/init.test.ts
git commit -m "feat: review and clarify skills and slash commands"
```

---

### Task 7: The E3 benchmark project

**Files:**
- Create: `bench/order-lifecycle/convert.py` (one-off generator; its output is committed)
- Create (generated): `bench/order-lifecycle/project/**`
- Create: `bench/order-lifecycle/expected-highs.md`, `bench/order-lifecycle/README.md`
- Test: `test/bench.test.ts`

**Interfaces:**
- Consumes: `runCli`, `loadChange`
- Produces: a valid Comb project whose change `add-order-lifecycle` adds the capability `order-lifecycle`, with prefix `ORDER` and requirements `REQ-ORDER-001`…`018` (Spike 01's 18 requirements), its Conventions/States/Open Questions as ADDED Sections, and the 7 baseline high issues as the answer key.

- [ ] **Step 1: Write the failing test**

`test/bench.test.ts`:

```ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/app.js';
import { loadChange } from '../src/core/project/load.js';

const ROOT = resolve('bench/order-lifecycle/project');

describe('E3 benchmark project', () => {
  it('is a valid change that adds the 18-requirement order-lifecycle capability', async () => {
    const r = await runCli(['validate', '--change', 'add-order-lifecycle', '--json'], ROOT);
    const env = JSON.parse(r.stdout);
    expect(env.diagnostics).toEqual([]);
    expect(r.code).toBe(0);
    const change = loadChange(ROOT, 'add-order-lifecycle')!;
    const delta = change.deltas[0]!.delta;
    expect(delta.prefix).toBe('ORDER');
    expect(delta.added.map((x) => x.id)).toEqual(Array.from({ length: 18 }, (_, i) => `REQ-ORDER-${String(i + 1).padStart(3, '0')}`));
    expect(delta.addedSections.map((s) => s.heading)).toEqual(['Conventions', 'States', 'Open Questions']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run test/bench.test.ts`
Expected: FAIL (the project does not exist)

- [ ] **Step 3: Write the generator and generate the project**

`bench/order-lifecycle/convert.py`:

```python
#!/usr/bin/env python3
"""Build the E3 benchmark project from the Spike 01 order-lifecycle spec.

One-off generator: the output under project/ is committed. Usage:
  python3 bench/order-lifecycle/convert.py .spike/spike/spec/order-lifecycle.md bench/order-lifecycle/project
"""
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(sys.argv[2])

text = re.sub(r"\bREQ-(\d{2})\b", lambda m: f"REQ-ORDER-0{m.group(1)}", src)
purpose, requirements, sections = "", "", []
for part in re.split(r"^## ", text, flags=re.M)[1:]:
    title, _, body = part.partition("\n")
    title, body = title.strip(), body.strip()
    if title == "Purpose":
        purpose = body
    elif title == "Requirements":
        requirements = body
    else:
        # sub-headings inside a section move one level down, below "### Section:"
        sections.append(f"### Section: {title}\n" + re.sub(r"^### ", "#### ", body, flags=re.M) + "\n")

change = out / "comb" / "changes" / "add-order-lifecycle"
(change / "specs" / "order-lifecycle").mkdir(parents=True, exist_ok=True)
(out / "comb" / "specs").mkdir(parents=True, exist_ok=True)
(out / "comb" / "specs" / ".gitkeep").write_text("")
(out / "comb" / "config.yaml").write_text(
    "version: 1\nlanguage: en\nagents: [claude-code]\n"
    "context: \"Kurumi, a C2C marketplace for second-hand goods (like Mercari). MVP order lifecycle.\"\n"
)
(out / "comb" / "decisions.md").write_text("# Decisions\n")
(change / ".comb.yaml").write_text("schema: comb.change/v1\nid: add-order-lifecycle\ncreated: 2026-10-06\nbase: {}\n")
(change / "proposal.md").write_text(
    "# Change: Order lifecycle for the Kurumi MVP\n\n"
    "## Why\nBuyers and sellers need a safe path from \"Buy\" to completion, cancellation or refund, "
    "with Kurumi holding the money until the transaction completes.\n\n"
    "## What Changes\n- Adds the order-lifecycle capability: payment, shipment, delivery, confirmation, "
    "auto-completion, cancellation, disputes, returns, refunds, chargebacks, admin force-cancel and seller payout.\n\n"
    "## Impact\n- Capabilities: order-lifecycle (new)\n- Requirements: REQ-ORDER-001..REQ-ORDER-018 (new)\n"
)
(change / "tasks.md").write_text("- [ ] 1.1 Implement the order lifecycle (REQ-ORDER-001..REQ-ORDER-018)\n")
(change / "specs" / "order-lifecycle" / "spec.md").write_text(
    "---\nprefix: ORDER\n---\n## Purpose\n" + purpose + "\n\n## ADDED Sections\n\n" + "\n".join(sections)
    + "\n## ADDED Requirements\n\n" + requirements + "\n"
)
print("wrote", change)
```

Run:

```bash
python3 bench/order-lifecycle/convert.py .spike/spike/spec/order-lifecycle.md bench/order-lifecycle/project
```

(`.spike/` exists only on the author's machine. On other machines the committed `project/` is the source of truth.)

`bench/order-lifecycle/expected-highs.md`:

```markdown
# Answer key: high-severity issues (Spike 01 baseline review)

A fresh Claude reviewer found these 7 high-severity issues in the same spec (`docs/research/spikes/spike-01-verification-loop.md`).
E3 passes when `/comb:review` raises questions whose root cause matches at least 5 of them (any severity).

| Key | Root cause |
|---|---|
| BL-01 | A duplicate PSP notification and a late payment cannot be told apart; a second capture is either ignored or refunded in a way that zeroes the seller's proceeds. |
| BL-02 | A late payment on a cancelled order cannot be refunded, because REQ-ORDER-016 forbids refunds when captured_amount = 0. |
| BL-03 | The "paid out" definition breaks with payouts in flight and frozen funds (force-cancel or chargeback during an in-flight payout; frozen funds counted as paid out). |
| BL-04 | A chargeback on a cancelled or refunded order does not stop refunds and has no outcome rule, so the buyer can be refunded twice. |
| BL-05 | The return-ship deadline can fire T17 after the buyer has already shipped the return. |
| BL-06 | An Admin force-cancel after a lost chargeback on a completed order refunds the buyer a second time. |
| BL-07 | Scheduled jobs re-check status and hold but not the current deadline, so stale jobs can complete orders early. |
```

`bench/order-lifecycle/README.md`:

````markdown
# Benchmark: order-lifecycle (E3)

`project/` is a Comb project with one change, `add-order-lifecycle`. That change adds Spike 01's 18-requirement order-lifecycle spec as a new capability. `expected-highs.md` is the answer key.

## Run

```bash
B=$(mktemp -d) && cp -R bench/order-lifecycle/project/. "$B" && cd "$B"
git init -q && comb init --language en && git add -A && git commit -qm base
claude -p '/comb:review add-order-lifecycle' --permission-mode acceptEdits \
  --allowedTools "Bash(comb:*)" Read Write Edit Glob Grep --output-format stream-json --verbose > review.jsonl
comb validate --change add-order-lifecycle && comb status --change add-order-lifecycle
```

## Judge

For each row of `expected-highs.md`, find the question in `comb/changes/add-order-lifecycle/questions.md` that has the same root cause (the sequence and the conflict, not just the topic). Record the matches in `docs/experience-log.md`. E3 passes with at least 5 of 7.
````

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run test/bench.test.ts`
Expected: PASS. If `validate` reports diagnostics, fix the generator (not the generated files), regenerate, and ledger a ruling.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npx vitest run
git add bench test/bench.test.ts
git commit -m "test: order-lifecycle benchmark project for review recall (E3)"
```

---

### Task 8: Experience checks E3 and E4, and the log

This task checks with a real Claude Code that the loop works; it is not about code. It runs about four `claude -p` sessions on the benchmark spec, at an estimated $10–20 in total.

**Files:**
- Modify: `docs/experience-log.md`, `docs/IMPLEMENTATION_PLAN.md` (mark M2 and record follow-ups)

- [ ] **Step 1: Build, and make `comb` available without a global install**

```bash
npm run build
T=$(mktemp -d) && mkdir -p "$T/bin" && printf '#!/bin/sh\nexec node %s/dist/cli/index.js "$@"\n' "$PWD" > "$T/bin/comb" && chmod +x "$T/bin/comb"
export PATH="$T/bin:$PATH"; comb --version
```

Expected: `0.0.1`

- [ ] **Step 2: E3 — review**

```bash
B="$T/bench" && mkdir -p "$B" && cp -R bench/order-lifecycle/project/. "$B" && cd "$B"
git init -q && comb init --language en && git add -A && git commit -qm base
claude -p '/comb:review add-order-lifecycle' --permission-mode acceptEdits \
  --allowedTools "Bash(comb:*)" Read Write Edit Glob Grep --output-format stream-json --verbose > "$T/e3.jsonl"
comb validate --change add-order-lifecycle --json; comb status --change add-order-lifecycle
```

Pass conditions:
- `validate` is ok.
- `status` shows the review as `done`, which proves that `mark-reviewed` ran.
- `questions.md` has questions in the template's format (sequence, options with Spec change, recommendation).
- `review.md` has the "Behavior model" section.
- Judged against `bench/order-lifecycle/expected-highs.md`, at least 5 of the 7 root causes are matched.

- [ ] **Step 3: E4 — clarify, then re-review**

```bash
claude -p '/comb:clarify add-order-lifecycle Answer every high-severity question with its recommended option. Defer all medium and low questions.' \
  --permission-mode acceptEdits --allowedTools "Bash(comb:*)" Read Write Edit Glob Grep --output-format stream-json --verbose > "$T/e4-clarify.jsonl"
comb validate --change add-order-lifecycle --json; comb status --change add-order-lifecycle; git diff --stat
claude -p '/comb:review add-order-lifecycle' --permission-mode acceptEdits \
  --allowedTools "Bash(comb:*)" Read Write Edit Glob Grep --output-format stream-json --verbose > "$T/e4-review.jsonl"
comb status --change add-order-lifecycle
```

Pass conditions:
- After clarify:
  - `decisions.md` has `D-1…`, each with From/Refs/rule/Why.
  - Every high question is `answered` and links its decision; the medium and low ones are `deferred`.
  - The delta changed and cites the decisions.
  - `validate` is ok.
  - `status` shows the review as `stale`.
- After the re-review:
  - The review is `done`, and the answered questions are untouched.
  - `status` gates correctly: `clarify` is `blocked` exactly when new high questions are open; otherwise `next` moves on to `apply`.
  - When new high questions appear, run Step 3 once more (at most two rounds in total) and record whether the loop converges.

- [ ] **Step 4: Record and commit**

Append one row per experience (E3, E4) to `docs/experience-log.md`: date, version, result, turns/time/cost from each `result` event, and the E3 match table (BL-01…07 → Q-n or "missed").

Mark M2 in `docs/IMPLEMENTATION_PLAN.md` (e.g. "M2（完了：<date>）"), and add any follow-ups found, as the M1 F1 row did.

```bash
git add docs/experience-log.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: M2 experience log (E3, E4)"
```
