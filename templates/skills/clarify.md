---
description: Walk the user through a Comb change's open questions, record each answer as a decision, and update the spec delta. Use after a review, or when the user answers questions.
---
# Comb: clarify

The `comb` CLI is the source of truth for formats and rules. Follow what it returns.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `clarify`.
2. Run `comb instructions clarify --change <id> --json` and follow `data.instruction`, using `data.context.openQuestions`, `data.context.batch`, `data.template` and `data.ids.nextDecision`.
3. The user decides: never answer a question on the user's behalf. Answers the user already gave in their request count.
4. After writing the decisions, the questions and the delta edits, run `comb validate --change <id> --json` until `ok` is `true`.
5. Run `comb status --change <id>` and tell the user what was decided, what remains open, and that `/comb:review` should re-check the changed requirements.

Never edit `comb/specs/` or `comb/decisions.md` directly.
