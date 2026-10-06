---
description: Implement a Comb change by working through its tasks, after warning about open high-severity questions. Use when a change is clarified and ready to build.
---
# Comb: apply

The `comb` CLI is the source of truth for the rules. Follow what it returns.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `apply` (ask if there are several).
2. Run `comb instructions apply --change <id> --json` and follow `data.instruction`, using `data.context.readFiles` and `data.context.openQuestions`.
3. Before writing code, tell the user about every open high-severity question and let them decide whether to proceed.
4. Tick a task in tasks.md only when it is done and tested.
5. Run `comb status --change <id>` and report what was implemented and what remains.

Never edit the delta, `comb/specs/` or `comb/decisions.md` while implementing.
