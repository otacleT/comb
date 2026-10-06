import { stringify } from 'yaml';
import { splitFrontmatter } from '../markdown/frontmatter.js';

export interface ReviewStamp {
  reviewed: string | null;
  requirements: Record<string, string> | null;
}

export function readReviewStamp(text: string | undefined): ReviewStamp {
  if (text === undefined) return { reviewed: null, requirements: null };
  const fm = splitFrontmatter(text);
  const reviewed = typeof fm.data.reviewed === 'string' ? fm.data.reviewed : null;
  const raw = fm.data.requirements;
  const requirements =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every((v) => typeof v === 'string')
      ? (raw as Record<string, string>)
      : null;
  return { reviewed, requirements };
}

/** Writes `reviewed` and `requirements` into the frontmatter, keeping other keys and the body. */
export function stampReview(text: string, reviewed: string, requirements: Record<string, string>): string | null {
  const fm = splitFrontmatter(text);
  if (fm.error) return null;
  return `---\n${stringify({ ...fm.data, reviewed, requirements })}---\n${text.slice(fm.bodyOffset)}`;
}
