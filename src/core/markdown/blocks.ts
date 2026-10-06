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

/** True when `text` ends inside an unclosed code fence or HTML block, which would swallow whatever follows it. */
export function endsOpen(text: string): boolean {
  const probe = 'comb-probe-heading';
  return headingBlocks(`${text.replace(/\n*$/, '')}\n\n## ${probe}\n`).at(-1)?.text !== probe;
}

export function childBlocks(blocks: HeadingBlock[], parent: HeadingBlock, depth: number): HeadingBlock[] {
  return blocks.filter((b) => b.depth === depth && b.start >= parent.contentStart && b.start < parent.end);
}
