import { describe, expect, it } from 'vitest';
import { childBlocks, headingBlocks } from '../../src/core/markdown/blocks.js';
import { splitFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { lineOf, normalizeText, restoreTextStyle } from '../../src/core/markdown/text.js';

describe('normalizeText', () => {
  it('strips the BOM and converts CRLF/CR to LF', () => {
    expect(normalizeText('\uFEFFa\r\nb\rc')).toBe('a\nb\nc');
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

describe('restoreTextStyle', () => {
  it('re-applies the BOM and CRLF line endings of the original file', () => {
    expect(restoreTextStyle('\uFEFFa\r\nb\r\n', 'x\ny\n')).toBe('\uFEFFx\r\ny\r\n');
    expect(restoreTextStyle('a\nb\n', 'x\ny\n')).toBe('x\ny\n');
  });

  it('follows the line ending most of the file uses', () => {
    expect(restoreTextStyle('a\nb\r\nc\nd\n', 'x\ny\n')).toBe('x\ny\n');
    expect(restoreTextStyle('a\r\nb\r\nc\n', 'x\ny\n')).toBe('x\r\ny\r\n');
  });
});
