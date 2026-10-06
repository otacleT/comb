export interface GeneratedFile {
  path: string;
  content: string;
}

export interface AgentAdapter {
  id: string;
  files(templatesDir: string, version: string): GeneratedFile[];
}

/** Every file Comb generates contains this marker; files without it are user-owned. */
export const GENERATED_MARKER = 'generatedBy: comb@';
