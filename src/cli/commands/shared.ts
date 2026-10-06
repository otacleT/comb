import { diag } from '../../core/diagnostics.js';
import { findRoot } from '../../core/project/load.js';
import type { CliContext } from '../app.js';
import { envelope, EXIT, exitCodeFor, render, type Envelope } from '../output.js';

export function usageError(ctx: CliContext, command: string, json: boolean, code: string, message: string, fix?: string): void {
  ctx.out(render(envelope(command, null, [diag('error', code, message, undefined, fix)]), json, () => ''));
  ctx.setCode(EXIT.USAGE);
}

export function requireRoot(ctx: CliContext, command: string, json: boolean): string | null {
  const root = findRoot(ctx.cwd);
  if (!root) {
    usageError(ctx, command, json, 'NOT_A_COMB_PROJECT', 'no comb/config.yaml in this directory or its parents', 'Run "comb init" first');
  }
  return root;
}

export function finish<T>(ctx: CliContext, env: Envelope<T>, json: boolean, human: (data: T) => string): void {
  ctx.out(render(env, json, human));
  ctx.setCode(exitCodeFor(env));
}
