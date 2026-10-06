# Benchmark: order-lifecycle (E3)

`project/` is a Comb project with one change, `add-order-lifecycle`. That change adds Spike 01's 18-requirement order-lifecycle spec as a new capability. `expected-highs.md` is the answer key.

## Run

```bash
B=$(mktemp -d) && cp -R bench/order-lifecycle/project/. "$B" && cd "$B"
git init -q && comb init --language en && git add -A && git commit -qm base
claude -p '/comb:review add-order-lifecycle' --permission-mode acceptEdits \
  --allowedTools "Bash(comb:*)" Read Write Edit Glob Grep --output-format stream-json --verbose > review.jsonl
comb validate --change add-order-lifecycle && comb status --change add-order-lifecycle
```

## Judge

For each row of `expected-highs.md`, find the question in `comb/changes/add-order-lifecycle/questions.md` that has the same root cause (the sequence and the conflict, not just the topic). Record the matches in `docs/experience-log.md`. E3 passes with at least 5 of 7.
