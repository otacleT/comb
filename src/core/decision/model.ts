export const QUESTION_STATUSES = ['open', 'answered', 'deferred'] as const;
export const SEVERITIES = ['high', 'medium', 'low'] as const;

export interface Question {
  id: string;
  title: string;
  status: string;
  severity: string;
  refs: string[];
  lens: string | null;
  decision: string | null;
  answer: string | null;
  line: number;
}

export interface Decision {
  id: string;
  title: string;
  date: string | null;
  refs: string[];
  from: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  change: string | null;
  rule: string;
  why: string | null;
  line: number;
}
