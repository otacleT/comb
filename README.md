# Comb

From tangled ideas to decided specs.

Comb is a spec-driven development CLI for AI coding agents. It keeps human-readable specs in your repository and drives a convergence loop: review → answerable questions → recorded decisions → updated specs. The CLI does the deterministic work (parsing, validation, ids, gates, merging); the agent writes and reviews through Claude Code skills.

## Install

```bash
npm install -g @otaclet/comb    # Node 22.12 or later
cd /path/to/your/project
comb init --language en          # or ja
```

`comb init` creates `comb/` (config, specs, decisions, changes) and installs the Claude Code skills and `/comb:*` commands. After upgrading Comb, run `comb update` to refresh them. Files you edited are kept as they are; to take the new version of one, delete it and run `comb update` again.

## The loop

| Step | In Claude Code | What happens |
|---|---|---|
| Explore | `/comb:explore` | think the idea through; no files are written |
| Propose | `/comb:propose <idea>` | a change with a proposal, a spec delta with stable ids (`REQ-<PREFIX>-<NNN>`) and tasks |
| Review | `/comb:review` | four lenses (consistency, formalization, edge cases, change impact) → `review.md` and answerable questions with options and a recommendation |
| Clarify | `/comb:clarify` | your answers become decisions (`D-1`…) and delta edits; the review goes stale until it is redone |
| Apply | `/comb:apply` | implement the tasks |
| Archive | `/comb:archive` | merge the delta into `comb/specs/`, give the decisions permanent ids (`D-001`…) in `comb/decisions.md`, and move the change to `comb/changes/archive/` |

`comb status` always tells you, and the agent, the next step. Open high-severity questions block apply until you answer or defer them; archive needs every question answered or deferred.

## Commands

| Command | What it does |
|---|---|
| `comb init [--language <lang>]` | create `comb/` and install the agent skills |
| `comb update` | regenerate the skills for the installed version |
| `comb new change <id>` | create a change folder |
| `comb status [--change <id>]` | artifact states, open questions and the next step |
| `comb instructions <artifact> --change <id>` | instructions for the agent (proposal, delta, tasks, review, clarify, apply) |
| `comb validate [--change <id>]` | check specs, changes, questions and decisions |
| `comb mark-reviewed --change <id>` | record that the review matches the current delta |
| `comb archive <id> [--yes] [--allow-dropped-scenarios] [--allow-base-drift]` | merge a finished change |
| `comb list` / `comb show <REQ-…\|D-NNN\|change-id>` | list and look up specs, decisions and changes |

Every command accepts `--json` and returns `{ "schema": "comb.v1", "command", "ok", "data", "diagnostics" }`. Exit codes: 0 ok, 1 a check failed or a gate is not met, 2 usage error, 3 internal error.

## Files

```
comb/
├── config.yaml
├── decisions.md                  # project decisions, D-001…
├── specs/<capability>/spec.md    # the canonical specs
└── changes/<id>/                 # proposal.md, specs/<capability>/spec.md (delta), review.md, questions.md, decisions.md, tasks.md
```

Everything is plain Markdown in your repository. The formats are described in [docs/DESIGN.md](https://github.com/otacleT/comb/blob/main/docs/DESIGN.md) (Japanese).

## Development

```bash
npm install
npm test
npm run build
node bench/run.mjs order-lifecycle --runs 2   # review recall benchmark; runs the claude CLI and costs money
```

## License

MIT
