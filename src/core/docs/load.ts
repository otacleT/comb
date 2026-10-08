import { join } from 'node:path';
import { hasErrors, type Diagnostic } from '../diagnostics.js';
import { loadArchivedQuestions, loadProject, readIfExists, type Project } from '../project/load.js';
import { loadProfile, type Profile } from './profile.js';
import { docInputs, docRefs, type DocInputs } from './sources.js';
import { docsStatus, type DocsStatus } from './status.js';

export interface DocsContext {
  project: Project;
  profile: Profile;
  inputs: DocInputs;
  status: DocsStatus;
  diagnostics: Diagnostic[];
}

/** The project, its document profile and the state of every output (shared by `comb docs` and `comb instructions docs`). */
export function loadDocs(root: string, templatesDir: string): { context: DocsContext | null; diagnostics: Diagnostic[] } {
  const project = loadProject(root);
  if (hasErrors(project.diagnostics)) return { context: null, diagnostics: project.diagnostics };
  const loaded = loadProfile(join(templatesDir, 'profiles', project.config.documents.profile));
  if (!loaded.profile) return { context: null, diagnostics: loaded.diagnostics };
  const questions = loadArchivedQuestions(root);
  const inputs = docInputs(project, questions);
  const dir = project.config.documents.dir;
  const texts = new Map(loaded.profile.outputs.map((o) => [`${dir}/${o.path}`, readIfExists(join(root, dir, o.path))] as const));
  const { status, diagnostics } = docsStatus(loaded.profile, dir, inputs, docRefs(project, questions), texts);
  return { context: { project, profile: loaded.profile, inputs, status, diagnostics }, diagnostics };
}
