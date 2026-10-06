---
description: Archive a finished Comb change, merging its delta into the specs and its decisions into comb/decisions.md with permanent ids. Use when a change is implemented and the user wants to close it.
---
# Comb: archive

`comb archive` does the merge deterministically. Never edit `comb/specs/` or `comb/decisions.md` yourself.

1. Find the change: use the id the user gave; otherwise run `comb status --json` and take the change whose next step is `archive` (ask if there are several).
2. Run `comb archive <id> --json`.
3. If it is blocked (`ARCHIVE_BLOCKED`), tell the user each reason and its fix. Pass `--yes`, `--allow-dropped-scenarios` or `--allow-base-drift` only when the user explicitly agrees to that specific override, then run the command again.
4. For any other error, report it with its fix and stop. Do not edit files to force the archive through.
5. On success, tell the user what changed: the requirements added, modified and removed per capability, the decision ids that were assigned (local → permanent), and where the change was archived.
