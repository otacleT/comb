import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { diag, type Diagnostic } from '../diagnostics.js';
import { normalizeText } from '../markdown/text.js';

export const DOC_SOURCES = ['config', 'specs', 'decisions', 'open-questions'] as const;
export type DocSource = (typeof DOC_SOURCES)[number];

export interface DocOutput {
  id: string;
  /** Relative to `documents.dir`. */
  path: string;
  /** The template text. */
  template: string;
  audience: string;
  sources: DocSource[];
}

export interface Profile {
  id: string;
  dir: string;
  /** The writing discipline (SKILL.md), handed to the agent by `comb instructions docs`. */
  skill: string;
  outputs: DocOutput[];
}

/** Reads a document profile folder: profile.yaml, SKILL.md and the templates its outputs name. */
export function loadProfile(dir: string): { profile: Profile | null; diagnostics: Diagnostic[] } {
  const bad = (message: string): { profile: null; diagnostics: Diagnostic[] } => ({
    profile: null,
    diagnostics: [diag('error', 'CONFIG_INVALID', `document profile ${dir}: ${message}`)],
  });
  const file = join(dir, 'profile.yaml');
  if (!existsSync(file)) return bad('profile.yaml not found');
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, 'utf8'));
  } catch (e) {
    return bad(`invalid YAML: ${(e as Error).message}`);
  }
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.type !== 'comb.document-profile') return bad('"type" must be comb.document-profile');
  if (r.version !== 1) return bad('"version" must be 1');
  if (typeof r.id !== 'string' || !Array.isArray(r.outputs) || r.outputs.length === 0) return bad('"id" and a non-empty "outputs" list are required');
  const skillFile = join(dir, 'SKILL.md');
  if (!existsSync(skillFile)) return bad('SKILL.md not found');
  const outputs: DocOutput[] = [];
  for (const item of r.outputs as unknown[]) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.path !== 'string' || typeof o.template !== 'string' || typeof o.audience !== 'string') {
      return bad('every output needs "id", "path", "template" and "audience"');
    }
    const sources = Array.isArray(o.sources) ? (o.sources as unknown[]) : [];
    if (sources.length === 0 || sources.some((s) => !(DOC_SOURCES as readonly unknown[]).includes(s))) {
      return bad(`output ${o.id}: "sources" must be a non-empty list of ${DOC_SOURCES.join(', ')}`);
    }
    const templateFile = join(dir, o.template);
    if (!existsSync(templateFile)) return bad(`output ${o.id}: template ${o.template} not found`);
    outputs.push({ id: o.id, path: o.path, template: normalizeText(readFileSync(templateFile, 'utf8')), audience: o.audience, sources: sources as DocSource[] });
  }
  return { profile: { id: r.id, dir, skill: normalizeText(readFileSync(skillFile, 'utf8')), outputs }, diagnostics: [] };
}
