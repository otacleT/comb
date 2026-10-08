---
description: Write or refresh the product docs (product, features, screens, flows, decisions, open questions) as a readable projection of the Comb specs and decisions. Use after archiving changes, or when the user asks for product documentation.
---
# Comb: docs

The `comb` CLI is the source of truth for the profile, its templates and its rules. Follow what it returns.

1. Run `comb docs --json` to see which documents are missing or stale.
2. Run `comb instructions docs --json` and follow `data.instruction`, using `data.discipline`, `data.outputs` (each with its template) and `data.context.readFiles`.
3. Write only the documents that are missing or stale. Never overwrite a user-owned file; ask the user instead.
4. Run `comb docs stamp`, then `comb docs --json`, and fix the errors in the documents you wrote until there are none.
5. Tell the user which documents you wrote, and list the gaps they show.

Never edit `comb/specs/` or `comb/decisions.md` here: when the docs reveal a gap, suggest /comb:propose.
