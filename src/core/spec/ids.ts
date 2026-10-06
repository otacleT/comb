export const REQ_ID_RE = /^REQ-([A-Z][A-Z0-9]*)-(\d{3,})$/;
export const DECISION_REF_RE = /\bD-\d+\b/g;

export const isRequirementId = (id: string): boolean => REQ_ID_RE.test(id);

export function prefixOf(id: string): string | null {
  const m = REQ_ID_RE.exec(id);
  return m ? (m[1] as string) : null;
}

export function parseRequirementHeading(text: string): { id: string; title: string } | null {
  const m = /^Requirement:\s*(\S+)?\s*(.*)$/.exec(text);
  if (!m) return null;
  return { id: m[1] ?? '', title: (m[2] ?? '').trim() };
}

export function nextRequirementId(prefix: string, used: Iterable<string>): string {
  let max = 0;
  for (const id of used) {
    const m = REQ_ID_RE.exec(id);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `REQ-${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function defaultPrefix(capability: string): string {
  const first = (capability.split('-')[0] ?? capability).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]/.test(first) ? first : `C${first}`;
}
