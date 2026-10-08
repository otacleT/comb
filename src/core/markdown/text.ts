export function normalizeText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Re-applies the BOM of `raw` (the file on disk) and the line ending most of it uses to LF-normalized `text`. */
export function restoreTextStyle(raw: string, text: string): string {
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lf = (raw.match(/\n/g) ?? []).length - crlf;
  const lines = crlf > lf ? text.replace(/\n/g, '\r\n') : text;
  return raw.startsWith('\uFEFF') ? `\uFEFF${lines}` : lines;
}
