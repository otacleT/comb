import { describe, expect, it } from 'vitest';
import { defaultConfig, parseConfig, renderConfig } from '../../../src/core/project/config.js';

describe('config', () => {
  it('round-trips the default config', () => {
    const { config, diagnostics } = parseConfig(renderConfig(defaultConfig('ja')), 'comb/config.yaml');
    expect(diagnostics).toEqual([]);
    expect(config).toEqual(defaultConfig('ja'));
  });

  it('fills defaults for omitted keys', () => {
    const { config } = parseConfig('version: 1\nlanguage: ja\n', 'c');
    expect(config.review).toEqual({ lenses: ['consistency', 'formalization', 'edge-cases', 'change-impact'], batch: 3 });
  });

  it('reports invalid values', () => {
    const { diagnostics } = parseConfig(
      `version: 2\nlanguage: 3\nreview:\n  lenses: [nope]\n  batch: 0\nrules:\n  delta: x\ncontext: "${'a'.repeat(16 * 1024 + 1)}"\n`,
      'c',
    );
    expect(diagnostics.map((d) => d.code)).toEqual(Array(6).fill('CONFIG_INVALID'));
  });

  it('reports a review key that is empty or not a mapping instead of crashing', () => {
    expect(parseConfig('version: 1\nreview:\n', 'c').diagnostics.map((d) => d.code)).toEqual(['CONFIG_INVALID']);
    expect(parseConfig('version: 1\nreview: 3\n', 'c').diagnostics.map((d) => d.code)).toEqual(['CONFIG_INVALID']);
  });

  it('reports broken YAML', () => {
    expect(parseConfig('version: [', 'c').diagnostics[0]!.code).toBe('CONFIG_INVALID');
  });
});
