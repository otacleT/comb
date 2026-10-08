import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitFrontmatter } from '../core/markdown/frontmatter.js';
import { normalizeText } from '../core/markdown/text.js';
import { stampGenerated, type AgentAdapter, type GeneratedFile } from './adapter.js';

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
      // The slash command carries the workflow itself (same template as the skill) instead of
      // handing off to the Skill tool, which would need a separate permission on every use.
      const command = [
        '---',
        `description: ${JSON.stringify(description)}`,
        'allowed-tools: Bash(comb:*)',
        '---',
        `<!-- generatedBy: comb@${version} -->`,
        '',
        body.trimEnd(),
        '',
        "## The user's request",
        '',
        '$ARGUMENTS',
        '',
      ].join('\n');
      return [
        { path: `.claude/skills/comb-${wf}/SKILL.md`, content: stampGenerated(skill) },
        { path: `.claude/commands/comb/${wf}.md`, content: stampGenerated(command) },
      ];
    });
  },
  existing(root: string): string[] {
    const out: string[] = [];
    const skills = join(root, '.claude', 'skills');
    if (existsSync(skills)) {
      for (const d of readdirSync(skills)) if (d.startsWith('comb-') && existsSync(join(skills, d, 'SKILL.md'))) out.push(`.claude/skills/${d}/SKILL.md`);
    }
    const commands = join(root, '.claude', 'commands', 'comb');
    if (existsSync(commands)) for (const f of readdirSync(commands)) if (f.endsWith('.md')) out.push(`.claude/commands/comb/${f}`);
    return out.sort();
  },
};
