Clarify change "{{change}}" with the user, in {{language}}. Resolve open questions, record every answer, and apply it to the delta.

1. Read context.readFiles. Work through context.openQuestions (highest severity first), at most context.batch at a time.
2. If the user's request already contains answers (for example "Q-1: A, Q-3: B" or "all recommended"), use them. Otherwise present each question briefly — the sequence, the options with their spec change and what each option adds ("New:"), your recommendation — and let the user choose. Use a multiple-choice question tool if you have one; otherwise ask in text. Never answer for the user.
3. For every answer:
   - If it changes the spec: add a decision to {{decisionsPath}}, numbered from ids.nextDecision, with Date, Refs, "From: Q-<n>", the rule, and "**Why:**" in the user's words. Add "Supersedes: D-<NNN>" only when it replaces a decision in comb/decisions.md. Then edit the delta so the requirements and scenarios state exactly that rule (MODIFIED blocks stay whole), citing the decision, e.g. "(D-1)". A requirement that is not in the delta yet is copied in as MODIFIED first.
   - If it needs no spec change: set "Decision: none: <reason>".
   - Update the question: "Status: answered", "Decision: …", and a line "**Answer:** <option> (<date>)".
   - If the user postpones it: "Status: deferred".
4. Run `comb validate --change {{change}} --json` and fix every error.
5. Run `comb status --change {{change}}`. The review is now stale; tell the user what was decided and what remains open, and suggest /comb:review to re-check the changed requirements.

Never edit comb/specs/ or comb/decisions.md.
