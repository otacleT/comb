# M1 Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `comb init` → `/comb:propose` で、要件IDの付いた有効な change を作れるところまでを、実際の Claude Code で成立させる（V0_SCOPE の E1・E2）。

**Architecture:** 単一の TypeScript パッケージ。
- `src/core/` に純粋関数を置く：Markdown の解析、仕様と delta の解析・検査、状態の計算、instructions の組み立て。
- ファイル入出力は `src/core/project/`、`src/core/change/new-change.ts`、`src/cli/` だけで行う。
- CLI は commander で組み、すべてのコマンドが共通の JSON 封筒（`schema: "comb.v1"`）を返す。
- Claude Code 用の Skill とスラッシュコマンドは `templates/` から生成する。

**Tech Stack:** Node 20以上、TypeScript（strict、ESM/NodeNext）、commander、yaml、mdast-util-from-markdown、mdast-util-to-string、vitest。

**Spec:** `docs/DESIGN.md`（§2〜§5.1、§7、§8）、`docs/V0_SCOPE.md`（M1〜M3、M7、M8、M11、E1、E2）

## Global Constraints

- Node `>=20`、`"type": "module"`、TypeScript `strict: true`、`module`/`moduleResolution` は `NodeNext`。import には `.js` 拡張子を付ける。
- 実行時の依存は `commander`、`yaml`、`mdast-util-from-markdown`、`mdast-util-to-string` の4つだけ。開発用の依存は `typescript`、`vitest`、`@types/node`、`@types/mdast`。
- コマンド名は `comb`。パッケージ名は仮に `@otaclet/comb`（DESIGN §10）。
- JSON 封筒は `{ "schema": "comb.v1", "command", "ok", "data", "diagnostics" }`。終了コードは 0 = ok、1 = 検査エラー・ゲート未達、2 = 使い方の誤り、3 = 内部エラー。
- 要件IDは `REQ-<PREFIX>-<NNN>`（PREFIX は英大文字で始まる英大文字・数字、NNN は3桁以上）。構造キーワードは英語固定（`Requirement:`、`Scenario:`、`GIVEN/WHEN/THEN/AND`、`ADDED/MODIFIED/REMOVED Requirements`、`ADDED/MODIFIED Sections`、`Section:`、`**Reason:**`、`**Migration:**`）。
- 読み込むテキストはすべて `normalizeText`（BOM 除去、CRLF/CR → LF）を通す。
- テレメトリとネットワークアクセスはなし。
- M1 では、正本（`comb/specs/**`、`comb/decisions.md`）を書き換えるコードを作らない（archive は M3）。`comb init` が空の `comb/decisions.md` を新規作成することだけは例外。
- 作業ブランチは `feat/m1-walking-skeleton`。`main` にはまだコミットがないので、`docs/v0-design` から切る。

## Review Focus

1. **CRLF や BOM 付きの Markdown**（Windows や他のエディタで保存したもの）でも、LF と同じ解析結果になること → Task 2（`normalizeText`）と Task 6（`readText`）のテストで固定する。
2. **コードフェンスの中の `### Requirement:` 見出し**（仕様中の例示）を、要件として数えないこと → Task 2 と Task 3 のテストで固定する。
3. **Comb プロジェクトの外での実行**では、スタックトレースを出さず、`NOT_A_COMB_PROJECT` を返して exit 2 で終わること → Task 8 のテストで固定する。
4. **不正な change ID や重複した change ID** では、何も作らずにエラーにすること（中途半端なフォルダを残さない）→ Task 7 のテストで固定する。
5. **ユーザーが手で編集した Skill ファイル**を、`comb init` の再実行で上書きしないこと → Task 11 のテストで固定する。

---

### Task 1: パッケージの土台、診断の型、JSON 封筒、CLI の入口

**Files:**
- Create: `package.json`、`tsconfig.json`、`vitest.config.ts`、`.gitignore`
- Create: `src/version.ts`、`src/templates-dir.ts`、`src/core/diagnostics.ts`、`src/cli/output.ts`、`src/cli/app.ts`、`src/cli/index.ts`
- Test: `test/cli/output.test.ts`、`test/cli/app.test.ts`

**Interfaces:**
- Produces:
  - `diag(severity, code, message, target?, fix?): Diagnostic`
  - `hasErrors(ds): boolean`
  - `envelope<T>(command, data, diagnostics?): Envelope<T>`
  - `render<T>(env, json, human: (data: T) => string): string`
  - `exitCodeFor(env): number`
  - `EXIT`
  - `runCli(argv, cwd, opts?): Promise<CliResult>`
  - `CliContext { cwd; today(); out(text); setCode(code) }`
  - `Registrar = (program: Command, ctx: CliContext) => void`
  - `VERSION`、`TEMPLATES_DIR`

- [ ] **Step 1: ブランチを作り、パッケージを初期化する**

```bash
git checkout -b feat/m1-walking-skeleton docs/v0-design
npm init -y
npm install commander yaml mdast-util-from-markdown mdast-util-to-string
npm install -D typescript vitest @types/node @types/mdast
```

`package.json` の依存以外のフィールドを、次の内容に書き換える（`dependencies` と `devDependencies` は npm が書いたものをそのまま残す）。

```json
{
  "name": "@otaclet/comb",
  "version": "0.0.1",
  "description": "From tangled ideas to decided specs.",
  "type": "module",
  "bin": { "comb": "dist/cli/index.js" },
  "files": ["dist", "templates"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "license": "MIT"
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

`.gitignore`：

```
node_modules/
dist/
```

- [ ] **Step 2: 失敗するテストを書く**

`test/cli/output.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { diag, hasErrors } from '../../src/core/diagnostics.js';
import { envelope, exitCodeFor, render } from '../../src/cli/output.js';

describe('envelope', () => {
  it('is ok when there are only warnings', () => {
    const env = envelope('validate', { n: 1 }, [diag('warning', 'SCENARIO_DROPPED', 'x')]);
    expect(env).toEqual({
      schema: 'comb.v1',
      command: 'validate',
      ok: true,
      data: { n: 1 },
      diagnostics: [{ severity: 'warning', code: 'SCENARIO_DROPPED', message: 'x' }],
    });
    expect(exitCodeFor(env)).toBe(0);
  });

  it('is not ok when there is an error', () => {
    const ds = [diag('error', 'SPEC_PARSE', 'bad', { file: 'a.md', line: 3 }, 'fix it')];
    expect(hasErrors(ds)).toBe(true);
    const env = envelope('validate', null, ds);
    expect(env.ok).toBe(false);
    expect(exitCodeFor(env)).toBe(1);
  });
});

describe('render', () => {
  it('renders JSON when asked', () => {
    const env = envelope('x', { a: 1 });
    expect(JSON.parse(render(env, true, () => 'human'))).toEqual(env);
  });

  it('renders the human line followed by diagnostics', () => {
    const env = envelope('x', { a: 1 }, [diag('error', 'SPEC_PARSE', 'bad', { file: 'a.md', line: 3 }, 'fix it')]);
    expect(render(env, false, (d) => `a=${d.a}`)).toBe('a=1\nerror: SPEC_PARSE: bad (a.md:3)\n  fix: fix it');
  });
});
```

`test/cli/app.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { VERSION } from '../../src/version.js';

describe('runCli', () => {
  it('prints the version and exits 0', async () => {
    const r = await runCli(['--version'], process.cwd());
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });
});
```

- [ ] **Step 3: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/cli`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 4: 実装する**

`src/version.ts`：

```ts
import { readFileSync } from 'node:fs';

export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
```

`src/templates-dir.ts`：

```ts
import { fileURLToPath } from 'node:url';

/** Package-root `templates/` directory (works from both `src/` and `dist/`). */
export const TEMPLATES_DIR: string = fileURLToPath(new URL('../templates/', import.meta.url));
```

`src/core/diagnostics.ts`：

```ts
export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticTarget {
  file?: string;
  line?: number;
  id?: string;
}

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  target?: DiagnosticTarget;
  fix?: string;
}

export function diag(
  severity: Severity,
  code: string,
  message: string,
  target?: DiagnosticTarget,
  fix?: string,
): Diagnostic {
  const d: Diagnostic = { severity, code, message };
  if (target) d.target = target;
  if (fix) d.fix = fix;
  return d;
}

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === 'error');
```

`src/cli/output.ts`：

```ts
import { hasErrors, type Diagnostic } from '../core/diagnostics.js';

export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, INTERNAL: 3 } as const;

export interface Envelope<T> {
  schema: 'comb.v1';
  command: string;
  ok: boolean;
  data: T;
  diagnostics: Diagnostic[];
}

export function envelope<T>(command: string, data: T, diagnostics: Diagnostic[] = []): Envelope<T> {
  return { schema: 'comb.v1', command, ok: !hasErrors(diagnostics), data, diagnostics };
}

export function formatDiagnostic(d: Diagnostic): string {
  const parts = d.target ? [d.target.file, d.target.line, d.target.id].filter((x) => x !== undefined) : [];
  const where = parts.length > 0 ? ` (${parts.join(':')})` : '';
  return `${d.severity}: ${d.code}: ${d.message}${where}${d.fix ? `\n  fix: ${d.fix}` : ''}`;
}

export function render<T>(env: Envelope<T>, json: boolean, human: (data: T) => string): string {
  if (json) return JSON.stringify(env, null, 2);
  return [human(env.data), ...env.diagnostics.map(formatDiagnostic)].filter((l) => l.length > 0).join('\n');
}

export const exitCodeFor = (env: Envelope<unknown>): number => (env.ok ? EXIT.OK : EXIT.FAILED);
```

`src/cli/app.ts`：

```ts
import { Command, CommanderError } from 'commander';
import { VERSION } from '../version.js';
import { EXIT } from './output.js';

export interface CliContext {
  cwd: string;
  today: () => string;
  out: (text: string) => void;
  setCode: (code: number) => void;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Registrar = (program: Command, ctx: CliContext) => void;

const registrars: Registrar[] = [];

export async function runCli(argv: string[], cwd: string, opts: { today?: () => string } = {}): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  let code: number = EXIT.OK;
  const ctx: CliContext = {
    cwd,
    today: opts.today ?? (() => new Date().toISOString().slice(0, 10)),
    out: (text) => {
      stdout += text.endsWith('\n') ? text : `${text}\n`;
    },
    setCode: (c) => {
      code = c;
    },
  };
  const program = new Command();
  program
    .name('comb')
    .description('From tangled ideas to decided specs.')
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (s) => {
        stdout += s;
      },
      writeErr: (s) => {
        stderr += s;
      },
    });
  for (const register of registrars) register(program, ctx);
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (e) {
    if (e instanceof CommanderError) {
      code = e.exitCode === 0 ? EXIT.OK : EXIT.USAGE;
    } else {
      stderr += `${(e as Error).stack ?? String(e)}\n`;
      code = EXIT.INTERNAL;
    }
  }
  return { code, stdout, stderr };
}
```

`src/cli/index.ts`：

```ts
#!/usr/bin/env node
import { runCli } from './app.js';

const result = await runCli(process.argv.slice(2), process.cwd());
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
```

- [ ] **Step 5: テストと型検査を実行して、通ることを確認する**

Run: `npx vitest run test/cli && npm run typecheck`
Expected: PASS（2ファイル、5テスト）、型エラーなし

- [ ] **Step 6: コミットする**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src test
git commit -m "chore: scaffold comb CLI package with JSON envelope"
```

---

### Task 2: テキストの正規化、frontmatter、見出しブロック

**Files:**
- Create: `src/core/markdown/text.ts`、`src/core/markdown/frontmatter.ts`、`src/core/markdown/blocks.ts`
- Test: `test/core/markdown.test.ts`

**Interfaces:**
- Produces:
  - `normalizeText(raw: string): string`
  - `lineOf(text: string, offset: number): number`（1始まり）
  - `splitFrontmatter(text): { data: Record<string, unknown>; bodyOffset: number; error: string | null }`
  - `HeadingBlock { depth; text; start; contentStart; end; line }`
    - `start`：見出し行の先頭
    - `contentStart`：見出し行の次の行の先頭
    - `end`：同じ深さかそれより浅い次の見出しの先頭、なければ文末
  - `headingBlocks(text, from = 0): HeadingBlock[]`
  - `childBlocks(blocks, parent, depth): HeadingBlock[]`

- [ ] **Step 1: 失敗するテストを書く**

`test/core/markdown.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { childBlocks, headingBlocks } from '../../src/core/markdown/blocks.js';
import { splitFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { lineOf, normalizeText } from '../../src/core/markdown/text.js';

describe('normalizeText', () => {
  it('strips the BOM and converts CRLF/CR to LF', () => {
    expect(normalizeText('﻿a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('lineOf', () => {
  it('returns a 1-based line number', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 2)).toBe(2);
  });
});

describe('splitFrontmatter', () => {
  it('parses a YAML mapping and returns the body offset', () => {
    const t = '---\nprefix: ORDER\nretired: [REQ-ORDER-010]\n---\n# order\n';
    const fm = splitFrontmatter(t);
    expect(fm.error).toBeNull();
    expect(fm.data).toEqual({ prefix: 'ORDER', retired: ['REQ-ORDER-010'] });
    expect(t.slice(fm.bodyOffset)).toBe('# order\n');
  });

  it('returns empty data when there is no frontmatter', () => {
    expect(splitFrontmatter('# x\n')).toEqual({ data: {}, bodyOffset: 0, error: null });
  });

  it('reports an unterminated frontmatter', () => {
    expect(splitFrontmatter('---\nprefix: X\n# x\n').error).toBe('unterminated frontmatter');
  });

  it('reports a non-mapping frontmatter', () => {
    expect(splitFrontmatter('---\n- a\n---\n').error).toBe('frontmatter must be a YAML mapping');
  });
});

describe('headingBlocks', () => {
  const text = [
    '# cap',
    '',
    '## Requirements',
    '',
    '### Requirement: REQ-ORDER-001 注文の作成',
    'body',
    '',
    '#### Scenario: 成功',
    '- **GIVEN** x',
    '',
    '```md',
    '### Requirement: REQ-ORDER-999 fake',
    '```',
    '',
    '### Requirement: REQ-ORDER-002 Second',
    'b2',
    '',
    '## Other',
    'o',
    '',
  ].join('\n');
  const blocks = headingBlocks(text);

  it('finds headings outside code fences only', () => {
    expect(blocks.map((b) => `${b.depth}:${b.text}`)).toEqual([
      '1:cap',
      '2:Requirements',
      '3:Requirement: REQ-ORDER-001 注文の作成',
      '4:Scenario: 成功',
      '3:Requirement: REQ-ORDER-002 Second',
      '2:Other',
    ]);
  });

  it('ends a block at the next heading of the same or higher level (multi-byte safe)', () => {
    const r1 = blocks[2]!;
    const slice = text.slice(r1.start, r1.end);
    expect(slice.startsWith('### Requirement: REQ-ORDER-001 注文の作成\n')).toBe(true);
    expect(slice).toContain('fake');
    expect(text.slice(r1.end).startsWith('### Requirement: REQ-ORDER-002')).toBe(true);
    expect(text.slice(r1.contentStart).startsWith('body\n')).toBe(true);
    expect(r1.line).toBe(5);
  });

  it('lists direct children of a given depth', () => {
    expect(childBlocks(blocks, blocks[1]!, 3).map((b) => b.text)).toEqual([
      'Requirement: REQ-ORDER-001 注文の作成',
      'Requirement: REQ-ORDER-002 Second',
    ]);
  });

  it('parses from an offset (after frontmatter) with absolute positions', () => {
    const t = '---\na: 1\n---\n## X\n';
    const fm = splitFrontmatter(t);
    const bs = headingBlocks(t, fm.bodyOffset);
    expect(bs).toHaveLength(1);
    expect(bs[0]!.start).toBe(fm.bodyOffset);
    expect(bs[0]!.line).toBe(4);
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/markdown.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/markdown/text.ts`：

```ts
export function normalizeText(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
```

`src/core/markdown/frontmatter.ts`：

```ts
import { parse as parseYaml } from 'yaml';

export interface Frontmatter {
  data: Record<string, unknown>;
  bodyOffset: number;
  error: string | null;
}

export function splitFrontmatter(text: string): Frontmatter {
  if (!text.startsWith('---\n')) return { data: {}, bodyOffset: 0, error: null };
  const closing = /^---[ \t]*$/gm;
  closing.lastIndex = 4;
  const m = closing.exec(text);
  if (!m) return { data: {}, bodyOffset: 0, error: 'unterminated frontmatter' };
  const end = m.index + m[0].length;
  const bodyOffset = text[end] === '\n' ? end + 1 : end;
  const yamlText = text.slice(4, m.index);
  try {
    const parsed: unknown = yamlText.trim() === '' ? {} : parseYaml(yamlText);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, bodyOffset, error: 'frontmatter must be a YAML mapping' };
    }
    return { data: parsed as Record<string, unknown>, bodyOffset, error: null };
  } catch (e) {
    return { data: {}, bodyOffset, error: (e as Error).message };
  }
}
```

`src/core/markdown/blocks.ts`：

```ts
import type { Heading } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';
import { lineOf } from './text.js';

export interface HeadingBlock {
  depth: number;
  text: string;
  start: number;
  contentStart: number;
  end: number;
  line: number;
}

/** Top-level ATX/setext headings of `text.slice(from)`, with offsets absolute to `text`. */
export function headingBlocks(text: string, from = 0): HeadingBlock[] {
  const tree = fromMarkdown(text.slice(from));
  const headings = tree.children.filter((n): n is Heading => n.type === 'heading');
  const blocks: HeadingBlock[] = headings.map((h) => {
    const start = from + (h.position?.start.offset ?? 0);
    const headingEnd = from + (h.position?.end.offset ?? 0);
    const contentStart = text[headingEnd] === '\n' ? headingEnd + 1 : headingEnd;
    return { depth: h.depth, text: toString(h).trim(), start, contentStart, end: text.length, line: lineOf(text, start) };
  });
  blocks.forEach((b, i) => {
    const next = blocks.slice(i + 1).find((o) => o.depth <= b.depth);
    if (next) b.end = next.start;
  });
  return blocks;
}

export function childBlocks(blocks: HeadingBlock[], parent: HeadingBlock, depth: number): HeadingBlock[] {
  return blocks.filter((b) => b.depth === depth && b.start >= parent.contentStart && b.start < parent.end);
}
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/markdown.test.ts`
Expected: PASS（10テスト）

- [ ] **Step 5: コミットする**

```bash
git add src/core/markdown test/core/markdown.test.ts
git commit -m "feat(core): markdown text normalization, frontmatter and heading blocks"
```

---

### Task 3: 要件IDと正本の仕様の解析

**Files:**
- Create: `src/core/spec/model.ts`、`src/core/spec/ids.ts`、`src/core/spec/parse-spec.ts`
- Create: `test/helpers/fixtures.ts`
- Test: `test/core/spec/ids.test.ts`、`test/core/spec/parse-spec.test.ts`

**Interfaces:**
- Consumes：Task 2 の `splitFrontmatter`、`headingBlocks`、`childBlocks`、`HeadingBlock`
- Produces：
  - 型：`ScenarioStep`、`Scenario`、`Requirement { id; title; body; block; scenarios; decisionRefs; start; end; line }`、`Section { heading; content; start; end; line }`、`Capability { name; prefix; retired; purpose; sections; requirements; hasRequirementsHeading }`、`Removal`、`Delta`
  - `REQ_ID_RE`、`DECISION_REF_RE`（`/\bD-\d+\b/g`）
  - `isRequirementId(id)`、`prefixOf(id)`
  - `parseRequirementHeading(text): { id; title } | null`
  - `nextRequirementId(prefix, used): string`
  - `defaultPrefix(capability): string`
  - `parseSteps(segment)`、`parseRequirementAt(text, blocks, h)`、`toSection(text, b, heading?)`
  - `parseSpec(text, name, file): { capability: Capability; diagnostics: Diagnostic[] }`
  - テスト用の `ORDER_SPEC`、`CONFIG_YAML`、`metaYaml(id)`（`test/helpers/fixtures.ts`）

- [ ] **Step 1: 共通のフィクスチャを書く**

`test/helpers/fixtures.ts`：

````ts
export const CONFIG_YAML = 'version: 1\nlanguage: en\n';

export const metaYaml = (id: string): string =>
  `schema: comb.change/v1\nid: ${id}\ncreated: 2026-10-06\nbase: {}\n`;

export const ORDER_SPEC = `---
prefix: ORDER
retired: [REQ-ORDER-010]
---
# order-lifecycle

## Purpose
注文のライフサイクル。

## Conventions
金額は整数円。

## Requirements

### Requirement: REQ-ORDER-001 注文の作成
The system MUST create an order (D-021).

#### Scenario: 成功
- **GIVEN** an on-sale listing
- **WHEN** the buyer taps "Buy"
- **THEN** an order is created
- **AND** the listing is reserved

\`\`\`md
### Requirement: REQ-ORDER-999 example inside a fence
\`\`\`

### Requirement: REQ-ORDER-002 Payment
Pay within 3 days.

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid
`;
````

- [ ] **Step 2: 失敗するテストを書く**

`test/core/spec/ids.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  defaultPrefix,
  isRequirementId,
  nextRequirementId,
  parseRequirementHeading,
  prefixOf,
} from '../../../src/core/spec/ids.js';

describe('requirement ids', () => {
  it('validates the REQ-<PREFIX>-<NNN> format', () => {
    expect(isRequirementId('REQ-ORDER-001')).toBe(true);
    expect(isRequirementId('REQ-A2-1234')).toBe(true);
    expect(isRequirementId('REQ-order-001')).toBe(false);
    expect(isRequirementId('REQ-ORDER-01')).toBe(false);
    expect(prefixOf('REQ-ORDER-001')).toBe('ORDER');
    expect(prefixOf('nope')).toBeNull();
  });

  it('parses requirement headings', () => {
    expect(parseRequirementHeading('Requirement: REQ-ORDER-001 注文の作成')).toEqual({ id: 'REQ-ORDER-001', title: '注文の作成' });
    expect(parseRequirementHeading('Requirement: REQ-ORDER-010')).toEqual({ id: 'REQ-ORDER-010', title: '' });
    expect(parseRequirementHeading('Requirement:')).toEqual({ id: '', title: '' });
    expect(parseRequirementHeading('Scenario: x')).toBeNull();
  });

  it('computes the next id from used ids of the same prefix', () => {
    expect(nextRequirementId('ORDER', ['REQ-ORDER-001', 'REQ-ORDER-010', 'REQ-PAY-099'])).toBe('REQ-ORDER-011');
    expect(nextRequirementId('PAY', [])).toBe('REQ-PAY-001');
  });

  it('derives a default prefix from the capability name', () => {
    expect(defaultPrefix('order-lifecycle')).toBe('ORDER');
    expect(defaultPrefix('2fa-login')).toBe('C2FA');
  });
});
```

`test/core/spec/parse-spec.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../../src/core/spec/parse-spec.js';
import { ORDER_SPEC } from '../../helpers/fixtures.js';

describe('parseSpec', () => {
  const { capability, diagnostics } = parseSpec(ORDER_SPEC, 'order-lifecycle', 'comb/specs/order-lifecycle/spec.md');

  it('reads frontmatter, purpose and sections', () => {
    expect(diagnostics).toEqual([]);
    expect(capability.prefix).toBe('ORDER');
    expect(capability.retired).toEqual(['REQ-ORDER-010']);
    expect(capability.purpose).toBe('注文のライフサイクル。');
    expect(capability.sections.map((s) => s.heading)).toEqual(['Purpose', 'Conventions']);
    expect(capability.hasRequirementsHeading).toBe(true);
  });

  it('reads requirements, ignoring headings inside code fences', () => {
    expect(capability.requirements.map((r) => r.id)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    const r1 = capability.requirements[0]!;
    expect(r1.title).toBe('注文の作成');
    expect(r1.body).toBe('The system MUST create an order (D-021).');
    expect(r1.decisionRefs).toEqual(['D-021']);
    expect(r1.block.startsWith('### Requirement: REQ-ORDER-001 注文の作成\n')).toBe(true);
    expect(ORDER_SPEC.slice(r1.start, r1.end)).toBe(r1.block);
  });

  it('reads scenarios and their steps', () => {
    const s = capability.requirements[0]!.scenarios[0]!;
    expect(s.name).toBe('成功');
    expect(s.steps.map((x) => x.keyword)).toEqual(['GIVEN', 'WHEN', 'THEN', 'AND']);
    expect(s.steps[1]!.text).toBe('the buyer taps "Buy"');
  });

  it('reports headings under Requirements that are not requirements', () => {
    const r = parseSpec('---\nprefix: X\n---\n## Requirements\n\n### Not a requirement\n', 'x', 'f.md');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SPEC_PARSE']);
    expect(r.diagnostics[0]!.target).toEqual({ file: 'f.md', line: 6 });
  });

  it('reports a broken frontmatter', () => {
    const r = parseSpec('---\nprefix: X\n## Requirements\n', 'x', 'f.md');
    expect(r.diagnostics[0]!.code).toBe('SPEC_PARSE');
  });
});
```

- [ ] **Step 3: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/spec`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 4: 実装する**

`src/core/spec/model.ts`：

```ts
export interface ScenarioStep {
  keyword: 'GIVEN' | 'WHEN' | 'THEN' | 'AND';
  text: string;
}

export interface Scenario {
  name: string;
  steps: ScenarioStep[];
}

export interface Requirement {
  id: string;
  title: string;
  body: string;
  block: string;
  scenarios: Scenario[];
  decisionRefs: string[];
  start: number;
  end: number;
  line: number;
}

export interface Section {
  heading: string;
  content: string;
  start: number;
  end: number;
  line: number;
}

export interface Capability {
  name: string;
  prefix: string | null;
  retired: string[];
  purpose: string | null;
  sections: Section[];
  requirements: Requirement[];
  hasRequirementsHeading: boolean;
}

export interface Removal {
  id: string;
  reason: string | null;
  migration: string | null;
  line: number;
}

export interface Delta {
  capability: string;
  prefix: string | null;
  purpose: string | null;
  added: Requirement[];
  modified: Requirement[];
  removed: Removal[];
  addedSections: Section[];
  modifiedSections: Section[];
}
```

`src/core/spec/ids.ts`：

```ts
export const REQ_ID_RE = /^REQ-([A-Z][A-Z0-9]*)-(\d{3,})$/;
export const DECISION_REF_RE = /\bD-\d+\b/g;

export const isRequirementId = (id: string): boolean => REQ_ID_RE.test(id);

export function prefixOf(id: string): string | null {
  const m = REQ_ID_RE.exec(id);
  return m ? (m[1] as string) : null;
}

export function parseRequirementHeading(text: string): { id: string; title: string } | null {
  const m = /^Requirement:\s*(\S+)?\s*(.*)$/.exec(text);
  if (!m) return null;
  return { id: m[1] ?? '', title: (m[2] ?? '').trim() };
}

export function nextRequirementId(prefix: string, used: Iterable<string>): string {
  let max = 0;
  for (const id of used) {
    const m = REQ_ID_RE.exec(id);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `REQ-${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function defaultPrefix(capability: string): string {
  const first = (capability.split('-')[0] ?? capability).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]/.test(first) ? first : `C${first}`;
}
```

`src/core/spec/parse-spec.ts`：

```ts
import { diag, type Diagnostic } from '../diagnostics.js';
import { childBlocks, headingBlocks, type HeadingBlock } from '../markdown/blocks.js';
import { splitFrontmatter } from '../markdown/frontmatter.js';
import { DECISION_REF_RE, parseRequirementHeading } from './ids.js';
import type { Capability, Requirement, Scenario, ScenarioStep, Section } from './model.js';

const STEP_RE = /^\s*[-*]\s+\*\*(GIVEN|WHEN|THEN|AND)\*\*\s*(.*)$/;

export function parseSteps(segment: string): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  for (const line of segment.split('\n')) {
    const m = STEP_RE.exec(line);
    if (m) steps.push({ keyword: m[1] as ScenarioStep['keyword'], text: (m[2] ?? '').trim() });
  }
  return steps;
}

export function parseRequirementAt(text: string, blocks: HeadingBlock[], h: HeadingBlock): Requirement {
  const head = parseRequirementHeading(h.text) ?? { id: '', title: '' };
  const scenarioHeads = childBlocks(blocks, h, 4).filter((b) => b.text.startsWith('Scenario:'));
  const bodyEnd = scenarioHeads[0]?.start ?? h.end;
  const scenarios: Scenario[] = scenarioHeads.map((s) => ({
    name: s.text.replace(/^Scenario:\s*/, '').trim(),
    steps: parseSteps(text.slice(s.contentStart, s.end)),
  }));
  const block = text.slice(h.start, h.end);
  const decisionRefs = [...new Set([...block.matchAll(DECISION_REF_RE)].map((m) => m[0]))];
  return {
    id: head.id,
    title: head.title,
    body: text.slice(h.contentStart, bodyEnd).trim(),
    block,
    scenarios,
    decisionRefs,
    start: h.start,
    end: h.end,
    line: h.line,
  };
}

export function toSection(text: string, b: HeadingBlock, heading: string = b.text): Section {
  return { heading, content: text.slice(b.contentStart, b.end).trim(), start: b.start, end: b.end, line: b.line };
}

export function parseSpec(
  text: string,
  name: string,
  file: string,
): { capability: Capability; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const fm = splitFrontmatter(text);
  if (fm.error) diagnostics.push(diag('error', 'SPEC_PARSE', `frontmatter: ${fm.error}`, { file, line: 1 }));
  const prefix = typeof fm.data.prefix === 'string' ? fm.data.prefix : null;
  const retired = Array.isArray(fm.data.retired)
    ? fm.data.retired.filter((x): x is string => typeof x === 'string')
    : [];
  const blocks = headingBlocks(text, fm.bodyOffset);
  const reqHeading = blocks.find((b) => b.depth === 2 && b.text === 'Requirements') ?? null;
  const requirements: Requirement[] = [];
  if (reqHeading) {
    for (const h of childBlocks(blocks, reqHeading, 3)) {
      if (!h.text.startsWith('Requirement:')) {
        diagnostics.push(
          diag('error', 'SPEC_PARSE', `unexpected heading under Requirements: "${h.text}"`, { file, line: h.line },
            'Use "### Requirement: REQ-<PREFIX>-<NNN> <title>"'),
        );
        continue;
      }
      requirements.push(parseRequirementAt(text, blocks, h));
    }
  }
  const sections = blocks.filter((b) => b.depth === 2 && b !== reqHeading).map((b) => toSection(text, b));
  const purpose = sections.find((s) => s.heading === 'Purpose')?.content ?? null;
  return {
    capability: { name, prefix, retired, purpose, sections, requirements, hasRequirementsHeading: reqHeading !== null },
    diagnostics,
  };
}
```

- [ ] **Step 5: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/spec`
Expected: PASS（9テスト）

- [ ] **Step 6: コミットする**

```bash
git add src/core/spec test/core/spec test/helpers
git commit -m "feat(core): parse canonical specs with stable requirement ids"
```

---

### Task 4: delta の解析

**Files:**
- Create: `src/core/spec/parse-delta.ts`
- Test: `test/core/spec/parse-delta.test.ts`

**Interfaces:**
- Consumes：Task 3 の `parseRequirementAt`、`toSection`、`parseRequirementHeading`、`Delta`
- Produces：`DELTA_HEADINGS: readonly string[]`、`parseDelta(text, capability, file): { delta: Delta; diagnostics: Diagnostic[] }`

- [ ] **Step 1: 失敗するテストを書く**

`test/core/spec/parse-delta.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';

const DELTA = `## ADDED Requirements

### Requirement: REQ-ORDER-003 Auto-cancel
Cancel unpaid orders after 3 days.

#### Scenario: Expired
- **GIVEN** an unpaid order
- **WHEN** 3 days pass
- **THEN** the order is cancelled

## MODIFIED Requirements

### Requirement: REQ-ORDER-002 Payment (revised)
Pay within 2 days.

#### Scenario: Paid in time
- **GIVEN** an unpaid order
- **WHEN** payment arrives
- **THEN** the order is paid

## REMOVED Requirements

### Requirement: REQ-ORDER-001
**Reason:** replaced by REQ-ORDER-003
**Migration:** none

## MODIFIED Sections

### Section: Conventions
金額は税込の整数円。

## ADDED Sections

### Section: Timers
| Timer | Duration |
`;

describe('parseDelta', () => {
  it('reads every delta section', () => {
    const { delta, diagnostics } = parseDelta(DELTA, 'order-lifecycle', 'd.md');
    expect(diagnostics).toEqual([]);
    expect(delta.prefix).toBeNull();
    expect(delta.added.map((r) => r.id)).toEqual(['REQ-ORDER-003']);
    expect(delta.modified.map((r) => [r.id, r.title])).toEqual([['REQ-ORDER-002', 'Payment (revised)']]);
    expect(delta.modified[0]!.scenarios.map((s) => s.name)).toEqual(['Paid in time']);
    expect(delta.removed).toEqual([{ id: 'REQ-ORDER-001', reason: 'replaced by REQ-ORDER-003', migration: 'none', line: 23 }]);
    expect(delta.modifiedSections.map((s) => [s.heading, s.content])).toEqual([['Conventions', '金額は税込の整数円。']]);
    expect(delta.addedSections.map((s) => s.heading)).toEqual(['Timers']);
  });

  it('reads prefix and purpose for a new capability', () => {
    const text = '---\nprefix: PAY\n---\n## Purpose\n支払い。\n\n## ADDED Requirements\n';
    const { delta } = parseDelta(text, 'payment', 'd.md');
    expect(delta.prefix).toBe('PAY');
    expect(delta.purpose).toBe('支払い。');
  });

  it('reports unknown sections and malformed headings', () => {
    const text = '## RENAMED Requirements\n\n## ADDED Requirements\n\n### Foo\n\n## ADDED Sections\n\n### Bar\n';
    const { diagnostics } = parseDelta(text, 'x', 'd.md');
    expect(diagnostics.map((d) => [d.code, d.target?.line])).toEqual([
      ['SPEC_PARSE', 1],
      ['SPEC_PARSE', 5],
      ['SPEC_PARSE', 9],
    ]);
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/spec/parse-delta.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/spec/parse-delta.ts`：

```ts
import { diag, type Diagnostic } from '../diagnostics.js';
import { childBlocks, headingBlocks, type HeadingBlock } from '../markdown/blocks.js';
import { splitFrontmatter } from '../markdown/frontmatter.js';
import { parseRequirementHeading } from './ids.js';
import type { Delta } from './model.js';
import { parseRequirementAt, toSection } from './parse-spec.js';

export const DELTA_HEADINGS = [
  'Purpose',
  'ADDED Requirements',
  'MODIFIED Requirements',
  'REMOVED Requirements',
  'ADDED Sections',
  'MODIFIED Sections',
] as const;

const KNOWN = new Set<string>(DELTA_HEADINGS);

function field(segment: string, name: string): string | null {
  const m = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`).exec(segment);
  return m ? (m[1] as string).trim() : null;
}

export function parseDelta(text: string, capability: string, file: string): { delta: Delta; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const fm = splitFrontmatter(text);
  if (fm.error) diagnostics.push(diag('error', 'SPEC_PARSE', `frontmatter: ${fm.error}`, { file, line: 1 }));
  const delta: Delta = {
    capability,
    prefix: typeof fm.data.prefix === 'string' ? fm.data.prefix : null,
    purpose: null,
    added: [],
    modified: [],
    removed: [],
    addedSections: [],
    modifiedSections: [],
  };
  const blocks = headingBlocks(text, fm.bodyOffset);
  const bad = (h: HeadingBlock, expected: string): void => {
    diagnostics.push(diag('error', 'SPEC_PARSE', `unexpected heading "${h.text}"`, { file, line: h.line }, `Use "### ${expected}"`));
  };
  for (const top of blocks.filter((b) => b.depth === 2)) {
    if (!KNOWN.has(top.text)) {
      diagnostics.push(
        diag('error', 'SPEC_PARSE', `unknown delta section "${top.text}"`, { file, line: top.line },
          `Use one of: ${DELTA_HEADINGS.join(', ')}`),
      );
      continue;
    }
    if (top.text === 'Purpose') {
      delta.purpose = text.slice(top.contentStart, top.end).trim();
      continue;
    }
    for (const h of childBlocks(blocks, top, 3)) {
      if (top.text.endsWith('Sections')) {
        if (!h.text.startsWith('Section:')) {
          bad(h, 'Section: <heading>');
          continue;
        }
        const section = toSection(text, h, h.text.replace(/^Section:\s*/, '').trim());
        (top.text === 'ADDED Sections' ? delta.addedSections : delta.modifiedSections).push(section);
        continue;
      }
      if (!h.text.startsWith('Requirement:')) {
        bad(h, 'Requirement: REQ-<PREFIX>-<NNN> <title>');
        continue;
      }
      if (top.text === 'REMOVED Requirements') {
        const segment = text.slice(h.contentStart, h.end);
        delta.removed.push({
          id: parseRequirementHeading(h.text)?.id ?? '',
          reason: field(segment, 'Reason'),
          migration: field(segment, 'Migration'),
          line: h.line,
        });
      } else {
        (top.text === 'ADDED Requirements' ? delta.added : delta.modified).push(parseRequirementAt(text, blocks, h));
      }
    }
  }
  return { delta, diagnostics };
}
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/spec/parse-delta.test.ts`
Expected: PASS（3テスト）

- [ ] **Step 5: コミットする**

```bash
git add src/core/spec/parse-delta.ts test/core/spec/parse-delta.test.ts
git commit -m "feat(core): parse spec deltas addressed by requirement id"
```

---

### Task 5: 仕様と delta の検査

**Files:**
- Create: `src/core/spec/validate-spec.ts`
- Test: `test/core/spec/validate-spec.test.ts`

**Interfaces:**
- Consumes：`Capability`、`Delta`、`Requirement`、`isRequirementId`、`prefixOf`、`parseSpec`、`parseDelta`
- Produces：
  - `checkRequirementShape(r, prefix, file): Diagnostic[]`
  - `validateCapability(cap, file): Diagnostic[]`
  - `validateDelta(delta, base: Capability | null, file, otherAdded: ReadonlySet<string>): Diagnostic[]`
  - 使う診断コード：`SPEC_PARSE`、`REQ_ID_FORMAT`、`REQ_ID_PREFIX`、`REQ_ID_DUPLICATE`、`REQ_ID_RETIRED`、`REQ_NO_SCENARIO`、`DELTA_EMPTY`、`DELTA_TARGET_MISSING`、`DELTA_ID_EXISTS`、`DELTA_CONFLICT`、`REMOVED_NO_REASON`、`SCENARIO_DROPPED`（warning）

- [ ] **Step 1: 失敗するテストを書く**

`test/core/spec/validate-spec.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { parseSpec } from '../../../src/core/spec/parse-spec.js';
import { validateCapability, validateDelta } from '../../../src/core/spec/validate-spec.js';
import { ORDER_SPEC } from '../../helpers/fixtures.js';

const base = parseSpec(ORDER_SPEC, 'order-lifecycle', 'spec.md').capability;
const codes = (ds: { code: string }[]): string[] => ds.map((d) => d.code).sort();
const delta = (text: string, cap = 'order-lifecycle') => parseDelta(text, cap, 'd.md').delta;

describe('validateCapability', () => {
  it('accepts a well-formed spec', () => {
    expect(validateCapability(base, 'spec.md')).toEqual([]);
  });

  it('reports id, prefix, scenario, duplicate and retired problems', () => {
    const text = `---
prefix: ORDER
retired: [REQ-ORDER-010]
---
## Requirements

### Requirement: REQ-order-1 bad id
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-PAY-001 wrong prefix
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-ORDER-002 no scenario
x

### Requirement: REQ-ORDER-002 duplicate
x

#### Scenario: s
- **GIVEN** a

### Requirement: REQ-ORDER-010 reused
x

#### Scenario: s
- **GIVEN** a
`;
    const cap = parseSpec(text, 'order-lifecycle', 'spec.md').capability;
    expect(codes(validateCapability(cap, 'spec.md'))).toEqual(
      ['REQ_ID_DUPLICATE', 'REQ_ID_FORMAT', 'REQ_ID_PREFIX', 'REQ_ID_RETIRED', 'REQ_NO_SCENARIO'].sort(),
    );
  });

  it('requires a prefix and a Requirements section', () => {
    const cap = parseSpec('# x\n', 'x', 'spec.md').capability;
    expect(codes(validateCapability(cap, 'spec.md'))).toEqual(['SPEC_PARSE', 'SPEC_PARSE']);
  });
});

describe('validateDelta', () => {
  const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';

  it('accepts a valid delta', () => {
    const d = delta(`## ADDED Requirements\n\n### Requirement: REQ-ORDER-003 New\nx\n${scenario}`);
    expect(validateDelta(d, base, 'd.md', new Set())).toEqual([]);
  });

  it('reports an empty delta', () => {
    expect(codes(validateDelta(delta('## ADDED Requirements\n'), base, 'd.md', new Set()))).toEqual(['DELTA_EMPTY']);
  });

  it('rejects ADDED ids that exist, are retired or are added elsewhere', () => {
    const d = delta(
      `## ADDED Requirements\n\n### Requirement: REQ-ORDER-001 Dup\nx\n${scenario}\n### Requirement: REQ-ORDER-010 Retired\nx\n${scenario}\n### Requirement: REQ-ORDER-004 Other\nx\n${scenario}`,
    );
    expect(codes(validateDelta(d, base, 'd.md', new Set(['REQ-ORDER-004'])))).toEqual(
      ['DELTA_ID_EXISTS', 'REQ_ID_DUPLICATE', 'REQ_ID_RETIRED'].sort(),
    );
  });

  it('rejects MODIFIED/REMOVED targets that do not exist and REMOVED without reason', () => {
    const d = delta(
      `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-050 Ghost\nx\n${scenario}\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-051\n`,
    );
    expect(codes(validateDelta(d, base, 'd.md', new Set()))).toEqual(
      ['DELTA_TARGET_MISSING', 'DELTA_TARGET_MISSING', 'REMOVED_NO_REASON'].sort(),
    );
  });

  it('warns when MODIFIED drops a scenario and errors on conflicting sections', () => {
    const d = delta(
      `## MODIFIED Requirements\n\n### Requirement: REQ-ORDER-001 Changed\nx\n\n#### Scenario: other\n- **GIVEN** a\n\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-001\n**Reason:** r\n`,
    );
    const ds = validateDelta(d, base, 'd.md', new Set());
    expect(codes(ds)).toEqual(['DELTA_CONFLICT', 'SCENARIO_DROPPED']);
    expect(ds.find((x) => x.code === 'SCENARIO_DROPPED')!.severity).toBe('warning');
  });

  it('checks sections against the base', () => {
    const d = delta('## MODIFIED Sections\n\n### Section: Nope\nx\n\n## ADDED Sections\n\n### Section: Conventions\ny\n');
    expect(codes(validateDelta(d, base, 'd.md', new Set()))).toEqual(['DELTA_ID_EXISTS', 'DELTA_TARGET_MISSING']);
  });

  it('requires prefix and purpose for a new capability', () => {
    const d = delta(`## ADDED Requirements\n\n### Requirement: REQ-PAY-001 New\nx\n${scenario}`, 'payment');
    expect(codes(validateDelta(d, null, 'd.md', new Set()))).toEqual(['SPEC_PARSE', 'SPEC_PARSE']);
    const ok = delta(`---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 New\nx\n${scenario}`, 'payment');
    expect(validateDelta(ok, null, 'd.md', new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/spec/validate-spec.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/spec/validate-spec.ts`：

```ts
import { diag, type Diagnostic } from '../diagnostics.js';
import { isRequirementId, prefixOf } from './ids.js';
import type { Capability, Delta, Requirement } from './model.js';

export function checkRequirementShape(r: Requirement, prefix: string | null, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const target = { file, line: r.line, ...(r.id ? { id: r.id } : {}) };
  if (!isRequirementId(r.id)) {
    out.push(diag('error', 'REQ_ID_FORMAT', `invalid requirement id "${r.id}"`, target, 'Use REQ-<PREFIX>-<NNN>, e.g. REQ-ORDER-001'));
  } else if (prefix && prefixOf(r.id) !== prefix) {
    out.push(diag('error', 'REQ_ID_PREFIX', `id "${r.id}" does not use prefix ${prefix}`, target));
  }
  if (r.title === '') out.push(diag('error', 'SPEC_PARSE', 'requirement has no title', target));
  if (r.scenarios.length === 0) {
    out.push(diag('error', 'REQ_NO_SCENARIO', `${r.id || 'requirement'} has no scenario`, target, 'Add at least one "#### Scenario: <name>"'));
  }
  return out;
}

export function validateCapability(cap: Capability, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!cap.prefix) out.push(diag('error', 'SPEC_PARSE', 'frontmatter "prefix" is required', { file, line: 1 }, 'Add "prefix: <PREFIX>"'));
  if (!cap.hasRequirementsHeading) out.push(diag('error', 'SPEC_PARSE', 'missing "## Requirements" section', { file }));
  const seen = new Set<string>();
  for (const r of cap.requirements) {
    out.push(...checkRequirementShape(r, cap.prefix, file));
    const target = { file, line: r.line, id: r.id };
    if (seen.has(r.id)) out.push(diag('error', 'REQ_ID_DUPLICATE', `duplicate id ${r.id}`, target));
    seen.add(r.id);
    if (cap.retired.includes(r.id)) out.push(diag('error', 'REQ_ID_RETIRED', `${r.id} was retired and must not be reused`, target));
  }
  return out;
}

export function validateDelta(
  delta: Delta,
  base: Capability | null,
  file: string,
  otherAdded: ReadonlySet<string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const prefix = base?.prefix ?? delta.prefix;
  const changeCount =
    delta.added.length + delta.modified.length + delta.removed.length + delta.addedSections.length + delta.modifiedSections.length;
  if (changeCount === 0) out.push(diag('error', 'DELTA_EMPTY', 'delta has no changes', { file }));
  if (!base) {
    if (!delta.prefix) out.push(diag('error', 'SPEC_PARSE', `new capability "${delta.capability}" needs "prefix" in frontmatter`, { file, line: 1 }));
    if (!delta.purpose) out.push(diag('error', 'SPEC_PARSE', `new capability "${delta.capability}" needs "## Purpose"`, { file }));
  }
  const baseReqs = new Map((base?.requirements ?? []).map((r) => [r.id, r]));
  const retired = new Set(base?.retired ?? []);
  const where = new Map<string, string[]>();
  const note = (id: string, kind: string): void => {
    where.set(id, [...(where.get(id) ?? []), kind]);
  };

  for (const r of delta.added) {
    note(r.id, 'ADDED');
    out.push(...checkRequirementShape(r, prefix, file));
    const t = { file, line: r.line, id: r.id };
    if (baseReqs.has(r.id)) out.push(diag('error', 'DELTA_ID_EXISTS', `${r.id} already exists`, t, 'Use MODIFIED, or take the next free id'));
    if (retired.has(r.id)) out.push(diag('error', 'REQ_ID_RETIRED', `${r.id} was retired`, t));
    if (otherAdded.has(r.id)) out.push(diag('error', 'REQ_ID_DUPLICATE', `${r.id} is also added by another delta or change`, t));
  }
  for (const r of delta.modified) {
    note(r.id, 'MODIFIED');
    out.push(...checkRequirementShape(r, prefix, file));
    const t = { file, line: r.line, id: r.id };
    const old = baseReqs.get(r.id);
    if (!old) {
      out.push(diag('error', 'DELTA_TARGET_MISSING', `${r.id} does not exist in the current spec`, t, 'Use ADDED for new requirements'));
      continue;
    }
    const kept = new Set(r.scenarios.map((s) => s.name));
    const dropped = old.scenarios.map((s) => s.name).filter((n) => !kept.has(n));
    if (dropped.length > 0) {
      out.push(diag('warning', 'SCENARIO_DROPPED', `${r.id} drops scenarios: ${dropped.join(', ')}`, t,
        'MODIFIED must contain the whole requirement, including unchanged scenarios'));
    }
  }
  for (const x of delta.removed) {
    note(x.id, 'REMOVED');
    const t = { file, line: x.line, id: x.id };
    if (!baseReqs.has(x.id)) out.push(diag('error', 'DELTA_TARGET_MISSING', `${x.id} does not exist in the current spec`, t));
    if (!x.reason) out.push(diag('error', 'REMOVED_NO_REASON', `${x.id} needs **Reason:**`, t));
  }
  for (const [id, kinds] of where) {
    if (kinds.length > 1) out.push(diag('error', 'DELTA_CONFLICT', `${id} appears in ${kinds.join(' and ')}`, { file, id }));
  }
  const baseSections = new Set((base?.sections ?? []).map((s) => s.heading));
  for (const s of delta.modifiedSections) {
    if (!baseSections.has(s.heading)) out.push(diag('error', 'DELTA_TARGET_MISSING', `section "${s.heading}" does not exist`, { file, line: s.line }));
  }
  for (const s of delta.addedSections) {
    if (baseSections.has(s.heading)) out.push(diag('error', 'DELTA_ID_EXISTS', `section "${s.heading}" already exists`, { file, line: s.line }));
  }
  return out;
}
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/spec`
Expected: PASS（Task 3〜5 の全テスト）

- [ ] **Step 5: コミットする**

```bash
git add src/core/spec/validate-spec.ts test/core/spec/validate-spec.test.ts
git commit -m "feat(core): validate specs and deltas"
```

---

### Task 6: 設定、パス、プロジェクトと change の読み込み

**Files:**
- Create: `src/core/project/config.ts`、`src/core/project/paths.ts`、`src/core/project/load.ts`
- Create: `test/helpers/project.ts`
- Test: `test/core/project/config.test.ts`、`test/core/project/load.test.ts`

**Interfaces:**
- Consumes：`parseSpec`、`parseDelta`、`normalizeText`、`diag`
- Produces：
  - `CombConfig { version: 1; language; agents; context; review: { lenses; batch }; rules }`、`DEFAULT_LENSES`、`defaultConfig(language?)`、`parseConfig(text, file)`、`renderConfig(c)`
  - `CHANGE_FILES`、`ChangeFileName`、`paths.{comb, config, decisions, specsDir, spec, changesDir, change, changeMeta, changeFile, delta, archiveDir}`、`rel(root, p)`
  - `readText(p)`、`readIfExists(p)`、`findRoot(cwd)`
  - `LoadedSpec { name; path; file; text; capability; diagnostics }`、`Project { root; config; specs: Map<string, LoadedSpec>; decisionsText; diagnostics }`、`loadProject(root)`
  - `ChangeMeta { schema; id; created; base }`、`LoadedDelta { capability; path; file; text; delta; diagnostics }`、`ChangeSnapshot { id; dir; meta; files; deltas; diagnostics }`
  - `listChangeIds(root)`、`loadChange(root, id)`、`loadAllChanges(root)`
  - テスト用の `makeProject(files): string`（一時ディレクトリにファイルを置いてルートを返す）

- [ ] **Step 1: テスト用のヘルパーを書く**

`test/helpers/project.ts`：

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'comb-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const p = join(root, relPath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/core/project/config.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { defaultConfig, parseConfig, renderConfig } from '../../../src/core/project/config.js';

describe('config', () => {
  it('round-trips the default config', () => {
    const { config, diagnostics } = parseConfig(renderConfig(defaultConfig('ja')), 'comb/config.yaml');
    expect(diagnostics).toEqual([]);
    expect(config).toEqual(defaultConfig('ja'));
  });

  it('fills defaults for omitted keys', () => {
    const { config } = parseConfig('version: 1\nlanguage: ja\n', 'c');
    expect(config.review).toEqual({ lenses: ['consistency', 'formalization', 'edge-cases', 'change-impact'], batch: 3 });
  });

  it('reports invalid values', () => {
    const { diagnostics } = parseConfig(
      `version: 2\nlanguage: 3\nreview:\n  lenses: [nope]\n  batch: 0\nrules:\n  delta: x\ncontext: "${'a'.repeat(16 * 1024 + 1)}"\n`,
      'c',
    );
    expect(diagnostics.map((d) => d.code)).toEqual(Array(6).fill('CONFIG_INVALID'));
  });

  it('reports broken YAML', () => {
    expect(parseConfig('version: [', 'c').diagnostics[0]!.code).toBe('CONFIG_INVALID');
  });
});
```

`test/core/project/load.test.ts`：

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoot, listChangeIds, loadChange, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

describe('project loading', () => {
  it('finds the root from a nested directory', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    expect(findRoot(join(root, 'a', 'b'))).toBe(root);
  });

  it('returns null outside a project', () => {
    expect(findRoot(makeProject({ 'x.txt': '' }))).toBeNull();
  });

  it('loads specs (CRLF-normalized) and the decisions file', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC.replace(/\n/g, '\r\n'),
      'comb/specs/.gitkeep': '',
      'comb/decisions.md': '# Decisions\n',
    });
    const project = loadProject(root);
    expect(project.diagnostics).toEqual([]);
    expect([...project.specs.keys()]).toEqual(['order-lifecycle']);
    const spec = project.specs.get('order-lifecycle')!;
    expect(spec.file).toBe('comb/specs/order-lifecycle/spec.md');
    expect(spec.capability.requirements.map((r) => r.id)).toEqual(['REQ-ORDER-001', 'REQ-ORDER-002']);
    expect(project.decisionsText).toBe('# Decisions\n');
  });

  it('loads a change with its files and deltas', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/changes/add-x/.comb.yaml': metaYaml('add-x'),
      'comb/changes/add-x/proposal.md': '# Change: x\n',
      'comb/changes/add-x/specs/order-lifecycle/spec.md': '## ADDED Requirements\n',
      'comb/changes/archive/2026-01-01-old/.comb.yaml': metaYaml('old'),
    });
    expect(listChangeIds(root)).toEqual(['add-x']);
    const change = loadChange(root, 'add-x')!;
    expect(change.meta).toEqual({ schema: 'comb.change/v1', id: 'add-x', created: '2026-10-06', base: {} });
    expect(change.files.proposal).toBe('# Change: x\n');
    expect(change.files.tasks).toBeUndefined();
    expect(change.deltas.map((d) => [d.capability, d.file])).toEqual([
      ['order-lifecycle', 'comb/changes/add-x/specs/order-lifecycle/spec.md'],
    ]);
    expect(loadChange(root, 'nope')).toBeNull();
  });

  it('reports a missing or broken .comb.yaml', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/changes/a/proposal.md': 'x' });
    expect(loadChange(root, 'a')!.diagnostics.map((d) => d.code)).toEqual(['CHANGE_META_INVALID']);
    writeFileSync(join(root, 'comb/changes/a/.comb.yaml'), 'schema: wrong\n');
    expect(loadChange(root, 'a')!.diagnostics.map((d) => d.code)).toEqual(['CHANGE_META_INVALID']);
  });
});
```

- [ ] **Step 3: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/project`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 4: 実装する**

`src/core/project/config.ts`：

```ts
import { parse as parseYaml, stringify } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';

export interface CombConfig {
  version: 1;
  language: string;
  agents: string[];
  context: string;
  review: { lenses: string[]; batch: number };
  rules: Record<string, string[]>;
}

export const DEFAULT_LENSES = ['consistency', 'formalization', 'edge-cases', 'change-impact'];
export const MAX_CONTEXT_BYTES = 16 * 1024;

export function defaultConfig(language = 'en'): CombConfig {
  return {
    version: 1,
    language,
    agents: ['claude-code'],
    context: '',
    review: { lenses: [...DEFAULT_LENSES], batch: 3 },
    rules: {},
  };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function parseConfig(text: string, file: string): { config: CombConfig; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const bad = (message: string): void => {
    diagnostics.push(diag('error', 'CONFIG_INVALID', message, { file }));
  };
  const config = defaultConfig();
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (e) {
    bad(`invalid YAML: ${(e as Error).message}`);
    return { config, diagnostics };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    bad('config must be a YAML mapping');
    return { config, diagnostics };
  }
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) bad('"version" must be 1');
  if (r.language !== undefined) {
    if (typeof r.language === 'string') config.language = r.language;
    else bad('"language" must be a string');
  }
  if (r.agents !== undefined) {
    if (isStringArray(r.agents)) config.agents = r.agents;
    else bad('"agents" must be a list of strings');
  }
  if (r.context !== undefined) {
    if (typeof r.context !== 'string') bad('"context" must be a string');
    else if (Buffer.byteLength(r.context, 'utf8') > MAX_CONTEXT_BYTES) bad('"context" exceeds 16KB');
    else config.context = r.context;
  }
  if (r.review !== undefined) {
    const rv = r.review as Record<string, unknown>;
    if (rv.lenses !== undefined) {
      if (isStringArray(rv.lenses) && rv.lenses.every((l) => DEFAULT_LENSES.includes(l))) config.review.lenses = rv.lenses;
      else bad(`"review.lenses" must be a subset of ${DEFAULT_LENSES.join(', ')}`);
    }
    if (rv.batch !== undefined) {
      if (Number.isInteger(rv.batch) && (rv.batch as number) > 0) config.review.batch = rv.batch as number;
      else bad('"review.batch" must be a positive integer');
    }
  }
  if (r.rules !== undefined) {
    const entries = typeof r.rules === 'object' && r.rules !== null ? Object.entries(r.rules) : null;
    if (entries && entries.every(([, v]) => isStringArray(v))) config.rules = Object.fromEntries(entries) as Record<string, string[]>;
    else bad('"rules" must map artifact names to lists of strings');
  }
  return { config, diagnostics };
}

export function renderConfig(c: CombConfig): string {
  return `# Comb configuration (see docs/DESIGN.md §3.9)\n${stringify(c)}`;
}
```

`src/core/project/paths.ts`：

```ts
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
```

`src/core/project/load.ts`：

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import { normalizeText } from '../markdown/text.js';
import type { Capability, Delta } from '../spec/model.js';
import { parseDelta } from '../spec/parse-delta.js';
import { parseSpec } from '../spec/parse-spec.js';
import { defaultConfig, parseConfig, type CombConfig } from './config.js';
import { CHANGE_FILES, paths, rel, type ChangeFileName } from './paths.js';

export const readText = (p: string): string => normalizeText(readFileSync(p, 'utf8'));
export const readIfExists = (p: string): string | null => (existsSync(p) ? readText(p) : null);

export function findRoot(cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    if (existsSync(paths.config(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface LoadedSpec {
  name: string;
  path: string;
  file: string;
  text: string;
  capability: Capability;
  diagnostics: Diagnostic[];
}

export interface Project {
  root: string;
  config: CombConfig;
  specs: Map<string, LoadedSpec>;
  decisionsText: string | null;
  diagnostics: Diagnostic[];
}

const subdirs = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort() : [];

export function loadProject(root: string): Project {
  const cfgPath = paths.config(root);
  const { config, diagnostics } = existsSync(cfgPath)
    ? parseConfig(readText(cfgPath), rel(root, cfgPath))
    : { config: defaultConfig(), diagnostics: [diag('error', 'NOT_A_COMB_PROJECT', 'comb/config.yaml not found')] };
  const specs = new Map<string, LoadedSpec>();
  for (const name of subdirs(paths.specsDir(root))) {
    const p = paths.spec(root, name);
    if (!existsSync(p)) continue;
    const text = readText(p);
    const file = rel(root, p);
    const parsed = parseSpec(text, name, file);
    specs.set(name, { name, path: p, file, text, capability: parsed.capability, diagnostics: parsed.diagnostics });
  }
  return { root, config, specs, decisionsText: readIfExists(paths.decisions(root)), diagnostics };
}

export interface ChangeMeta {
  schema: 'comb.change/v1';
  id: string;
  created: string;
  base: Record<string, string>;
}

export interface LoadedDelta {
  capability: string;
  path: string;
  file: string;
  text: string;
  delta: Delta;
  diagnostics: Diagnostic[];
}

export interface ChangeSnapshot {
  id: string;
  dir: string;
  meta: ChangeMeta | null;
  files: Partial<Record<ChangeFileName, string>>;
  deltas: LoadedDelta[];
  diagnostics: Diagnostic[];
}

function parseMeta(text: string): ChangeMeta {
  const raw = parseYaml(text) as Record<string, unknown> | null;
  if (!raw || raw.schema !== 'comb.change/v1') throw new Error('schema must be comb.change/v1');
  if (typeof raw.id !== 'string' || typeof raw.created !== 'string') throw new Error('id and created are required');
  const base = (raw.base ?? {}) as Record<string, unknown>;
  if (typeof base !== 'object' || Object.values(base).some((v) => typeof v !== 'string')) {
    throw new Error('base must map requirement ids to hashes');
  }
  return { schema: 'comb.change/v1', id: raw.id, created: raw.created, base: base as Record<string, string> };
}

export const listChangeIds = (root: string): string[] => subdirs(paths.changesDir(root)).filter((n) => n !== 'archive');

export function loadChange(root: string, id: string): ChangeSnapshot | null {
  const dir = paths.change(root, id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const diagnostics: Diagnostic[] = [];
  const metaPath = paths.changeMeta(root, id);
  let meta: ChangeMeta | null = null;
  if (!existsSync(metaPath)) {
    diagnostics.push(diag('error', 'CHANGE_META_INVALID', '.comb.yaml is missing', { file: rel(root, metaPath) }, 'Create changes with "comb new change"'));
  } else {
    try {
      meta = parseMeta(readText(metaPath));
    } catch (e) {
      diagnostics.push(diag('error', 'CHANGE_META_INVALID', (e as Error).message, { file: rel(root, metaPath) }));
    }
  }
  const files: Partial<Record<ChangeFileName, string>> = {};
  for (const name of CHANGE_FILES) {
    const text = readIfExists(paths.changeFile(root, id, name));
    if (text !== null) files[name] = text;
  }
  const deltas: LoadedDelta[] = [];
  for (const cap of subdirs(join(dir, 'specs'))) {
    const p = paths.delta(root, id, cap);
    if (!existsSync(p)) continue;
    const text = readText(p);
    const file = rel(root, p);
    const parsed = parseDelta(text, cap, file);
    deltas.push({ capability: cap, path: p, file, text, delta: parsed.delta, diagnostics: parsed.diagnostics });
  }
  return { id, dir, meta, files, deltas, diagnostics };
}

export const loadAllChanges = (root: string): ChangeSnapshot[] =>
  listChangeIds(root)
    .map((id) => loadChange(root, id))
    .filter((c): c is ChangeSnapshot => c !== null);
```

- [ ] **Step 5: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/project`
Expected: PASS（9テスト）

- [ ] **Step 6: コミットする**

```bash
git add src/core/project test/core/project test/helpers/project.ts
git commit -m "feat(core): load config, specs and changes from a comb project"
```

---

### Task 7: change の作成と、change・プロジェクト全体の検査

**Files:**
- Create: `src/core/change/new-change.ts`、`src/core/change/validate-change.ts`
- Test: `test/core/change/change.test.ts`

**Interfaces:**
- Consumes：`paths`、`rel`、`ChangeMeta`、`Project`、`ChangeSnapshot`、`validateCapability`、`validateDelta`
- Produces：
  - `CHANGE_ID_RE`
  - `createChange(root, id, today): { path: string | null; diagnostics: Diagnostic[] }`（コード：`CHANGE_ID_INVALID`、`CHANGE_EXISTS`）
  - `validateProject(project): Diagnostic[]`
  - `addedIds(change, exceptFile?): string[]`
  - `validateChange(project, change, all: ChangeSnapshot[]): Diagnostic[]`

- [ ] **Step 1: 失敗するテストを書く**

`test/core/change/change.test.ts`：

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChange } from '../../../src/core/change/new-change.js';
import { validateChange, validateProject } from '../../../src/core/change/validate-change.js';
import { loadAllChanges, loadChange, loadProject } from '../../../src/core/project/load.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';
const addDelta = (id: string) => `## ADDED Requirements\n\n### Requirement: ${id} New\nx\n${scenario}`;

describe('createChange', () => {
  it('creates the folder and .comb.yaml', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    const r = createChange(root, 'add-auto-cancel', '2026-10-06');
    expect(r).toEqual({ path: 'comb/changes/add-auto-cancel', diagnostics: [] });
    expect(loadChange(root, 'add-auto-cancel')!.meta).toEqual({
      schema: 'comb.change/v1',
      id: 'add-auto-cancel',
      created: '2026-10-06',
      base: {},
    });
    expect(existsSync(join(root, 'comb/changes/add-auto-cancel/specs'))).toBe(true);
  });

  it('rejects invalid or existing ids without creating anything', () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    for (const bad of ['Add_X', 'archive', '-x', 'x--y', '']) {
      expect(createChange(root, bad, '2026-10-06').diagnostics[0]!.code).toBe('CHANGE_ID_INVALID');
    }
    expect(existsSync(join(root, 'comb/changes'))).toBe(false);
    createChange(root, 'a', '2026-10-06');
    expect(createChange(root, 'a', '2026-10-06').diagnostics[0]!.code).toBe('CHANGE_EXISTS');
    expect(readdirSync(join(root, 'comb/changes'))).toEqual(['a']);
  });
});

describe('validation across a project', () => {
  it('detects a requirement id defined in two capabilities', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/specs/other/spec.md': ORDER_SPEC,
    });
    // `other` repeats both requirements of order-lifecycle, so each id is reported once on the second spec.
    expect(validateProject(loadProject(root)).map((d) => d.code)).toEqual(['REQ_ID_DUPLICATE', 'REQ_ID_DUPLICATE']);
  });

  it('validates deltas against the base and other changes', () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/changes/a/.comb.yaml': metaYaml('a'),
      'comb/changes/a/specs/order-lifecycle/spec.md': addDelta('REQ-ORDER-003'),
      'comb/changes/b/.comb.yaml': metaYaml('b'),
      'comb/changes/b/specs/order-lifecycle/spec.md': `${addDelta('REQ-ORDER-003')}\n## REMOVED Requirements\n\n### Requirement: REQ-ORDER-077\n**Reason:** r\n`,
    });
    const project = loadProject(root);
    const all = loadAllChanges(root);
    const b = all.find((c) => c.id === 'b')!;
    expect(validateChange(project, b, all).map((d) => d.code).sort()).toEqual(['DELTA_TARGET_MISSING', 'REQ_ID_DUPLICATE']);
    const a = all.find((c) => c.id === 'a')!;
    expect(validateChange(project, a, [a])).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/change`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/change/new-change.ts`：

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import type { ChangeMeta } from '../project/load.js';
import { paths, rel } from '../project/paths.js';

export const CHANGE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createChange(root: string, id: string, today: string): { path: string | null; diagnostics: Diagnostic[] } {
  if (!CHANGE_ID_RE.test(id) || id === 'archive') {
    return {
      path: null,
      diagnostics: [diag('error', 'CHANGE_ID_INVALID', `invalid change id "${id}"`, undefined, 'Use kebab-case, e.g. add-auto-cancel')],
    };
  }
  const dir = paths.change(root, id);
  if (existsSync(dir)) {
    return { path: null, diagnostics: [diag('error', 'CHANGE_EXISTS', `change "${id}" already exists`, { file: rel(root, dir) })] };
  }
  mkdirSync(join(dir, 'specs'), { recursive: true });
  const meta: ChangeMeta = { schema: 'comb.change/v1', id, created: today, base: {} };
  writeFileSync(paths.changeMeta(root, id), stringify(meta));
  return { path: rel(root, dir), diagnostics: [] };
}
```

`src/core/change/validate-change.ts`：

```ts
import { diag, type Diagnostic } from '../diagnostics.js';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { validateCapability, validateDelta } from '../spec/validate-spec.js';

export function validateProject(project: Project): Diagnostic[] {
  const out: Diagnostic[] = [...project.diagnostics];
  const owner = new Map<string, string>();
  for (const spec of project.specs.values()) {
    out.push(...spec.diagnostics, ...validateCapability(spec.capability, spec.file));
    for (const r of spec.capability.requirements) {
      const prev = owner.get(r.id);
      if (prev !== undefined && prev !== spec.name) {
        out.push(diag('error', 'REQ_ID_DUPLICATE', `${r.id} is also defined in ${prev}`, { file: spec.file, line: r.line, id: r.id }));
      }
      if (prev === undefined) owner.set(r.id, spec.name);
    }
  }
  return out;
}

export const addedIds = (change: ChangeSnapshot, exceptFile?: string): string[] =>
  change.deltas.filter((d) => d.file !== exceptFile).flatMap((d) => d.delta.added.map((r) => r.id));

export function validateChange(project: Project, change: ChangeSnapshot, all: ChangeSnapshot[]): Diagnostic[] {
  const out: Diagnostic[] = [...change.diagnostics];
  const others = all.filter((c) => c.id !== change.id).flatMap((c) => addedIds(c));
  for (const d of change.deltas) {
    const otherAdded = new Set([...addedIds(change, d.file), ...others]);
    const base = project.specs.get(d.capability)?.capability ?? null;
    out.push(...d.diagnostics, ...validateDelta(d.delta, base, d.file, otherAdded));
  }
  return out;
}
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run test/core/change`
Expected: PASS（4テスト）

- [ ] **Step 5: コミットする**

```bash
git add src/core/change test/core/change
git commit -m "feat(core): create changes and validate them against the project"
```

---

### Task 8: CLI `new change` と `validate`（プロジェクト外のエラーを含む）

**Files:**
- Create: `src/cli/commands/shared.ts`、`src/cli/commands/new-change.ts`、`src/cli/commands/validate.ts`
- Modify: `src/cli/app.ts`（`registrars`）
- Test: `test/cli/validate.test.ts`

**Interfaces:**
- Consumes：`runCli`、`CliContext`、`envelope`、`render`、`exitCodeFor`、`EXIT`、`findRoot`、`loadProject`、`loadAllChanges`、`createChange`、`validateProject`、`validateChange`
- Produces：
  - `usageError(ctx, command, json, code, message, fix?)`
  - `requireRoot(ctx, command, json): string | null`
  - `finish(ctx, env, json, human)`
  - `registerNewChange`、`registerValidate`
  - コマンド：`comb new change <id> [--json]`、`comb validate [--change <id>] [--json]`

- [ ] **Step 1: 失敗するテストを書く**

`test/cli/validate.test.ts`：

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

const today = () => '2026-10-06';

describe('comb validate / new change', () => {
  it('fails with NOT_A_COMB_PROJECT and exit 2 outside a project', async () => {
    const r = await runCli(['validate', '--json'], makeProject({ 'x.txt': '' }));
    expect(r.code).toBe(2);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(false);
    expect(env.diagnostics[0].code).toBe('NOT_A_COMB_PROJECT');
  });

  it('passes on a valid project', async () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/specs/order-lifecycle/spec.md': ORDER_SPEC });
    const r = await runCli(['validate'], root);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('checked 1 spec(s), 0 change(s)');
  });

  it('reports delta errors with exit 1', async () => {
    const root = makeProject({
      'comb/config.yaml': CONFIG_YAML,
      'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
      'comb/changes/a/.comb.yaml': metaYaml('a'),
      'comb/changes/a/specs/order-lifecycle/spec.md': '## REMOVED Requirements\n\n### Requirement: REQ-ORDER-077\n**Reason:** r\n',
    });
    const r = await runCli(['validate', '--change', 'a', '--json'], root);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics.map((d: { code: string }) => d.code)).toEqual(['DELTA_TARGET_MISSING']);
  });

  it('returns exit 2 for an unknown change', async () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML });
    const r = await runCli(['validate', '--change', 'nope', '--json'], root);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('CHANGE_NOT_FOUND');
  });

  it('creates a change from a nested directory', async () => {
    const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'src/a.ts': '' });
    const r = await runCli(['new', 'change', 'add-x', '--json'], join(root, 'src'), { today });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).data).toEqual({ change: 'add-x', path: 'comb/changes/add-x' });
    expect(existsSync(join(root, 'comb/changes/add-x/.comb.yaml'))).toBe(true);
  });

  it('exits 2 for an unknown command', async () => {
    const r = await runCli(['nope'], process.cwd());
    expect(r.code).toBe(2);
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/cli/validate.test.ts`
Expected: FAIL（`validate` コマンドがない）

- [ ] **Step 3: 実装する**

`src/cli/commands/shared.ts`：

```ts
import { diag } from '../../core/diagnostics.js';
import { findRoot } from '../../core/project/load.js';
import type { CliContext } from '../app.js';
import { envelope, EXIT, exitCodeFor, render, type Envelope } from '../output.js';

export function usageError(ctx: CliContext, command: string, json: boolean, code: string, message: string, fix?: string): void {
  ctx.out(render(envelope(command, null, [diag('error', code, message, undefined, fix)]), json, () => ''));
  ctx.setCode(EXIT.USAGE);
}

export function requireRoot(ctx: CliContext, command: string, json: boolean): string | null {
  const root = findRoot(ctx.cwd);
  if (!root) {
    usageError(ctx, command, json, 'NOT_A_COMB_PROJECT', 'no comb/config.yaml in this directory or its parents', 'Run "comb init" first');
  }
  return root;
}

export function finish<T>(ctx: CliContext, env: Envelope<T>, json: boolean, human: (data: T) => string): void {
  ctx.out(render(env, json, human));
  ctx.setCode(exitCodeFor(env));
}
```

`src/cli/commands/new-change.ts`：

```ts
import type { Command } from 'commander';
import { createChange } from '../../core/change/new-change.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot } from './shared.js';

export function registerNewChange(program: Command, ctx: CliContext): void {
  const group = program.command('new').description('create Comb objects');
  group
    .command('change <id>')
    .description('create a change folder with .comb.yaml')
    .option('--json', 'JSON output')
    .action((id: string, opts: { json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'new change', json);
      if (!root) return;
      const { path, diagnostics } = createChange(root, id, ctx.today());
      finish(ctx, envelope('new change', { change: id, path }, diagnostics), json, (d) => (d.path ? `created ${d.path}` : ''));
    });
}
```

`src/cli/commands/validate.ts`：

```ts
import type { Command } from 'commander';
import { validateChange, validateProject } from '../../core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

export function registerValidate(program: Command, ctx: CliContext): void {
  program
    .command('validate')
    .description('check specs and changes')
    .option('--change <id>', 'only this change')
    .option('--json', 'JSON output')
    .action((opts: { change?: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'validate', json);
      if (!root) return;
      const project = loadProject(root);
      const all = loadAllChanges(root);
      let targets = all;
      if (opts.change !== undefined) {
        const one = all.find((c) => c.id === opts.change);
        if (!one) {
          usageError(ctx, 'validate', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
          return;
        }
        targets = [one];
      }
      const diagnostics = validateProject(project);
      for (const c of targets) diagnostics.push(...validateChange(project, c, all));
      const data = { specs: project.specs.size, changes: targets.map((c) => c.id) };
      finish(ctx, envelope('validate', data, diagnostics), json, (d) => `checked ${d.specs} spec(s), ${d.changes.length} change(s)`);
    });
}
```

`src/cli/app.ts` の `registrars` を次のように変更する（import も追加する）。

```ts
import { registerNewChange } from './commands/new-change.js';
import { registerValidate } from './commands/validate.js';

const registrars: Registrar[] = [registerNewChange, registerValidate];
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run && npm run typecheck`
Expected: PASS（全テスト）、型エラーなし

- [ ] **Step 5: コミットする**

```bash
git add src/cli test/cli/validate.test.ts
git commit -m "feat(cli): comb new change and comb validate"
```

---

### Task 9: 状態の計算と `comb status`

**Files:**
- Create: `src/core/workflow/status.ts`、`src/cli/commands/status.ts`
- Modify: `src/cli/app.ts`（`registrars` に `registerStatus` を追加）
- Test: `test/core/workflow/status.test.ts`、`test/cli/status.test.ts`

**Interfaces:**
- Consumes：`ChangeSnapshot`、`Diagnostic`、`hasErrors`、`headingBlocks`、`loadProject`、`loadAllChanges`、`validateChange`
- Produces：
  - `ArtifactId = 'proposal' | 'delta' | 'review' | 'clarify' | 'tasks' | 'apply'`
  - `ArtifactState = 'done' | 'missing' | 'invalid' | 'in-progress'`
  - `ArtifactStatus { id; state; detail? }`、`ChangeStatus { change; artifacts; next: ArtifactId | 'archive'; tasks: { done; total } }`
  - `ARTIFACT_ORDER`、`countTasks(text?)`、`proposalComplete(text)`
  - `computeStatus(change, validation): ChangeStatus`
  - コマンド：`comb status [--change <id>] [--json]`
- M1 での注意：review は `review.md` があれば done。clarify は常に done（detail に `questions arrive in M2`）。M2 で、delta のハッシュによる stale 判定と、high の未決質問によるゲートに置き換える。

- [ ] **Step 1: 失敗するテストを書く**

`test/core/workflow/status.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { diag } from '../../../src/core/diagnostics.js';
import type { ChangeSnapshot } from '../../../src/core/project/load.js';
import { parseDelta } from '../../../src/core/spec/parse-delta.js';
import { computeStatus, countTasks, proposalComplete } from '../../../src/core/workflow/status.js';

const PROPOSAL = '# Change: x\n\n## Why\nw\n\n## What Changes\n- a\n\n## Impact\n- b\n';

function snapshot(files: ChangeSnapshot['files'], withDelta = false): ChangeSnapshot {
  const text = '## ADDED Requirements\n';
  const deltas = withDelta
    ? [{ capability: 'c', path: '/p', file: 'comb/changes/x/specs/c/spec.md', text, delta: parseDelta(text, 'c', 'f').delta, diagnostics: [] }]
    : [];
  return { id: 'x', dir: '/d', meta: null, files, deltas, diagnostics: [] };
}

describe('status helpers', () => {
  it('counts checkbox tasks', () => {
    expect(countTasks('- [ ] 1.1 a\n- [x] 1.2 b\n* [X] 1.3 c\nnot a task')).toEqual({ done: 2, total: 3 });
    expect(countTasks(undefined)).toEqual({ done: 0, total: 0 });
  });

  it('requires Why / What Changes / Impact in the proposal', () => {
    expect(proposalComplete(PROPOSAL)).toBe(true);
    expect(proposalComplete('# Change: x\n\n## Why\nw\n')).toBe(false);
  });
});

describe('computeStatus', () => {
  it('points to the proposal first', () => {
    const s = computeStatus(snapshot({}), []);
    expect(s.next).toBe('proposal');
    expect(s.artifacts.map((a) => `${a.id}:${a.state}`)).toEqual([
      'proposal:missing', 'delta:missing', 'review:missing', 'clarify:done', 'tasks:missing', 'apply:missing',
    ]);
  });

  it('marks the delta invalid when validation has errors', () => {
    const s = computeStatus(snapshot({ proposal: PROPOSAL }, true), [diag('error', 'DELTA_EMPTY', 'x')]);
    expect(s.artifacts[1]).toEqual({ id: 'delta', state: 'invalid', detail: '1 error(s)' });
    expect(s.next).toBe('delta');
  });

  it('goes to review after a valid delta, then tasks/apply, then archive', () => {
    expect(computeStatus(snapshot({ proposal: PROPOSAL, tasks: '- [ ] a' }, true), []).next).toBe('review');
    const s = computeStatus(snapshot({ proposal: PROPOSAL, review: 'r', tasks: '- [x] a\n- [ ] b' }, true), []);
    expect(s.next).toBe('apply');
    expect(s.tasks).toEqual({ done: 1, total: 2 });
    expect(s.artifacts[5]).toEqual({ id: 'apply', state: 'in-progress', detail: '1/2' });
    expect(computeStatus(snapshot({ proposal: PROPOSAL, review: 'r', tasks: '- [x] a' }, true), []).next).toBe('archive');
  });
});
```

`test/cli/status.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

describe('comb status', () => {
  const root = makeProject({
    'comb/config.yaml': CONFIG_YAML,
    'comb/changes/add-x/.comb.yaml': metaYaml('add-x'),
    'comb/changes/add-x/proposal.md': '# Change: x\n\n## Why\nw\n\n## What Changes\n- a\n\n## Impact\n- b\n',
  });

  it('shows one change in JSON', async () => {
    const r = await runCli(['status', '--change', 'add-x', '--json'], root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.data.change).toBe('add-x');
    expect(env.data.next).toBe('delta');
  });

  it('summarizes all changes for humans', async () => {
    const r = await runCli(['status'], root);
    expect(r.stdout.trim()).toBe('add-x  next: delta');
  });
});
```

- [ ] **Step 2: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/workflow test/cli/status.test.ts`
Expected: FAIL（モジュールやコマンドがない）

- [ ] **Step 3: 実装する**

`src/core/workflow/status.ts`：

```ts
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
```

`src/cli/commands/status.ts`：

```ts
import type { Command } from 'commander';
import { validateChange } from '../../core/change/validate-change.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import { computeStatus, type ChangeStatus } from '../../core/workflow/status.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

const detailOf = (s: ChangeStatus): string =>
  [
    ...s.artifacts.map((a) => `${a.id.padEnd(9)}${a.state}${a.detail ? ` (${a.detail})` : ''}`),
    `next: ${s.next}`,
  ].join('\n');

export function registerStatus(program: Command, ctx: CliContext): void {
  program
    .command('status')
    .description('show artifact states and the next step')
    .option('--change <id>', 'one change in detail')
    .option('--json', 'JSON output')
    .action((opts: { change?: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'status', json);
      if (!root) return;
      const project = loadProject(root);
      const all = loadAllChanges(root);
      const statusOf = (id: string): ChangeStatus | null => {
        const c = all.find((x) => x.id === id);
        return c ? computeStatus(c, validateChange(project, c, all)) : null;
      };
      if (opts.change !== undefined) {
        const s = statusOf(opts.change);
        if (!s) {
          usageError(ctx, 'status', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`);
          return;
        }
        finish(ctx, envelope('status', s, []), json, detailOf);
        return;
      }
      const list = all.map((c) => statusOf(c.id) as ChangeStatus);
      finish(ctx, envelope('status', list, []), json, (l) =>
        l.length === 0 ? 'no active changes' : l.map((s) => `${s.change}  next: ${s.next}`).join('\n'),
      );
    });
}
```

`src/cli/app.ts` に、import と登録を追加する。

```ts
import { registerStatus } from './commands/status.js';

const registrars: Registrar[] = [registerNewChange, registerValidate, registerStatus];
```

- [ ] **Step 4: テストを実行して、通ることを確認する**

Run: `npx vitest run && npm run typecheck`
Expected: PASS、型エラーなし

- [ ] **Step 5: コミットする**

```bash
git add src/core/workflow src/cli test/core/workflow test/cli/status.test.ts
git commit -m "feat: compute change status and next step"
```

---

### Task 10: instructions の組み立て（proposal / delta / tasks）とテンプレート

**Files:**
- Create: `src/core/instructions/build.ts`、`src/cli/commands/instructions.ts`
- Create: `templates/formats/proposal.md`、`templates/formats/delta.md`、`templates/formats/tasks.md`
- Create: `templates/instructions/proposal.md`、`templates/instructions/delta.md`、`templates/instructions/tasks.md`
- Modify: `src/cli/app.ts`（`registrars` に `registerInstructions` を追加）
- Test: `test/core/instructions/build.test.ts`、`test/cli/instructions.test.ts`

**Interfaces:**
- Consumes：`Project`、`ChangeSnapshot`、`paths`、`rel`、`nextRequirementId`、`TEMPLATES_DIR`
- Produces：
  - `InstructionArtifact = 'proposal' | 'delta' | 'tasks'`、`INSTRUCTION_ARTIFACTS`
  - `Instructions { artifact; change; outputPath; template; instruction; rules; language; context: { project; capabilities; readFiles }; ids: { nextRequirement } }`
  - `nextRequirementIds(project, changes): Record<string, string>`
  - `buildInstructions(artifact, project, change, all, templatesDir): Instructions`
  - コマンド：`comb instructions <artifact> --change <id> [--json]`（未知の artifact は `UNKNOWN_ARTIFACT`、exit 2）
- M2 では、`InstructionArtifact` に `review`・`clarify` を、M3 では `apply` を追加する。

- [ ] **Step 1: テンプレートを書く**

`templates/formats/proposal.md`：

```markdown
# Change: <title>

## Why
<the problem or opportunity, in the user's words, 1-3 sentences>

## What Changes
- <one bullet per observable behavior change>
- Assumption: <anything the user did not say but you had to assume>

## Impact
- Capabilities: <capability names>
- Requirements: <REQ ids that are modified or removed; new ones as "REQ-XXX-NNN (new)">
```

`templates/formats/delta.md`：

```markdown
---
prefix: ORDER            # only when this delta creates a new capability
---
## Purpose                # only for a new capability
<what this capability covers>

## ADDED Requirements

### Requirement: REQ-ORDER-019 <title>
<normative text>

#### Scenario: <name>
- **GIVEN** <precondition>
- **WHEN** <trigger>
- **THEN** <outcome>
- **AND** <more outcome>

## MODIFIED Requirements

### Requirement: REQ-ORDER-006 <title, may change>
<the WHOLE updated requirement, including every scenario that still applies>

## REMOVED Requirements

### Requirement: REQ-ORDER-010
**Reason:** <why it is removed>
**Migration:** <what users or data need, if anything>

## MODIFIED Sections

### Section: <exact existing "##" heading>
<the WHOLE new content of that section>

## ADDED Sections

### Section: <new heading>
<content>
```

`templates/formats/tasks.md`：

```markdown
- [ ] 1.1 <small, verifiable step> (REQ-ORDER-019)
- [ ] 1.2 <test for the behavior above> (REQ-ORDER-019)
- [ ] 2.1 <next step> (REQ-ORDER-006)
```

`templates/instructions/proposal.md`：

```markdown
Write the proposal for change "{{change}}". Write the prose in {{language}}; keep the headings exactly as in the template (English).

1. Read the files in context.readFiles first: they are the current specs and past decisions. Do not contradict a decision silently.
2. Why: the problem or opportunity in the user's own words.
3. What Changes: observable behavior only — no implementation detail (no classes, tables, endpoints).
4. If you had to assume anything the user did not say, write it as a bullet starting with "Assumption:". Review will turn it into a question; never resolve it yourself.
5. Impact: every capability and every requirement id that will be added, modified or removed.
```

`templates/instructions/delta.md`：

```markdown
Write the spec delta(s) for change "{{change}}". Prose in {{language}}; structure keywords stay in English.

1. Read every file in context.readFiles, including proposal.md.
2. Write one delta per affected capability at comb/changes/{{change}}/specs/<capability>/spec.md (outputPath shows the pattern).
3. Address requirements by id:
   - ADDED: take ids from ids.nextRequirement for that capability and count up from there. For a NEW capability, choose a prefix (default: the first word of the capability name in upper case), put "prefix: <PREFIX>" in the frontmatter, add "## Purpose", and start at 001.
   - MODIFIED: copy the WHOLE current requirement block from comb/specs/, then edit it. Keep every scenario that still applies; a dropped scenario is reported.
   - REMOVED: "### Requirement: <id>" followed by "**Reason:**" (and "**Migration:**" when users or data are affected).
4. Every ADDED or MODIFIED requirement needs at least one "#### Scenario:" written as "- **GIVEN** / **WHEN** / **THEN** / **AND**" bullets with concrete values.
5. Change non-requirement sections (tables, conventions) with "## MODIFIED Sections" / "## ADDED Sections" and "### Section: <heading>", always with the whole section.
6. Never edit comb/specs/ or comb/decisions.md directly.
7. Run `comb validate --change {{change}} --json` and fix every error before you finish.
```

`templates/instructions/tasks.md`：

```markdown
Write tasks.md for change "{{change}}" in {{language}}.

- An ordered checklist ("- [ ] 1.1 …") of implementation steps, each small enough to verify on its own.
- End every task with the requirement ids it implements, e.g. "(REQ-ORDER-019)".
- Include test tasks next to the behavior they cover.
- Do not plan work for open questions; they are resolved before implementation.
```

- [ ] **Step 2: 失敗するテストを書く**

`test/core/instructions/build.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildInstructions, nextRequirementIds } from '../../../src/core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../../src/core/project/load.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { CONFIG_YAML, metaYaml, ORDER_SPEC } from '../../helpers/fixtures.js';
import { makeProject } from '../../helpers/project.js';

const scenario = '\n#### Scenario: s\n- **GIVEN** a\n';

function setup() {
  const root = makeProject({
    'comb/config.yaml': `${CONFIG_YAML}context: "C2C marketplace"\nrules:\n  delta: ["Amounts are integer yen"]\n`,
    'comb/specs/order-lifecycle/spec.md': ORDER_SPEC,
    'comb/decisions.md': '# Decisions\n',
    'comb/changes/a/.comb.yaml': metaYaml('a'),
    'comb/changes/a/proposal.md': '# Change: a\n',
    'comb/changes/a/specs/order-lifecycle/spec.md': `## ADDED Requirements\n\n### Requirement: REQ-ORDER-011 X\nx\n${scenario}`,
    'comb/changes/b/.comb.yaml': metaYaml('b'),
    'comb/changes/b/specs/payment/spec.md': `---\nprefix: PAY\n---\n## Purpose\np\n\n## ADDED Requirements\n\n### Requirement: REQ-PAY-001 Y\ny\n${scenario}`,
  });
  return { project: loadProject(root), all: loadAllChanges(root) };
}

describe('nextRequirementIds', () => {
  it('skips used, retired and in-flight ids, and covers new capabilities', () => {
    const { project, all } = setup();
    expect(nextRequirementIds(project, all)).toEqual({ 'order-lifecycle': 'REQ-ORDER-012', payment: 'REQ-PAY-002' });
  });
});

describe('buildInstructions', () => {
  it('builds delta instructions with files to read, rules and ids', () => {
    const { project, all } = setup();
    const ins = buildInstructions('delta', project, all.find((c) => c.id === 'a')!, all, TEMPLATES_DIR);
    expect(ins.outputPath).toBe('comb/changes/a/specs/<capability>/spec.md');
    expect(ins.context.readFiles).toEqual([
      'comb/specs/order-lifecycle/spec.md',
      'comb/decisions.md',
      'comb/changes/a/proposal.md',
    ]);
    expect(ins.context.project).toBe('C2C marketplace');
    expect(ins.rules).toEqual(['Amounts are integer yen']);
    expect(ins.instruction).toContain('comb validate --change a --json');
    expect(ins.instruction).not.toContain('{{');
    expect(ins.template).toContain('## ADDED Requirements');
    expect(ins.ids.nextRequirement['order-lifecycle']).toBe('REQ-ORDER-012');
  });

  it('builds proposal and tasks instructions with their output paths', () => {
    const { project, all } = setup();
    const a = all.find((c) => c.id === 'a')!;
    expect(buildInstructions('proposal', project, a, all, TEMPLATES_DIR).outputPath).toBe('comb/changes/a/proposal.md');
    const tasks = buildInstructions('tasks', project, a, all, TEMPLATES_DIR);
    expect(tasks.outputPath).toBe('comb/changes/a/tasks.md');
    expect(tasks.context.readFiles).toEqual(['comb/changes/a/proposal.md', 'comb/changes/a/specs/order-lifecycle/spec.md']);
  });
});
```

`test/cli/instructions.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { CONFIG_YAML, metaYaml } from '../helpers/fixtures.js';
import { makeProject } from '../helpers/project.js';

describe('comb instructions', () => {
  const root = makeProject({ 'comb/config.yaml': CONFIG_YAML, 'comb/changes/a/.comb.yaml': metaYaml('a') });

  it('returns proposal instructions as JSON', async () => {
    const r = await runCli(['instructions', 'proposal', '--change', 'a', '--json'], root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).data.outputPath).toBe('comb/changes/a/proposal.md');
  });

  it('rejects an unknown artifact with exit 2', async () => {
    const r = await runCli(['instructions', 'nope', '--change', 'a', '--json'], root);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('UNKNOWN_ARTIFACT');
  });

  it('requires --change', async () => {
    expect((await runCli(['instructions', 'proposal'], root)).code).toBe(2);
  });
});
```

- [ ] **Step 3: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/core/instructions test/cli/instructions.test.ts`
Expected: FAIL（モジュールやコマンドがない）

- [ ] **Step 4: 実装する**

`src/core/instructions/build.ts`：

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeSnapshot, Project } from '../project/load.js';
import { paths, rel } from '../project/paths.js';
import { nextRequirementId } from '../spec/ids.js';

export type InstructionArtifact = 'proposal' | 'delta' | 'tasks';
export const INSTRUCTION_ARTIFACTS: readonly InstructionArtifact[] = ['proposal', 'delta', 'tasks'];

export interface Instructions {
  artifact: InstructionArtifact;
  change: string;
  outputPath: string;
  template: string;
  instruction: string;
  rules: string[];
  language: string;
  context: { project: string; capabilities: string[]; readFiles: string[] };
  ids: { nextRequirement: Record<string, string> };
}

const fill = (t: string, vars: Record<string, string>): string =>
  t.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => vars[k] ?? m);

export function nextRequirementIds(project: Project, changes: ChangeSnapshot[]): Record<string, string> {
  const inFlight = changes.flatMap((c) => c.deltas.flatMap((d) => d.delta.added.map((r) => r.id)));
  const out: Record<string, string> = {};
  for (const spec of project.specs.values()) {
    const prefix = spec.capability.prefix;
    if (!prefix) continue;
    const used = [...spec.capability.requirements.map((r) => r.id), ...spec.capability.retired, ...inFlight];
    out[spec.name] = nextRequirementId(prefix, used);
  }
  for (const c of changes) {
    for (const d of c.deltas) {
      if (project.specs.has(d.capability) || !d.delta.prefix || out[d.capability] !== undefined) continue;
      out[d.capability] = nextRequirementId(d.delta.prefix, inFlight);
    }
  }
  return out;
}

export function buildInstructions(
  artifact: InstructionArtifact,
  project: Project,
  change: ChangeSnapshot,
  all: ChangeSnapshot[],
  templatesDir: string,
): Instructions {
  const root = project.root;
  const specFiles = [...project.specs.values()].map((s) => s.file);
  const decisions = existsSync(paths.decisions(root)) ? [rel(root, paths.decisions(root))] : [];
  const proposal = change.files.proposal !== undefined ? [rel(root, paths.changeFile(root, change.id, 'proposal'))] : [];
  const deltas = change.deltas.map((d) => d.file);
  const readFiles =
    artifact === 'proposal'
      ? [...specFiles, ...decisions]
      : artifact === 'delta'
        ? [...specFiles, ...decisions, ...proposal]
        : [...proposal, ...deltas];
  const outputPath =
    artifact === 'delta'
      ? `comb/changes/${change.id}/specs/<capability>/spec.md`
      : rel(root, paths.changeFile(root, change.id, artifact));
  const vars = { change: change.id, language: project.config.language };
  return {
    artifact,
    change: change.id,
    outputPath,
    template: readFileSync(join(templatesDir, 'formats', `${artifact}.md`), 'utf8'),
    instruction: fill(readFileSync(join(templatesDir, 'instructions', `${artifact}.md`), 'utf8'), vars),
    rules: project.config.rules[artifact] ?? [],
    language: project.config.language,
    context: { project: project.config.context, capabilities: [...project.specs.keys()], readFiles },
    ids: { nextRequirement: nextRequirementIds(project, all) },
  };
}
```

`src/cli/commands/instructions.ts`：

```ts
import type { Command } from 'commander';
import { buildInstructions, INSTRUCTION_ARTIFACTS, type InstructionArtifact, type Instructions } from '../../core/instructions/build.js';
import { loadAllChanges, loadProject } from '../../core/project/load.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, requireRoot, usageError } from './shared.js';

const human = (i: Instructions): string =>
  [
    `# ${i.artifact} for ${i.change} → ${i.outputPath}`,
    i.instruction.trim(),
    i.rules.length > 0 ? `Rules:\n${i.rules.map((r) => `- ${r}`).join('\n')}` : '',
    `Read first:\n${i.context.readFiles.map((f) => `- ${f}`).join('\n') || '- (none)'}`,
    `Next requirement ids: ${JSON.stringify(i.ids.nextRequirement)}`,
    `Template:\n${i.template.trim()}`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

export function registerInstructions(program: Command, ctx: CliContext): void {
  program
    .command('instructions <artifact>')
    .description(`instructions for an artifact (${INSTRUCTION_ARTIFACTS.join(', ')})`)
    .requiredOption('--change <id>', 'change id')
    .option('--json', 'JSON output')
    .action((artifact: string, opts: { change: string; json?: boolean }) => {
      const json = opts.json === true;
      const root = requireRoot(ctx, 'instructions', json);
      if (!root) return;
      if (!(INSTRUCTION_ARTIFACTS as readonly string[]).includes(artifact)) {
        usageError(ctx, 'instructions', json, 'UNKNOWN_ARTIFACT', `unknown artifact "${artifact}"`, `Use one of: ${INSTRUCTION_ARTIFACTS.join(', ')}`);
        return;
      }
      const all = loadAllChanges(root);
      const change = all.find((c) => c.id === opts.change);
      if (!change) {
        usageError(ctx, 'instructions', json, 'CHANGE_NOT_FOUND', `change "${opts.change}" not found`, 'Create it with "comb new change <id>"');
        return;
      }
      const ins = buildInstructions(artifact as InstructionArtifact, loadProject(root), change, all, TEMPLATES_DIR);
      finish(ctx, envelope('instructions', ins, []), json, human);
    });
}
```

`src/cli/app.ts` に、import と登録を追加する。

```ts
import { registerInstructions } from './commands/instructions.js';

const registrars: Registrar[] = [registerNewChange, registerValidate, registerStatus, registerInstructions];
```

- [ ] **Step 5: テストを実行して、通ることを確認する**

Run: `npx vitest run && npm run typecheck`
Expected: PASS、型エラーなし

- [ ] **Step 6: コミットする**

```bash
git add src/core/instructions src/cli templates test/core/instructions test/cli/instructions.test.ts
git commit -m "feat: comb instructions for proposal, delta and tasks"
```

---

### Task 11: Claude Code への導入（Skill・コマンド）と `comb init`

**Files:**
- Create: `src/agents/adapter.ts`、`src/agents/claude-code.ts`、`src/agents/registry.ts`、`src/core/project/init.ts`、`src/cli/commands/init.ts`
- Create: `templates/skills/explore.md`、`templates/skills/propose.md`
- Modify: `src/cli/app.ts`（`registrars` に `registerInit` を追加）
- Test: `test/agents/claude-code.test.ts`、`test/core/project/init.test.ts`、`test/cli/init.test.ts`

**Interfaces:**
- Consumes：`splitFrontmatter`、`normalizeText`、`defaultConfig`、`renderConfig`、`VERSION`、`TEMPLATES_DIR`
- Produces：
  - `GeneratedFile { path; content }`、`AgentAdapter { id; files(templatesDir, version): GeneratedFile[] }`、`GENERATED_MARKER = 'generatedBy: comb@'`
  - `listWorkflows(templatesDir): string[]`、`splitTemplate(raw): { description; body }`、`claudeCode: AgentAdapter`
  - `AGENTS: Record<string, AgentAdapter>`
  - `InitResult { created; updated; skipped }`、`initProject(root, { language, version, templatesDir, agents }): InitResult`
  - コマンド：`comb init [--language <lang>] [--agent <id>] [--json]`（未知のエージェントは `UNKNOWN_AGENT`、exit 2）

- [ ] **Step 1: Skill のテンプレートを書く**

`templates/skills/explore.md`：

```markdown
---
description: Explore an idea or problem with the user before proposing a Comb change. Use while the user is still figuring out what to build or change.
---
# Comb: explore

You help the user think. Do not create or edit any files in this workflow.

1. Read `comb/config.yaml` (project context and language) and, when relevant, `comb/specs/*/spec.md` and `comb/decisions.md` so the conversation starts from what is already decided.
2. Clarify the problem: who is affected, what triggers it, what outcome they want, and what must never happen.
3. Surface unknowns explicitly — actors, states, deadlines, money, failure and retry cases — and ask about them one or two at a time.
4. When the user is ready, summarize the agreed scope in 3–6 bullets and suggest `/comb:propose`.

Write in the language set in `comb/config.yaml`.
```

`templates/skills/propose.md`：

```markdown
---
description: Turn the agreed idea into a Comb change (proposal, spec delta, tasks) that passes comb validate. Use when the user wants to propose or start a change.
---
# Comb: propose

The `comb` CLI is the source of truth for formats and rules. Follow what it returns; do not improvise formats.

1. Choose a kebab-case change id (a verb phrase, e.g. `add-auto-cancel`) and run `comb new change <id> --json`.
2. Run `comb instructions proposal --change <id> --json`. Read `data.context.readFiles`, then write `data.outputPath` following `data.instruction`, `data.template` and `data.rules`, in `data.language`.
3. Run `comb instructions delta --change <id> --json` and write one delta per affected capability, using `data.ids.nextRequirement` for new requirement ids.
4. Run `comb instructions tasks --change <id> --json` and write the tasks.
5. Run `comb validate --change <id> --json`. Fix every error and re-run until `ok` is `true`. Mention any warnings to the user.
6. Run `comb status --change <id>` and tell the user what you created and what comes next.

Never edit `comb/specs/` or `comb/decisions.md` directly — only `comb archive` changes them.
```

- [ ] **Step 2: 失敗するテストを書く**

`test/agents/claude-code.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { claudeCode, listWorkflows } from '../../src/agents/claude-code.js';
import { splitFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { TEMPLATES_DIR } from '../../src/templates-dir.js';

describe('claude-code adapter', () => {
  it('lists workflows from templates/skills', () => {
    expect(listWorkflows(TEMPLATES_DIR)).toEqual(['explore', 'propose']);
  });

  it('generates a skill and a slash command per workflow', () => {
    const files = claudeCode.files(TEMPLATES_DIR, '9.9.9');
    expect(files.map((f) => f.path)).toEqual([
      '.claude/skills/comb-explore/SKILL.md',
      '.claude/commands/comb/explore.md',
      '.claude/skills/comb-propose/SKILL.md',
      '.claude/commands/comb/propose.md',
    ]);
    const skill = files[2]!.content;
    const fm = splitFrontmatter(skill);
    expect(fm.error).toBeNull();
    expect(fm.data).toMatchObject({ name: 'comb-propose', 'allowed-tools': 'Bash(comb:*)', metadata: { generatedBy: 'comb@9.9.9' } });
    expect(String(fm.data.description)).toContain('Comb change');
    expect(skill).toContain('comb instructions proposal');
    const command = files[3]!.content;
    expect(command).toContain('generatedBy: comb@9.9.9');
    expect(command).toContain('Use the comb-propose skill');
    expect(command).toContain('$ARGUMENTS');
  });
});
```

`test/core/project/init.test.ts`：

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeCode } from '../../../src/agents/claude-code.js';
import { initProject } from '../../../src/core/project/init.js';
import { parseConfig } from '../../../src/core/project/config.js';
import { TEMPLATES_DIR } from '../../../src/templates-dir.js';
import { makeProject } from '../../helpers/project.js';

const opts = { language: 'ja', version: '1.0.0', templatesDir: TEMPLATES_DIR, agents: [claudeCode] };

describe('initProject', () => {
  it('creates the comb folder, config and agent files', () => {
    const root = makeProject({});
    const r = initProject(root, opts);
    expect(r.created).toEqual([
      'comb/config.yaml',
      'comb/decisions.md',
      'comb/specs/.gitkeep',
      'comb/changes/archive/.gitkeep',
      '.claude/skills/comb-explore/SKILL.md',
      '.claude/commands/comb/explore.md',
      '.claude/skills/comb-propose/SKILL.md',
      '.claude/commands/comb/propose.md',
    ]);
    const { config, diagnostics } = parseConfig(readFileSync(join(root, 'comb/config.yaml'), 'utf8'), 'c');
    expect(diagnostics).toEqual([]);
    expect(config.language).toBe('ja');
  });

  it('is idempotent and never overwrites user-owned files', () => {
    const root = makeProject({});
    initProject(root, opts);
    writeFileSync(join(root, '.claude/skills/comb-explore/SKILL.md'), 'my own skill');
    const again = initProject(root, opts);
    expect(again.created).toEqual([]);
    expect(again.updated).toEqual([]);
    expect(readFileSync(join(root, '.claude/skills/comb-explore/SKILL.md'), 'utf8')).toBe('my own skill');
  });

  it('updates files generated by an older comb version', () => {
    const root = makeProject({});
    initProject(root, { ...opts, version: '0.9.0' });
    const r = initProject(root, opts);
    expect(r.updated).toContain('.claude/skills/comb-propose/SKILL.md');
    expect(readFileSync(join(root, '.claude/skills/comb-propose/SKILL.md'), 'utf8')).toContain('comb@1.0.0');
  });
});
```

`test/cli/init.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/app.js';
import { makeProject } from '../helpers/project.js';

describe('comb init', () => {
  it('initializes a project that then validates cleanly', async () => {
    const root = makeProject({});
    const init = await runCli(['init', '--language', 'ja', '--json'], root);
    expect(init.code).toBe(0);
    expect(JSON.parse(init.stdout).data.created).toContain('.claude/commands/comb/propose.md');
    const v = await runCli(['validate'], root);
    expect(v.code).toBe(0);
  });

  it('rejects an unknown agent', async () => {
    const r = await runCli(['init', '--agent', 'nope', '--json'], makeProject({}));
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe('UNKNOWN_AGENT');
  });
});
```

- [ ] **Step 3: テストを実行して、失敗することを確認する**

Run: `npx vitest run test/agents test/core/project/init.test.ts test/cli/init.test.ts`
Expected: FAIL（モジュールやコマンドがない）

- [ ] **Step 4: 実装する**

`src/agents/adapter.ts`：

```ts
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface AgentAdapter {
  id: string;
  files(templatesDir: string, version: string): GeneratedFile[];
}

/** Every file Comb generates contains this marker; files without it are user-owned. */
export const GENERATED_MARKER = 'generatedBy: comb@';
```

`src/agents/claude-code.ts`：

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitFrontmatter } from '../core/markdown/frontmatter.js';
import { normalizeText } from '../core/markdown/text.js';
import type { AgentAdapter, GeneratedFile } from './adapter.js';

export function listWorkflows(templatesDir: string): string[] {
  return readdirSync(join(templatesDir, 'skills'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort();
}

export function splitTemplate(raw: string): { description: string; body: string } {
  const text = normalizeText(raw);
  const fm = splitFrontmatter(text);
  const description = typeof fm.data.description === 'string' ? fm.data.description : '';
  return { description, body: text.slice(fm.bodyOffset).trimStart() };
}

export const claudeCode: AgentAdapter = {
  id: 'claude-code',
  files(templatesDir: string, version: string): GeneratedFile[] {
    return listWorkflows(templatesDir).flatMap((wf) => {
      const { description, body } = splitTemplate(readFileSync(join(templatesDir, 'skills', `${wf}.md`), 'utf8'));
      const skill = [
        '---',
        `name: comb-${wf}`,
        `description: ${JSON.stringify(description)}`,
        'allowed-tools: Bash(comb:*)',
        'metadata:',
        `  generatedBy: comb@${version}`,
        '---',
        '',
        body,
      ].join('\n');
      const command = [
        '---',
        `description: ${JSON.stringify(description)}`,
        '---',
        `<!-- generatedBy: comb@${version} -->`,
        '',
        `Use the comb-${wf} skill for this request.`,
        '',
        '$ARGUMENTS',
        '',
      ].join('\n');
      return [
        { path: `.claude/skills/comb-${wf}/SKILL.md`, content: skill },
        { path: `.claude/commands/comb/${wf}.md`, content: command },
      ];
    });
  },
};
```

`src/agents/registry.ts`：

```ts
import type { AgentAdapter } from './adapter.js';
import { claudeCode } from './claude-code.js';

export const AGENTS: Record<string, AgentAdapter> = { [claudeCode.id]: claudeCode };
```

`src/core/project/init.ts`：

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GENERATED_MARKER, type AgentAdapter } from '../../agents/adapter.js';
import { defaultConfig, renderConfig } from './config.js';

export interface InitResult {
  created: string[];
  updated: string[];
  skipped: string[];
}

export function initProject(
  root: string,
  opts: { language: string; version: string; templatesDir: string; agents: AgentAdapter[] },
): InitResult {
  const result: InitResult = { created: [], updated: [], skipped: [] };
  const put = (relPath: string, content: string, generated: boolean): void => {
    const p = join(root, relPath);
    if (!existsSync(p)) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      result.created.push(relPath);
      return;
    }
    const existing = readFileSync(p, 'utf8');
    if (existing !== content && generated && existing.includes(GENERATED_MARKER)) {
      writeFileSync(p, content);
      result.updated.push(relPath);
      return;
    }
    result.skipped.push(relPath);
  };
  const config = defaultConfig(opts.language);
  config.agents = opts.agents.map((a) => a.id);
  put('comb/config.yaml', renderConfig(config), false);
  put('comb/decisions.md', '# Decisions\n', false);
  put('comb/specs/.gitkeep', '', false);
  put('comb/changes/archive/.gitkeep', '', false);
  for (const agent of opts.agents) {
    for (const f of agent.files(opts.templatesDir, opts.version)) put(f.path, f.content, true);
  }
  return result;
}
```

`src/cli/commands/init.ts`：

```ts
import type { Command } from 'commander';
import { AGENTS } from '../../agents/registry.js';
import { initProject, type InitResult } from '../../core/project/init.js';
import { TEMPLATES_DIR } from '../../templates-dir.js';
import { VERSION } from '../../version.js';
import type { CliContext } from '../app.js';
import { envelope } from '../output.js';
import { finish, usageError } from './shared.js';

const human = (r: InitResult): string =>
  [
    ...r.created.map((f) => `created  ${f}`),
    ...r.updated.map((f) => `updated  ${f}`),
    ...r.skipped.map((f) => `kept     ${f}`),
  ].join('\n');

export function registerInit(program: Command, ctx: CliContext): void {
  program
    .command('init')
    .description('set up comb/ and agent skills in the current directory')
    .option('--language <lang>', 'language of artifact prose', 'en')
    .option('--agent <id>', 'agent to install skills for', 'claude-code')
    .option('--json', 'JSON output')
    .action((opts: { language: string; agent: string; json?: boolean }) => {
      const json = opts.json === true;
      const agent = AGENTS[opts.agent];
      if (!agent) {
        usageError(ctx, 'init', json, 'UNKNOWN_AGENT', `unknown agent "${opts.agent}"`, `Use one of: ${Object.keys(AGENTS).join(', ')}`);
        return;
      }
      const result = initProject(ctx.cwd, { language: opts.language, version: VERSION, templatesDir: TEMPLATES_DIR, agents: [agent] });
      finish(ctx, envelope('init', result, []), json, human);
    });
}
```

`src/cli/app.ts` に、import と登録を追加する。

```ts
import { registerInit } from './commands/init.js';

const registrars: Registrar[] = [registerInit, registerNewChange, registerValidate, registerStatus, registerInstructions];
```

- [ ] **Step 5: テストを実行して、通ることを確認する**

Run: `npx vitest run && npm run typecheck`
Expected: PASS、型エラーなし

- [ ] **Step 6: コミットする**

```bash
git add src/agents src/core/project/init.ts src/cli templates/skills test/agents test/core/project/init.test.ts test/cli/init.test.ts
git commit -m "feat: comb init installs Claude Code skills and slash commands"
```

---

### Task 12: 体験の確認（E1・E2）、README、体験ログ

ここではコードではなく、**実際の Claude Code と LLM で体験が成立するか**を確かめる。V0_SCOPE の開発の規律に従い、テストの数ではなく体験の成立で M1 の完了を判断する。

**Files:**
- Create: `README.md`、`docs/experience-log.md`

- [ ] **Step 1: README を書く**

`README.md`：

````markdown
# Comb

From tangled ideas to decided specs.

Comb is a spec-driven development CLI for AI coding agents. It keeps human-readable specs in your repo and drives a convergence loop: review → answerable questions → recorded decisions → updated specs.

> Status: v0 in development (M1 walking skeleton). See `docs/` for the design.

## Try it (development build)

```bash
npm install
npm run build
npm link            # makes the `comb` command available

cd /path/to/your/project
comb init --language ja
```

Then, in Claude Code, use `/comb:explore` and `/comb:propose`.

## Commands (M1)

| Command | What it does |
|---|---|
| `comb init` | creates `comb/` and installs Claude Code skills |
| `comb new change <id>` | creates a change folder |
| `comb instructions <proposal\|delta\|tasks> --change <id>` | instructions for the agent |
| `comb validate [--change <id>]` | checks specs and changes |
| `comb status [--change <id>]` | artifact states and the next step |

Every command accepts `--json` and returns `{ schema: "comb.v1", command, ok, data, diagnostics }`.
````

- [ ] **Step 2: ビルドして、`comb` コマンドを使えるようにする**

```bash
npm run build && npm link && comb --version
```

Expected: `0.0.1`

- [ ] **Step 3: E1（導入）を確認する**

```bash
PLAYGROUND=$(mktemp -d) && cd "$PLAYGROUND" && git init -q && comb init --language ja && ls .claude/commands/comb
```

Expected: `explore.md`、`propose.md` が並ぶ。続けて、この場所で `claude` を起動し、`/` を入力する。`/comb:explore` と `/comb:propose` が候補に出れば **E1 合格**。

- [ ] **Step 4: E2（提案）を確認する**

同じ Claude Code のセッションで、次を入力する。

```
/comb:propose 個人開発の読書記録アプリに「本の貸し借り」機能を追加したい。友人に本を貸すときに返却期限を設定でき、期限を過ぎたら貸主に通知する。貸出中の本は「貸出中」と表示する。
```

エージェントが終わったら、次を実行する。

```bash
comb status && comb validate --change "$(ls comb/changes | grep -v archive | head -1)" --json
```

合格条件（すべて満たせば **E2 合格**）：

- `validate` が `"ok": true`
- delta に `REQ-<PREFIX>-001` 形式の要件IDが付いている
- 各要件に GIVEN/WHEN/THEN のシナリオがある
- エージェントが `comb/specs/` を直接編集していない（`git status` で確認する）

- [ ] **Step 5: 体験ログに記録する**

`docs/experience-log.md`（新規作成。以降は追記する）：

```markdown
# Experience log

実際の LLM で V0_SCOPE の体験（E1〜E6）を確かめた記録。追記のみ。

| 日付 | 版 | 体験 | 結果 | メモ（つまずいた点、エージェントの逸脱、直すべきこと） |
|---|---|---|---|---|
| YYYY-MM-DD | 0.0.1 | E1 | pass / fail | |
| YYYY-MM-DD | 0.0.1 | E2 | pass / fail | |
```

日付・結果・メモは実際の値で埋める。不合格の項目は、原因（テンプレートの指示不足か、CLI の不備か）をメモに書き、M2 に進む前に直すタスクを `docs/IMPLEMENTATION_PLAN.md` の M1 に追記する。

- [ ] **Step 6: コミットする**

```bash
git add README.md docs/experience-log.md
git commit -m "docs: README and M1 experience log (E1, E2)"
```
