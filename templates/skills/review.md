---
description: Review a Comb change through the consistency, formalization, edge-case and change-impact lenses, and turn every finding into an answerable question. Use after a change is proposed or updated.
---
# Comb: review

The `comb` CLI is the source of truth for lenses, formats and rules. Follow what it returns.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `review` (ask if there are several).
2. Run `comb instructions review --change <id> --json` and follow `data.instruction`, using `data.lenses`, `data.template`, `data.context` and `data.ids`.
3. Write `data.outputPath` and the files in `data.alsoWrite`. Do not edit the delta or anything under `comb/specs/`.
4. Run `comb validate --change <id> --json` until `ok` is `true`, then run `comb mark-reviewed --change <id>`.
5. Report the questions created by severity, and the next step from `comb status --change <id>`.
