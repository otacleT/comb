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
