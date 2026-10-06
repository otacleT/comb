Review change "{{change}}". Write review.md at outputPath and the questions to {{questionsPath}}. Prose in {{language}}; headings, field names and keywords stay in English.

1. Read every file in context.readFiles: the base specs, the project decisions, the proposal, the delta(s), and this change's existing questions and decisions.
2. If context.changedSinceReview is a list, this is a re-review: focus on the requirements, sections (`<capability>#<Section>`) and purposes (`<capability>#Purpose`) it names and everything they affect; if the list is empty, re-review the whole delta. Keep earlier findings that still apply, and never re-ask an answered question.
3. Apply every lens in `lenses` (their full definitions are included). Record the findings per lens in review.md.
4. Turn the findings into questions in {{questionsPath}}, following the template:
   - one question per root cause (merge findings that share a cause);
   - a concrete numbered sequence the spec allows, citing a requirement id for each step, then the result and the statement it conflicts with;
   - 2-3 options built from these repairs: (i) forbid the last step in that situation, (ii) change or forbid an earlier step, (iii) give the last step a different effect, (iv) relax the rule and state the current behavior explicitly — plus "Specify a different rule"; each with "Spec change:";
   - one recommendation with a one-line reason;
   - Severity: high = money, irreversible steps, states that must never be reached, or work that cannot start; medium = implementers would diverge; low = wording;
   - "Status: open"; number new questions from ids.nextQuestion; leave existing questions as they are.
5. Never fix the spec yourself: every gap becomes a question. Every "Assumption:" in the proposal becomes a question unless a decision already covers it.
6. Fill "Checked and consistent" honestly.
7. Run `comb validate --change {{change}} --json` and fix format errors in your files. Then run `comb mark-reviewed --change {{change}}`.
8. Tell the user the counts by severity and suggest /comb:clarify.
