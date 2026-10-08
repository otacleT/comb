export interface DocRefs {
  requirements: ReadonlySet<string>;
  retired: ReadonlySet<string>;
  decisions: ReadonlySet<string>;
  /** Change id → the question ids of its archived questions.md. */
  questions: ReadonlyMap<string, ReadonlySet<string>>;
}
