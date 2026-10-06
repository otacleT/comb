# Comb

From tangled ideas to decided specs.

Comb is a spec-driven development CLI for AI coding agents. It keeps human-readable specs in your repo and drives a convergence loop: review → answerable questions → recorded decisions → updated specs.

> Status: v0 in development (M1 walking skeleton). See `docs/` for the design.

## Try it (development build)

```bash
npm install
npm run build
npm link            # makes the `comb` command available

cd /path/to/your/project
comb init --language ja
```

Then, in Claude Code, use `/comb:explore` and `/comb:propose`.

## Commands (M1)

| Command | What it does |
|---|---|
| `comb init` | creates `comb/` and installs Claude Code skills |
| `comb new change <id>` | creates a change folder |
| `comb instructions <proposal\|delta\|tasks> --change <id>` | instructions for the agent |
| `comb validate [--change <id>]` | checks specs and changes |
| `comb status [--change <id>]` | artifact states and the next step |

Every command accepts `--json` and returns `{ schema: "comb.v1", command, ok, data, diagnostics }`.
