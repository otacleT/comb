import { createHash } from 'node:crypto';
import type { ChangeSnapshot } from '../project/load.js';

const short = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Hash of one requirement or section block (trimmed), as stored in review stamps and change bases. */
export const blockHash = (text: string): string => `sha256:${short(text.trim())}`;

const byFile = (a: { file: string }, b: { file: string }): number => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

/** Hash of every delta of the change (texts are LF-normalized at load time). */
export function deltaHash(change: ChangeSnapshot): string {
  const parts = [...change.deltas].sort(byFile).map((d) => `${d.file}\n${d.text}`);
  return `sha256:${short(parts.join('\n\u0000\n'))}`;
}

/**
 * Per-part hashes that let a re-review find what changed: requirements by id, and the delta's sections and
 * purpose as `<capability>#<Section heading>` / `<capability>#Purpose`.
 */
export function requirementHashes(change: ChangeSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of change.deltas) {
    for (const r of [...d.delta.added, ...d.delta.modified]) out[r.id] = blockHash(r.block);
    for (const x of d.delta.removed) out[x.id] = 'removed';
    for (const s of [...d.delta.addedSections, ...d.delta.modifiedSections]) {
      out[`${d.delta.capability}#${s.heading}`] = blockHash(s.content);
    }
    if (d.delta.purpose !== null || d.delta.prefix !== null) {
      out[`${d.delta.capability}#Purpose`] = `sha256:${short(`${d.delta.prefix ?? ''}\n${d.delta.purpose ?? ''}`)}`;
    }
  }
  return out;
}

export function changedSince(recorded: Record<string, string> | null, current: Record<string, string>): string[] | null {
  if (recorded === null) return null;
  const ids = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...ids].filter((id) => recorded[id] !== current[id]).sort();
}
