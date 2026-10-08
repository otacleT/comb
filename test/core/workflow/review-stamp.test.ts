import { describe, expect, it } from 'vitest';
import { readReviewStamp, stampReview } from '../../../src/core/workflow/review-stamp.js';

describe('review stamp', () => {
  it('reads nothing from a missing or unstamped review', () => {
    expect(readReviewStamp(undefined)).toEqual({ reviewed: null, requirements: null, error: null });
    expect(readReviewStamp('# Review\n')).toEqual({ reviewed: null, requirements: null, error: null });
  });

  it('adds a frontmatter to a review without one, keeping the body', () => {
    const stamped = stampReview('# Review: c\n\nbody\n', 'sha256:aaaa', { 'REQ-A-001': 'sha256:bbbb' })!;
    expect(stamped.endsWith('# Review: c\n\nbody\n')).toBe(true);
    expect(readReviewStamp(stamped)).toEqual({ reviewed: 'sha256:aaaa', requirements: { 'REQ-A-001': 'sha256:bbbb' }, error: null });
  });

  it('keeps other frontmatter keys and replaces an old stamp', () => {
    const once = stampReview('---\nlenses: [consistency]\n---\n# R\n', 'sha256:1', {})!;
    const twice = stampReview(once, 'sha256:2', { 'REQ-A-001': 'removed' })!;
    expect(twice).toContain('lenses:');
    expect(readReviewStamp(twice)).toEqual({ reviewed: 'sha256:2', requirements: { 'REQ-A-001': 'removed' }, error: null });
    expect(twice.endsWith('# R\n')).toBe(true);
  });

  it('refuses a broken frontmatter', () => {
    expect(stampReview('---\nlenses: [x]\n# R\n', 'sha256:1', {})).toBeNull();
  });
});
