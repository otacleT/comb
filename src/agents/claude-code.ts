import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitFrontmatter } from '../core/markdown/frontmatter.js';
import { normalizeText } from '../core/markdown/text.js';
import type { AgentAdapter, GeneratedFile } from './adapter.js';

export function listWorkflows(templatesDir: string): string[] {
  return readdirSync(join(templatesDir, 'skills'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort();
}

export function splitTemplate(raw: string): { description: string; body: string } {
  const text = normalizeText(raw);
  const fm = splitFrontmatter(text);
  const description = typeof fm.data.description === 'string' ? fm.data.description : '';
  return { description, body: text.slice(fm.bodyOffset).trimStart() };
}

export const claudeCode: AgentAdapter = {
  id: 'claude-code',
  files(templatesDir: string, version: string): GeneratedFile[] {
    return listWorkflows(templatesDir).flatMap((wf) => {
      const { description, body } = splitTemplate(readFileSync(join(templatesDir, 'skills', `${wf}.md`), 'utf8'));
      const skill = [
        '---',
        `name: comb-${wf}`,
        `description: ${JSON.stringify(description)}`,
        'allowed-tools: Bash(comb:*)',
        'metadata:',
        `  generatedBy: comb@${version}`,
        '---',
        '',
        body,
      ].join('\n');
      const command = [
        '---',
        `description: ${JSON.stringify(description)}`,
        '---',
        `<!-- generatedBy: comb@${version} -->`,
        '',
        `Use the comb-${wf} skill for this request.`,
        '',
        '$ARGUMENTS',
        '',
      ].join('\n');
      return [
        { path: `.claude/skills/comb-${wf}/SKILL.md`, content: skill },
        { path: `.claude/commands/comb/${wf}.md`, content: command },
      ];
    });
  },
};
