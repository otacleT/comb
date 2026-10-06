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
