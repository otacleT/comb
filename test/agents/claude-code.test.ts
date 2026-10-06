import { describe, expect, it } from 'vitest';
import { claudeCode, listWorkflows } from '../../src/agents/claude-code.js';
import { splitFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { TEMPLATES_DIR } from '../../src/templates-dir.js';

describe('claude-code adapter', () => {
  it('lists workflows from templates/skills', () => {
    expect(listWorkflows(TEMPLATES_DIR)).toEqual(['clarify', 'explore', 'propose', 'review']);
  });

  it('generates a skill and a slash command per workflow', () => {
    const files = claudeCode.files(TEMPLATES_DIR, '9.9.9');
    expect(files.map((f) => f.path)).toEqual([
      '.claude/skills/comb-clarify/SKILL.md',
      '.claude/commands/comb/clarify.md',
      '.claude/skills/comb-explore/SKILL.md',
      '.claude/commands/comb/explore.md',
      '.claude/skills/comb-propose/SKILL.md',
      '.claude/commands/comb/propose.md',
      '.claude/skills/comb-review/SKILL.md',
      '.claude/commands/comb/review.md',
    ]);
    const skill = files[4]!.content;
    const fm = splitFrontmatter(skill);
    expect(fm.error).toBeNull();
    expect(fm.data).toMatchObject({ name: 'comb-propose', 'allowed-tools': 'Bash(comb:*)' });
    expect(String((fm.data.metadata as { generatedBy: string }).generatedBy)).toMatch(/^comb@9\.9\.9 sha256:[0-9a-f]{16}$/);
    expect(String(fm.data.description)).toContain('Comb change');
    expect(skill).toContain('comb instructions proposal');
    const command = files[5]!.content;
    const commandFm = splitFrontmatter(command);
    expect(commandFm.error).toBeNull();
    expect(commandFm.data).toMatchObject({ 'allowed-tools': 'Bash(comb:*)' });
    expect(command).toContain('generatedBy: comb@9.9.9');
    // The command carries the workflow itself, so no hand-off to the Skill tool (and no extra permission) is needed.
    expect(command).not.toContain('Use the comb-propose skill');
    expect(command).toContain('comb instructions proposal');
    expect(command).toContain('$ARGUMENTS');
  });

  it('generates review and clarify commands that drive the CLI', () => {
    const files = claudeCode.files(TEMPLATES_DIR, '9.9.9');
    const review = files.find((f) => f.path === '.claude/commands/comb/review.md')!.content;
    expect(review).toContain('comb instructions review');
    expect(review).toContain('comb mark-reviewed');
    const clarify = files.find((f) => f.path === '.claude/commands/comb/clarify.md')!.content;
    expect(clarify).toContain('comb instructions clarify');
    expect(clarify).toContain('never answer');
  });
});
