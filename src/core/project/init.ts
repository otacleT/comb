import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GENERATED_MARKER, isUnmodifiedGenerated, type AgentAdapter } from '../../agents/adapter.js';
import { normalizeText } from '../markdown/text.js';
import { defaultConfig, renderConfig } from './config.js';

export interface InitResult {
  created: string[];
  updated: string[];
  skipped: string[];
  /** Comb-generated files the user edited; kept as they are. */
  modified: string[];
}

type Put = (relPath: string, content: string, generated: boolean) => void;

const emptyResult = (): InitResult => ({ created: [], updated: [], skipped: [], modified: [] });

/** Writes a file unless that would overwrite a user file or a generated file the user edited. */
function writer(root: string, result: InitResult): Put {
  return (relPath, content, generated) => {
    const p = join(root, relPath);
    if (!existsSync(p)) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
      result.created.push(relPath);
      return;
    }
    const existing = readFileSync(p, 'utf8');
    if (normalizeText(existing) === content) {
      result.skipped.push(relPath);
      return;
    }
    if (generated && isUnmodifiedGenerated(existing)) {
      writeFileSync(p, content);
      result.updated.push(relPath);
      return;
    }
    if (generated && existing.includes(GENERATED_MARKER)) {
      result.modified.push(relPath);
      return;
    }
    result.skipped.push(relPath);
  };
}

interface AgentOptions {
  version: string;
  templatesDir: string;
  agents: AgentAdapter[];
}

const putAgentFiles = (put: Put, opts: AgentOptions): void => {
  for (const agent of opts.agents) {
    for (const f of agent.files(opts.templatesDir, opts.version)) put(f.path, f.content, true);
  }
};

export function initProject(root: string, opts: AgentOptions & { language: string }): InitResult {
  const result = emptyResult();
  const put = writer(root, result);
  const config = defaultConfig(opts.language);
  config.agents = opts.agents.map((a) => a.id);
  put('comb/config.yaml', renderConfig(config), false);
  put('comb/decisions.md', '# Decisions\n', false);
  put('comb/specs/.gitkeep', '', false);
  put('comb/changes/archive/.gitkeep', '', false);
  putAgentFiles(put, opts);
  return result;
}

/** S3 (`comb update`): regenerates the agent files only. The config, the specs and files the user edited stay as they are. */
export function updateAgentFiles(root: string, opts: AgentOptions): InitResult {
  const result = emptyResult();
  putAgentFiles(writer(root, result), opts);
  return result;
}
