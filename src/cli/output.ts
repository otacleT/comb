import { hasErrors, type Diagnostic } from '../core/diagnostics.js';

export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, INTERNAL: 3 } as const;

export interface Envelope<T> {
  schema: 'comb.v1';
  command: string;
  ok: boolean;
  data: T;
  diagnostics: Diagnostic[];
}

export function envelope<T>(command: string, data: T, diagnostics: Diagnostic[] = []): Envelope<T> {
  return { schema: 'comb.v1', command, ok: !hasErrors(diagnostics), data, diagnostics };
}

export function formatDiagnostic(d: Diagnostic): string {
  const parts = d.target ? [d.target.file, d.target.line, d.target.id].filter((x) => x !== undefined) : [];
  const where = parts.length > 0 ? ` (${parts.join(':')})` : '';
  return `${d.severity}: ${d.code}: ${d.message}${where}${d.fix ? `\n  fix: ${d.fix}` : ''}`;
}

export function render<T>(env: Envelope<T>, json: boolean, human: (data: T) => string): string {
  if (json) return JSON.stringify(env, null, 2);
  return [human(env.data), ...env.diagnostics.map(formatDiagnostic)].filter((l) => l.length > 0).join('\n');
}

export const exitCodeFor = (env: Envelope<unknown>): number => (env.ok ? EXIT.OK : EXIT.FAILED);
