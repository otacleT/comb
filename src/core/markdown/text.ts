export function normalizeText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Re-applies the BOM and CRLF line endings of `raw` (the file on disk) to LF-normalized `text`. */
export function restoreTextStyle(raw: string, text: string): string {
  const lines = raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text;
  return raw.startsWith('\uFEFF') ? `\uFEFF${lines}` : lines;
}
