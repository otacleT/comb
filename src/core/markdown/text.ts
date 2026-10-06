export function normalizeText(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
