# Benchmark: order-lifecycle (E3)

`project/` is a Comb project with one change, `add-order-lifecycle`. That change adds Spike 01's 18-requirement order-lifecycle spec as a new capability. `expected-highs.md` is the answer key.

## Run

```bash
npm run build
node bench/run.mjs order-lifecycle --runs 2
```

The runner copies `project/` to a temp folder, runs `/comb:review add-order-lifecycle` there, and grades the questions with a separate `claude -p` grader against `expected-highs.md` (strict root-cause matching). Results go to `bench/results/`. E3 passes with at least 5 of 7.
