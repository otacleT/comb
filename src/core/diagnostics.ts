export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticTarget {
  file?: string;
  line?: number;
  id?: string;
}

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  target?: DiagnosticTarget;
  fix?: string;
}

export function diag(
  severity: Severity,
  code: string,
  message: string,
  target?: DiagnosticTarget,
  fix?: string,
): Diagnostic {
  const d: Diagnostic = { severity, code, message };
  if (target) d.target = target;
  if (fix) d.fix = fix;
  return d;
}

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === 'error');
