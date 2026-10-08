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

  it('defaults the documents to the solo profile in docs/', () => {
    expect(parseConfig('version: 1\n', 'c').config.documents).toEqual({ profile: 'solo', dir: 'docs' });
    expect(parseConfig('version: 1\ndocuments:\n  dir: site/docs/\n', 'c').config.documents).toEqual({ profile: 'solo', dir: 'site/docs' });
  });

  it('rejects other profiles, and folders outside the project or inside comb/', () => {
    for (const bad of ['documents: 3', 'documents:\n  profile: client-work', 'documents:\n  dir: /tmp/docs', 'documents:\n  dir: ../docs', 'documents:\n  dir: comb/docs', "documents:\n  dir: ''"]) {
      expect(parseConfig(`version: 1\n${bad}\n`, 'c').diagnostics.map((d) => d.code), bad).toEqual(['CONFIG_INVALID']);
    }
  });
});
