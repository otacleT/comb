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
