import { createHash } from 'node:crypto';
import type { ChangeSnapshot } from '../project/load.js';

const short = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Hash of every delta of the change (texts are LF-normalized at load time). */
export function deltaHash(change: ChangeSnapshot): string {
  const parts = [...change.deltas].sort((a, b) => a.file.localeCompare(b.file)).map((d) => `${d.file}\n${d.text}`);
  return `sha256:${short(parts.join('\n\u0000\n'))}`;
}

export function requirementHashes(change: ChangeSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of change.deltas) {
    for (const r of [...d.delta.added, ...d.delta.modified]) out[r.id] = `sha256:${short(r.block.trim())}`;
    for (const x of d.delta.removed) out[x.id] = 'removed';
  }
  return out;
}

export function changedSince(recorded: Record<string, string> | null, current: Record<string, string>): string[] | null {
  if (recorded === null) return null;
  const ids = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...ids].filter((id) => recorded[id] !== current[id]).sort();
}
