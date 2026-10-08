import { parse as parseYaml } from 'yaml';

export interface Frontmatter {
  data: Record<string, unknown>;
  bodyOffset: number;
  error: string | null;
}

/** The YAML error's first line, with its line number counted in the file (the YAML starts on line 2). */
function yamlError(e: unknown): string {
  const message = ((e as Error).message.split('\n')[0] ?? '').replace(/ at line \d+, column \d+:?$/, '');
  const pos = (e as { linePos?: { line: number; col: number }[] }).linePos?.[0];
  return pos ? `${message} (line ${pos.line + 1}, column ${pos.col})` : message;
}

export function splitFrontmatter(text: string): Frontmatter {
  if (!text.startsWith('---\n')) return { data: {}, bodyOffset: 0, error: null };
  const closing = /^---[ \t]*$/gm;
  closing.lastIndex = 4;
  const m = closing.exec(text);
  if (!m) return { data: {}, bodyOffset: 0, error: 'unterminated frontmatter' };
  const end = m.index + m[0].length;
  const bodyOffset = text[end] === '\n' ? end + 1 : end;
  const yamlText = text.slice(4, m.index);
  try {
    const parsed: unknown = yamlText.trim() === '' ? {} : parseYaml(yamlText);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, bodyOffset, error: 'frontmatter must be a YAML mapping' };
    }
    return { data: parsed as Record<string, unknown>, bodyOffset, error: null };
  } catch (e) {
    return { data: {}, bodyOffset, error: yamlError(e) };
  }
}
