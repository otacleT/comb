---
description: Turn the agreed idea into a Comb change (proposal, spec delta, tasks) that passes comb validate. Use when the user wants to propose or start a change.
---
# Comb: propose

The `comb` CLI is the source of truth for formats and rules. Follow what it returns; do not improvise formats.

1. Choose a kebab-case change id (a verb phrase, e.g. `add-auto-cancel`) and run `comb new change <id> --json`.
2. Run `comb instructions proposal --change <id> --json`. Read `data.context.readFiles`, then write `data.outputPath` following `data.instruction`, `data.template` and `data.rules`, in `data.language`.
3. Run `comb instructions delta --change <id> --json` and write one delta per affected capability, using `data.ids.nextRequirement` for new requirement ids.
4. Run `comb instructions tasks --change <id> --json` and write the tasks.
5. Run `comb validate --change <id> --json`. Fix every error and re-run until `ok` is `true`. Mention any warnings to the user.
6. Run `comb status --change <id>` and tell the user what you created and what comes next.

Never edit `comb/specs/` or `comb/decisions.md` directly — only `comb archive` changes them.
