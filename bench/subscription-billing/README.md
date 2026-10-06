# Benchmark: subscription-billing (S2, second domain)

`project/` is a Comb project with one change, `add-subscription-billing`, written by an agent that never saw Comb's lenses. `baseline-review.md` is a fresh Claude review of the same spec without Comb; `expected-highs.md` is its list of high-severity root causes and the answer key.

## Run

```bash
npm run build
node bench/run.mjs subscription-billing --runs 2
```

The subject passes when the mean recall reaches `pass` in `bench.json` (70% of the keys).
