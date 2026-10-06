import { join } from 'node:path';
import { diag, hasErrors, type Diagnostic } from '../diagnostics.js';
import { parseDecisions } from '../decision/parse.js';
import { appendDecisions, assignPermanentIds, rewriteDecisionRefs } from '../decision/permanent.js';
import type { ChangeSnapshot, LoadedSpec, Project } from '../project/load.js';
import { paths, rel } from '../project/paths.js';
import { parseDelta } from '../spec/parse-delta.js';
import { parseSpec } from '../spec/parse-spec.js';
import { computeStatus } from '../workflow/status.js';
import { applyDelta, checkMerged } from './apply-delta.js';
import { validateChange, validateProject } from './validate-change.js';

export interface ArchiveOptions {
  yes: boolean;
  allowDroppedScenarios: boolean;
  allowBaseDrift: boolean;
}

export interface ArchiveWrite {
  /** Root-relative. Files of the change use their path before the change folder moves. */
  file: string;
  text: string;
}

export interface CapabilitySummary {
  capability: string;
  created: boolean;
  added: string[];
  modified: string[];
  removed: string[];
  sections: string[];
}

export interface ArchivePlan {
  change: string;
  from: string;
  to: string;
  writes: ArchiveWrite[];
  decisions: { local: string; permanent: string }[];
  capabilities: CapabilitySummary[];
}

const blocked = (message: string, fix: string): Diagnostic => diag('error', 'ARCHIVE_BLOCKED', message, undefined, fix);

/** The archive conditions of DESIGN §5.1, one ARCHIVE_BLOCKED per unmet condition. */
export function archiveGates(change: ChangeSnapshot, validation: Diagnostic[], opts: ArchiveOptions): Diagnostic[] {
  const status = computeStatus(change, validation);
  const review = status.artifacts.find((a) => a.id === 'review');
  const out: Diagnostic[] = [];
  if (review?.state === 'stale') out.push(blocked(`the review is stale (${review.detail ?? 'the delta changed'})`, 'Run /comb:review again'));
  if (review?.state === 'missing' && !opts.yes) out.push(blocked('the change has no review', 'Run /comb:review, or pass --yes to archive without one'));
  if (status.questions.open > 0) out.push(blocked(`${status.questions.open} question(s) are still open`, 'Answer or defer them with /comb:clarify'));
  if (!opts.yes && (status.tasks.total === 0 || status.tasks.done < status.tasks.total)) {
    out.push(blocked(`${status.tasks.done}/${status.tasks.total} tasks are done`, 'Finish them, or pass --yes'));
  }
  if (!opts.allowDroppedScenarios && validation.some((d) => d.code === 'SCENARIO_DROPPED')) {
    out.push(blocked('a MODIFIED requirement drops scenarios', 'Restore them, or pass --allow-dropped-scenarios'));
  }
  if (!opts.allowBaseDrift && validation.some((d) => d.code === 'BASE_DRIFT')) {
    out.push(blocked('the spec changed under this change after it was proposed', 'Update the delta to the current spec, then pass --allow-base-drift'));
  }
  return out;
}

/** Everything `comb archive` would write, or the reasons it must not (DESIGN §5.3 steps 1–6). Pure: no file is touched. */
export function planArchive(
  project: Project,
  change: ChangeSnapshot,
  all: ChangeSnapshot[],
  opts: ArchiveOptions,
  today: string,
): { plan: ArchivePlan | null; diagnostics: Diagnostic[] } {
  const validation = [...validateProject(project), ...validateChange(project, change, all)];
  if (hasErrors(validation)) return { plan: null, diagnostics: validation };
  const warnings = validation.filter((d) => d.severity !== 'error');
  const gates = archiveGates(change, validation, opts);
  if (gates.length > 0) return { plan: null, diagnostics: [...gates, ...warnings] };

  const root = project.root;
  const decisionsFile = rel(root, paths.decisions(root));
  const changeFile = (name: 'questions' | 'decisions'): string => rel(root, paths.changeFile(root, change.id, name));
  const local = parseDecisions(change.files.decisions ?? '', changeFile('decisions')).decisions;
  const canonical = parseDecisions(project.decisionsText ?? '', decisionsFile).decisions;
  const ids = assignPermanentIds(local, canonical);
  if (hasErrors(ids.diagnostics)) return { plan: null, diagnostics: ids.diagnostics };
  const rewrite = (text: string): string => rewriteDecisionRefs(text, ids.map);

  const diagnostics: Diagnostic[] = [...warnings];
  const writes: ArchiveWrite[] = [];
  const write = (file: string, before: string | null, text: string): void => {
    if (before !== text) writes.push({ file, text });
  };
  const specs = new Map<string, LoadedSpec>(project.specs);
  const capabilities: CapabilitySummary[] = [];
  for (const d of change.deltas) {
    const deltaText = rewrite(d.text);
    write(d.file, d.text, deltaText);
    const delta = parseDelta(deltaText, d.capability, d.file).delta;
    const base = project.specs.get(d.capability) ?? null;
    const applied = applyDelta(base?.text ?? null, delta, d.file);
    diagnostics.push(...applied.diagnostics, ...checkMerged(base?.text ?? null, delta, applied.text, d.file));
    const path = paths.spec(root, d.capability);
    const file = rel(root, path);
    write(file, base?.text ?? null, applied.text);
    const parsed = parseSpec(applied.text, d.capability, file);
    specs.set(d.capability, { name: d.capability, path, file, text: applied.text, capability: parsed.capability, diagnostics: parsed.diagnostics });
    capabilities.push({
      capability: d.capability,
      created: base === null,
      added: delta.added.map((r) => r.id),
      modified: delta.modified.map((r) => r.id),
      removed: delta.removed.map((x) => x.id),
      sections: [...delta.modifiedSections, ...delta.addedSections].map((s) => s.heading),
    });
  }
  for (const name of ['questions', 'decisions'] as const) {
    const text = change.files[name];
    if (text !== undefined) write(changeFile(name), text, rewrite(text));
  }
  const log = appendDecisions(project.decisionsText, rewrite(change.files.decisions ?? ''), change.id);
  diagnostics.push(...log.diagnostics);
  if (log.text !== null) write(decisionsFile, project.decisionsText, log.text);

  // DESIGN §5.3 step 6: the merged canonical files must still validate.
  diagnostics.push(...validateProject({ ...project, specs, decisionsText: log.text }).filter((d) => d.severity === 'error'));
  if (hasErrors(diagnostics)) return { plan: null, diagnostics };
  return {
    plan: {
      change: change.id,
      from: rel(root, change.dir),
      to: rel(root, join(paths.archiveDir(root), `${today}-${change.id}`)),
      writes,
      decisions: Object.entries(ids.map).map(([l, p]) => ({ local: l, permanent: p })),
      capabilities,
    },
    diagnostics,
  };
}
