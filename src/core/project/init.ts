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
