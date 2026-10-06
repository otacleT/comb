import { describe, expect, it } from 'vitest';
import { diag, hasErrors } from '../../src/core/diagnostics.js';
import { envelope, exitCodeFor, render } from '../../src/cli/output.js';

describe('envelope', () => {
  it('is ok when there are only warnings', () => {
    const env = envelope('validate', { n: 1 }, [diag('warning', 'SCENARIO_DROPPED', 'x')]);
    expect(env).toEqual({
      schema: 'comb.v1',
      command: 'validate',
      ok: true,
      data: { n: 1 },
      diagnostics: [{ severity: 'warning', code: 'SCENARIO_DROPPED', message: 'x' }],
    });
    expect(exitCodeFor(env)).toBe(0);
  });

  it('is not ok when there is an error', () => {
    const ds = [diag('error', 'SPEC_PARSE', 'bad', { file: 'a.md', line: 3 }, 'fix it')];
    expect(hasErrors(ds)).toBe(true);
    const env = envelope('validate', null, ds);
    expect(env.ok).toBe(false);
    expect(exitCodeFor(env)).toBe(1);
  });
});

describe('render', () => {
  it('renders JSON when asked', () => {
    const env = envelope('x', { a: 1 });
    expect(JSON.parse(render(env, true, () => 'human'))).toEqual(env);
  });

  it('renders the human line followed by diagnostics', () => {
    const env = envelope('x', { a: 1 }, [diag('error', 'SPEC_PARSE', 'bad', { file: 'a.md', line: 3 }, 'fix it')]);
    expect(render(env, false, (d) => `a=${d.a}`)).toBe('a=1\nerror: SPEC_PARSE: bad (a.md:3)\n  fix: fix it');
  });
});
