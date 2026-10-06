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
