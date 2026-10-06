import { isSeq, parseDocument } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import { endsOpen, headingBlocks, type HeadingBlock } from '../markdown/blocks.js';
import { splitFrontmatter } from '../markdown/frontmatter.js';
import type { Capability, Delta, Section } from '../spec/model.js';
import { parseSpec } from '../spec/parse-spec.js';

export interface ApplyResult {
  text: string;
  /** Requirement ids and "Section: <heading>" keys whose change was already in the spec. */
  skipped: string[];
  diagnostics: Diagnostic[];
}

export const sectionKey = (heading: string): string => `Section: ${heading}`;

/** A delta Section must not be named like the Requirements heading, or the requirements would be hidden. */
const RESERVED_SECTIONS = new Set(['Requirements']);

/** Replaces text[start, end) with `insert` (deletes it when empty), leaving one blank line before what follows. */
function splice(text: string, start: number, end: number, insert: string): string {
  const rest = text.slice(end);
  if (insert === '') return text.slice(0, start) + rest;
  return `${text.slice(0, start)}${insert}\n${rest === '' ? '' : '\n'}${rest}`;
}

/** Adds `insert` as a new block at offset `at`, with one blank line on each side. */
function appendAt(text: string, at: number, insert: string): string {
  const rest = text.slice(at);
  return `${text.slice(0, at).replace(/\n*$/, '')}\n\n${insert}\n${rest === '' ? '' : '\n'}${rest}`;
}

const topBlocks = (text: string): HeadingBlock[] =>
  headingBlocks(text, splitFrontmatter(text).bodyOffset).filter((b) => b.depth === 2);

/** Adds ids to the frontmatter `retired` list, keeping the other keys and their comments. */
export function withRetired(text: string, ids: string[]): string {
  if (ids.length === 0) return text;
  const fm = splitFrontmatter(text);
  if (fm.bodyOffset === 0) return `---\nretired: [ ${ids.join(', ')} ]\n---\n${text}`;
  const doc = parseDocument(text.slice(4, text.lastIndexOf('---', fm.bodyOffset - 1)));
  const data = (doc.toJS() ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data.retired) ? data.retired.filter((x): x is string => typeof x === 'string') : [];
  for (const id of ids) if (!list.includes(id)) list.push(id);
  const node = doc.createNode(list);
  if (isSeq(node)) node.flow = true;
  doc.set('retired', node);
  return `---\n${doc.toString()}---\n${text.slice(fm.bodyOffset)}`;
}

function newCapabilityText(delta: Delta, sections: Section[]): string {
  const blocks = [
    `---\nprefix: ${delta.prefix ?? ''}\n---\n# ${delta.capability}`,
    `## Purpose\n${(delta.purpose ?? '').trim()}`,
    ...sections.map((s) => `## ${s.heading}\n${s.content}`),
    ['## Requirements', ...delta.added.map((r) => r.block.trim())].join('\n\n'),
  ];
  return `${blocks.join('\n\n')}\n`;
}

/**
 * Applies one delta to one canonical spec by replacing text ranges (DESIGN §5.3), in the order
 * REMOVED → MODIFIED → ADDED → Purpose → MODIFIED Sections → ADDED Sections. Text outside the touched
 * blocks keeps its bytes. An operation whose result is already present is skipped.
 */
export function applyDelta(baseText: string | null, delta: Delta, file: string): ApplyResult {
  const diagnostics: Diagnostic[] = [];
  const skipped: string[] = [];
  const fail = (code: string, message: string, id: string): void => {
    diagnostics.push(diag('error', code, message, { file, id }));
  };
  const usable = (list: Section[]): Section[] =>
    list.filter((s) => {
      if (!RESERVED_SECTIONS.has(s.heading)) return true;
      fail('SPEC_PARSE', `a delta section cannot be named "${s.heading}"`, sectionKey(s.heading));
      return false;
    });
  const addedSections = usable(delta.addedSections);
  const modifiedSections = usable(delta.modifiedSections);

  if (baseText === null) {
    for (const r of delta.modified) fail('DELTA_TARGET_MISSING', `${r.id} is not in the spec`, r.id);
    for (const x of delta.removed) fail('DELTA_TARGET_MISSING', `${x.id} is not in the spec`, x.id);
    for (const s of modifiedSections) fail('DELTA_TARGET_MISSING', `section "${s.heading}" is not in the spec`, sectionKey(s.heading));
    return { text: newCapabilityText(delta, addedSections), skipped, diagnostics };
  }

  let text = baseText;
  const spec = (): Capability => parseSpec(text, delta.capability, file).capability;

  const retired: string[] = [];
  for (const x of delta.removed) {
    const cap = spec();
    const r = cap.requirements.find((q) => q.id === x.id);
    if (r) {
      text = splice(text, r.start, r.end, '');
      retired.push(x.id);
    } else if (cap.retired.includes(x.id)) skipped.push(x.id);
    else fail('DELTA_TARGET_MISSING', `${x.id} is not in the spec`, x.id);
  }
  text = withRetired(text, retired);

  for (const m of delta.modified) {
    const r = spec().requirements.find((q) => q.id === m.id);
    if (!r) fail('DELTA_TARGET_MISSING', `${m.id} is not in the spec`, m.id);
    else if (r.block.trim() === m.block.trim()) skipped.push(m.id);
    else text = splice(text, r.start, r.end, m.block.trim());
  }

  for (const a of delta.added) {
    const r = spec().requirements.find((q) => q.id === a.id);
    if (r) {
      if (r.block.trim() === a.block.trim()) skipped.push(a.id);
      else fail('DELTA_ID_EXISTS', `${a.id} already exists with different text`, a.id);
      continue;
    }
    const requirements = topBlocks(text).find((b) => b.text === 'Requirements');
    text = requirements ? appendAt(text, requirements.end, a.block.trim()) : appendAt(text, text.length, `## Requirements\n\n${a.block.trim()}`);
  }

  const setSection = (heading: string, content: string, mode: 'modify' | 'add' | 'upsert'): void => {
    const current = spec().sections.find((s) => s.heading === heading);
    const block = `## ${heading}\n${content.trim()}`;
    if (current) {
      if (current.content === content.trim()) skipped.push(sectionKey(heading));
      else if (mode === 'add') fail('DELTA_ID_EXISTS', `section "${heading}" already exists with different text`, sectionKey(heading));
      else text = splice(text, current.start, current.end, block);
      return;
    }
    if (mode === 'modify') {
      fail('DELTA_TARGET_MISSING', `section "${heading}" is not in the spec`, sectionKey(heading));
      return;
    }
    const tops = topBlocks(text);
    const anchor = heading === 'Purpose' ? tops[0] : tops.find((b) => b.text === 'Requirements');
    text = anchor ? splice(text, anchor.start, anchor.start, block) : appendAt(text, text.length, block);
  };
  if (delta.purpose !== null) setSection('Purpose', delta.purpose, 'upsert');
  for (const s of modifiedSections) setSection(s.heading, s.content, 'modify');
  for (const s of addedSections) setSection(s.heading, s.content, 'add');

  return { text: text.replace(/\n*$/, '\n'), skipped, diagnostics };
}

const sameSet = (actual: string[], expected: Set<string>): boolean => {
  const got = new Set(actual);
  return got.size === expected.size && [...got].every((x) => expected.has(x));
};

/**
 * The merged spec must have exactly the base's requirements minus REMOVED plus ADDED, and the base's sections plus the
 * added ones. Anything else means text was hidden (an unclosed fence or comment) or lost, so the merge must not be written.
 */
export function checkMerged(baseText: string | null, delta: Delta, mergedText: string, file: string): Diagnostic[] {
  const base = baseText === null ? null : parseSpec(baseText, delta.capability, file).capability;
  const removed = new Set(delta.removed.map((x) => x.id));
  const expectedIds = new Set([...(base?.requirements ?? []).map((r) => r.id).filter((id) => !removed.has(id)), ...delta.added.map((r) => r.id)]);
  const expectedSections = new Set([
    ...(base?.sections ?? []).map((s) => s.heading),
    ...delta.addedSections.map((s) => s.heading).filter((h) => !RESERVED_SECTIONS.has(h)),
    ...(delta.purpose !== null || base === null ? ['Purpose'] : []),
  ]);
  const merged = parseSpec(mergedText, delta.capability, file).capability;
  const ids = merged.requirements.map((r) => r.id);
  const sections = merged.sections.map((s) => s.heading);
  if (sameSet(ids, expectedIds) && sameSet(sections, expectedSections) && !endsOpen(mergedText)) return [];
  return [
    diag('error', 'SPEC_PARSE',
      `merging would leave ${delta.capability} with requirements [${ids.join(', ')}] and sections [${sections.join(', ')}] instead of [${[...expectedIds].join(', ')}] and [${[...expectedSections].join(', ')}]`,
      { file }, 'Look for a code fence (```) or HTML comment that is never closed, in the delta or in the spec'),
  ];
}
