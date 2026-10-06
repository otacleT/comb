> 調査時点: 2026-10-04。調査中に使ったクローンやハンズオンのファイルは一時領域（`.spike/`、git管理外）にあり、本文中のパスはその当時のものです。

# FSL as Comb's hidden verification backend — research note

Date: 2026-10-04. Sources: a clone of https://github.com/ymm-oss/fsl at commit `458040f` (2026-10-02),
the local `fslc 4.3.0` with its Agent Skills (`~/.claude/skills/fsl*`), and a downloaded `fslc 4.8.1`
release binary, which is in the scratchpad (`fsl-latest/`).
Hands-on files are in `scratchpad/fsl-handson/`. Paths below are relative to the clone (`scratchpad/fsl/`)
unless marked `~` or `handson/`.

## 0. Verdict (TL;DR)

- **Feasible as the v0 backend, but only behind a Comb-owned intermediate model (IR) and a deterministic
  IR→FSL compiler. Integrate through the CLI subprocess and its JSON, not as a library.** FSL already does most of
  what Comb needs:
  - stateful multi-entity models with guards (`requires`)
  - invariants, two-state `trans` rules, `leadsTo` liveness, reachability, and deadlock checks
  - requirement-ID traceability
  - concrete positive and negative scenarios (`acceptance` / `forbidden`)
  - shortest counterexample traces as JSON
  - semantic diff between spec versions
  - mutation-based "what is under-specified" signals

  It is fast on Comb-sized models: a violation was found in 70 ms, and induction proved the fixed model in 0.44 s.
- **The decisive constraint is that no supported library API exists.** The README says this outright: "the supported
  programmatic surface is the CLI's JSON envelope and this Public Kernel contract, not a library import"
  (`README.md`, "The Public Kernel JSON contract"). The Rust crates are `publish = false` (`rust/Cargo.toml`), the
  Python package is a frozen 2.7.0 reference and is not on PyPI, and the WASM worker is a private, unpublished npm
  package (`rust/fsl-wasm/package.json`).
- **Main risks:**
  1. A single maintainer with very high churn: 45 releases in 3.5 months and about 23 changelog entries flagged
     breaking.
  2. The `verify` counterexample envelope is not schema-versioned. `schemas/fslc/envelope.v1.schema.json` pins only
     `fsl`, `versions` and `result`, and has `additionalProperties: true`.
  3. Some traceability projections are inconsistent between commands (§7).

  Pin an exact fslc version, wrap it in an adapter layer, and keep golden tests on the JSON shapes.
- **Best FSL target for Comb is the `requirements` dialect in kernel-wrapper form:** explicit `state`, `init` and
  actions inside `requirement REQ-… "text" { … }` blocks, plus `acceptance` / `forbidden`. Comb's
  Requirement + Scenario specs map onto this most directly. The kernel `spec` dialect rejects `acceptance` and
  `forbidden`, and the process+data profile introduces generated names (§9).
- **LLM-direct Markdown→FSL is possible but should not be the production path.** Use the LLM for Markdown→IR,
  with structured, reviewable output, and compile IR→FSL deterministically. A deterministic compiler also makes
  traces map back to the Markdown requirement and scenario IDs by construction.

## 1. Project facts

| Item | Value (evidence) |
|---|---|
| Latest release | v4.8.1 (2026-10-01). `main` is 4.8.1 plus fixes. The local install is **v4.3.0 (2026-08-18), 7 releases behind** (`gh release list`, `CHANGELOG.md`). |
| Cadence | Repo created 2026-06-15. 45 versions from v1.0.0 (06-11) to 4.8.1. Majors: 2.0 (06-18), 3.0 (07-17), 4.0 (07-27). About 1,050 commits since creation, 93 in the last 30 days, PR numbers past #1239. |
| People | GitHub contributors: `rizumita` 847, `rizumita-acn` 247 (apparently the same person), `imaimai17468` 31, `mpyw` 3. Issues: 201 open / 507 closed, 689 authored by rizumita. Issues are written in Japanese. Org `ymm-oss` was created 2026-03. 32 stars, 4 forks. |
| License | Apache-2.0 (`LICENSE`, `NOTICE`). Runtime deps are lark (MIT) and z3 (MIT). Product-friendly: redistribution and embedding are fine; keep `NOTICE`. |
| Implementation | Rust 2024 workspace, about 208k LOC (`rust/`): `fsl-syntax` (parser), `fsl-core` (lowering, Kernel model), `fsl-runtime` (Monitor and explicit BFS), `fsl-solver` / `fsl-solver-z3` (vendored Z3 4.16 via `z3 = "=0.20.2"` with features `vendored`, `z3_4_16`), `fsl-solver-z3js` (browser z3-solver npm), `fsl-verifier` (BMC, induction, liveness), `fsl-tools` (reports, dialects), `fsl-lsp`, `fsl-wasm`, `fslc`. The frozen Python reference `src/fslc/` (about 39k LOC, Lark + z3-solver, `requires-python >=3.9`, `pyproject.toml` version 2.7.0) is used only for differential tests. |
| Footprint | Single static-ish binary with Z3 bundled. The local `fslc` is 35.7 MB and `fslc-lsp` 5.7 MB, 40 MB total (`~/.local/share/fsl`). No Python needed. Targets: macOS arm64, Linux x64/arm64 (glibc ≥ 2.39, Ubuntu 24.04 baseline), Windows x64. **No Intel macOS** (CHANGELOG 3.0.0). Release assets are checksummed. A signed "packslip" supports mise. |
| Install | `install.sh` puts the binaries in `~/.local/share/fsl/releases/<ver>` and links `~/.local/bin/fslc` and `~/.claude/skills/fsl*`. mise backends: `packslip:` / `github:`. |
| Verdict cache | `verify` writes to `$FSLC_CACHE_DIR`, else `$XDG_CACHE_HOME/fslc`, else `~/.cache/fslc` (LRU, 256 MB). Disable with `--no-cache` or `FSLC_CACHE=off` (`docs/design/DESIGN-incremental-verify.md:105-122`). |

## 2. Agent workflow encoded in the skills (local 4.3.0)

`~/.claude/skills/fsl/SKILL.md` (789 lines) and `reference.md` (2,114 lines) are the language card. The skill
opens: "FSL is a language not present in training data. Do not write from memory". The skills also define:

- **Role skills.** `fsl-business` (As-Is/To-Be, policies, KPIs, goals), `fsl-requirements` (REQ IDs, `acceptance`,
  `forbidden`, NFR/SLA), `fsl-design` (kernel spec plus refinement mapping), `fsl-design-review` (refine-based
  SOLID/LSP review) and `fsl-delivery` (orchestrates the layers, `fslc chain`).
- **Formalization memo.** A mandatory memo comes first: glossary, requirement normalization with boundary
  implications, an assumption ledger, and questions. The agent must not invent guards or invariants "to reach
  green", must ask the human, and must keep confirmed assumptions as `// ASSUME-n` or
  `@requirement("ASSUME-…")` in the `.fsl` (SKILL.md §"Before writing a spec").
- **Faithfulness gate.** `fslc check --strict-tags`, where done means zero `untagged` and zero
  `unreferenced_requirement`, plus `fslc lint` for canonical IDs (`fsl-requirements/SKILL.md`).
- **Repair protocol.** A table routes each `result` / `violation_kind` / `trace_type` to a next move
  (SKILL.md §"Repair protocol").

This philosophy matches Comb's: counterexamples become questions to a human, and the human never reads formulas.

Version drift between local and latest:

- The latest repo splits the skill into `skills/fsl/references/{syntax,commands,errors,layers,nl-to-syntax,…}.md`.
- It adds the skills `fsl-from-code` and `fsl-requirements-document`.
- It changes semantics the local skill documents. Example: since #1002 (4.5.0), a failing inline `implements` seam
  becomes the top-level `result` and exits 1. The 4.3.0 skill still says the failure "is not folded into the
  top-level result or the exit code" (`docs/manual/LANGUAGE.md` ~L2290 vs `~/.claude/skills/fsl/SKILL.md:166-173`).

## 3. The language

**Kernel `spec`** (`reference.md` §1–§5):

- Declarations: `const`; `type T = lo..hi` (bounded int with automatic bound checks); `entity` / `number` with
  bounds in `verify { instances / values }`; `enum`; `symmetric` types; `struct` (scalar or Option fields only);
  `def` (non-recursive predicates).
- `state { … }` with Bool / Int / domain / enum / `Option<T>` / `Map<K,V>` (no nested maps) / `Set` / `Seq<T,N>`
  / `relation A -> B`.
- `init`, then `[fair] action a(p: T) { requires …; let …; assignments; ensures … }`. Updates are simultaneous,
  every right-hand side reads the pre-state, and assigning the same location twice is an error.
- Properties: `invariant`, `trans` (two-state, with `old()`), `reachable`, `leadsTo P ~> [within K] Q
  [helpful …] [decreases M]`, `unless`, `until`, and `terminal { … }` (intended stops excluded from the deadlock
  check).

**Dialects (layers).** Every dialect lowers to the same kernel.

- `business` covers process/stages/transitions `by Actor`, `policy … every X in S must eventually be T`, no-bypass
  policies, `goal`, `kpi`, `control`, and `governance`.
- `requirements` comes in two forms:
  - The **process+data profile**: `process E with f: T { stages; initial; transition a S -> T by Actor
    with/when/set/covers REQ-… "text" }`.
  - The **kernel-wrapper form**: `state`, `init` and actions inside `requirement ID "text" { … }`.

  Both forms take `acceptance ID "…" { steps; expect … }`, `forbidden ID "…" { steps; expect rejected }`,
  `implements Abs from "business.fsl" { … }`, and SLA via `time { urgent …; age … }` plus `deadline`.
- The design layer is a plain kernel `spec` plus a mapping file checked with `fslc refine`.
- Specialty dialects: `domain` (Functional DDD, async effects, sagas), `dbsystem`, `ai_component` / `agent`, and
  the review-only `causal`.

**Traceability syntax.** The canonical form is `@requirement("REQ-SCOPE-001", "text")` before a declaration, or
process `covers`. The legacy `"ID: text"` string slot is linted. `undecided:` marks an owner-accepted deferral.

**Editions.** `--edition current|next`, `fslc lint` and `fslc migrate [--write]` handle syntax deprecations
(`reference.md` §1 and §7).

**Literate Markdown.** `check`, `verify` and `scenarios` accept `.md` files with ```` ```fsl ```` fences, and
diagnostics map to Markdown line numbers (verified in `handson/literate_probe.md`). Every other command rejects
`.md` with `FSL-INPUT-LITERATE-UNSUPPORTED`, so this is not a route for Comb's user-facing Markdown.

## 4. CLI surface (4.8.1 `--help`). Output is always one JSON document on stdout.

Exit codes:

- 0: verified / proved / refines / generated
- 1: violated / reachable_failed / unknown_cti / unknown_budget / nonconformant / refinement_failed
- 2: spec error (parse/type/semantics/io; also `acceptance` / `forbidden` failure and `--vacuity error`)
- 3: internal

| Command | One line |
|---|---|
| `check` | Parse, resolve names, type-check, lower. Replays `acceptance` / `forbidden`. `--strict-tags` adds traceability warnings. |
| `verify` | BMC (default), `--engine induction` (k-induction proof), `explicit` (Z3-free BFS, closure = proof), `auto`. Also `--depth`, `--property`, `--exclude-property`, `--instances` / `--values`, `--from-state`, `--lemma`, `--deadlock`, `--vacuity`. |
| `sweep` | Grid of verify runs over instances/values/depth. Reports `minimal_counterexample` (the smallest failing scope). |
| `scenarios` | Integration-test skeleton JSON: `reach_*`, `cover_<action>`, `respond_*`, `acceptance_*`, `forbidden_*`, each with steps and expected states. |
| `testgen` | Conformance-test scaffold (pytest / vitest / swift / kotlin / dart / phpunit) with an Adapter `reset` / `step` / `observe`. |
| `replay` | Check an observed trace or a production JSONL log (via a mapping file) against the spec. |
| `mutate` | Built-in model mutants. Kill rate and survivors, `--by-requirement`. |
| `explain` | Deterministic skeleton, auto-checks, a per-invariant counterfactual ("what if this rule were absent"), witnesses. `--readable` gives text. |
| `refine` | Impl ⊑ abs refinement through a mapping (safety; `preserve progress` for liveness). |
| `diff` | Bounded semantic diff between OLD and NEW: `behavior_added` / `behavior_removed` / `invariant_weakened` / `forbidden_relaxed` / `scope_changed` / `unknown`. `--git BASE..HEAD`, `--forbid` makes it a CI gate. |
| `chain` | Runs the business → requirements → design → impl layers from `fsl-project.toml`. |
| `kernel` | Public Kernel JSON v1 (or `--kernel-version 2` with a provenance graph). The compiler boundary. |
| `conformance` | Concrete conformance vectors for validating independent runtimes. |
| `analyze` | Typed Semantic Graph projections, `--profile ai-review` findings (`divergent_choice`, `unconstrained_effect`, `disconnected_requirement` …), DOT/Mermaid output. |
| `document` | `generate` writes a ja/en controlled-language requirements doc; `claims` writes the RCIR JSON; `check` detects document drift. |
| `ledger` / `html` | Audit ledger by requirement ID (Markdown, Japanese) and a self-contained HTML review report. |
| `approval` | Digest-bound approval records (`create` / `check` / `diff`). |
| `lint` / `migrate` / `fmt` | Edition and ID-policy diagnostics, atomic migrations, formatter. |
| `typestate` | Typestate applicability and a TypeScript skeleton. |
| `db` / `compat` / `ai` / `domain` / `causal` | Specialty dialect command groups. |
| `counterexample export` | (Present in 4.8.1, added #885.) Writes a versioned `reproducer.v1` artifact for safety-invariant counterexamples only. |

## 5. Verification engines and properties

- **BMC.** Incremental symbolic Z3 over `--depth K` (default 8, inclusive). The counterexample trace is the
  shortest. Every run checks:
  - type bounds (`_bounds_*`)
  - partial operations (Seq pop/head/at)
  - action coverage, with an unsat core naming the `blocking_requires`
  - deadlock (warning by default)
  - vacuity (`vacuous_implication`, `never_enabled_action`, `always_true_requires` …)
- **Induction** (`--engine induction`). k-induction gives `proved` / `completeness: "unbounded"` for invariants and
  `trans`. A failure returns `unknown_cti` with a phantom state; there are `--lemma` candidates and
  `suggested_invariants`. `leadsTo` stays bounded unless it declares `decreases`.
- **Explicit** (`--engine explicit`). Z3-free BFS. When exploration closes, the result is `proved` with
  `closure: true` and needs no lemmas. It rejects `leadsTo` and nondeterministic `init`; `auto` then falls back to
  BMC and records `engine_fallback`.
- **Liveness.** `leadsTo` is a fair-lasso or stall search. Weak fairness applies to `fair` actions, and the process
  profile makes every transition fair. The skill warns that it is exponential in the number of concurrent entities
  (`reference.md` §7, "Liveness scales differently").
- **Checkable properties.** Invariants, two-state transitions, `ensures`, reachability (`reachable_failed` is
  classified `insufficient_depth` vs `over_constrained`), deadlock, bounded or ranked response (`leadsTo`), SLA
  deadlines (discrete ticks), refinement, and semantic diff. Out of scope: real time, probability, continuous money,
  free-text meaning (SKILL.md gate 3).

**Measured performance** (M-series Mac, 4.3.0, `--no-cache`, 2-order model unless noted):

| Run | Time |
|---|---|
| `check` | 10–30 ms |
| `verify` finding a trans violation (depth 5) | 0.07 s |
| `verify` on the fixed model, depth 8, with 1 `leadsTo` | 0.46 s |
| `verify --engine induction` | 0.44 s, `proved` |
| `verify --engine explicit --depth 14` (no leadsTo) | 0.01 s, `proved`, 64 states, `closure: true` |
| Safety-only BMC, 3 / 5 orders, depth 10 | 0.15 s / 0.74 s |
| Induction, 5 orders | 0.33 s |
| With `leadsTo`, 3 / 4 / 5 orders, depth 10 | 3.1 s / 5.3 s / 10.5 s |
| `leadsTo` alone, 3 orders, depth 12 | 7.4 s |
| `explain` | 3.7 s |
| `mutate --by-requirement` (119 mutants; the `leadsTo` re-runs dominate) | 49 s |
| `scenarios` | 0.44 s |
| `analyze --profile ai-review` | about 10 ms |
| `sweep` (9 cells) | 0.10 s |

Implication: safety checks are interactive-speed and can run on every Comb edit. Keep liveness on 1–2 entities,
and run `mutate` / `explain` asynchronously.

## 6. Machine-readable outputs

Every command emits `{"fsl":"1.0","result":…, "versions":{verifier,core,solver}, …}`. Only these top-level fields
are schema-pinned (`schemas/fslc/envelope.v1.schema.json`), and the schema has `additionalProperties: true`. The
counterexample shape is documented in prose (`reference.md` §7: "Counterexample trace:
`[{step, state, action{name,params,loc}, changes{path:{from,to}}}]`"), but it is not covered by a JSON Schema.
The new `reproducer.v1` (`schemas/fslc/kernel/reproducer.v1.schema.json`, `docs/design/DESIGN-reproducer.md`) is
the first versioned counterexample artifact. Its design note says verifier stdout envelopes "remain the live
inspection surface", and `reproducer.v1` covers invariant violations only: it lists `leadsTo`, refinement, CTI and
nondeterministic init in `unsupported_v1`.

**Real counterexample** (`handson/verify_v2.json`, trimmed in `handson/excerpt_verify_v2.json`; naive model plus
the refund→payout rule):

```json
{ "fsl": "1.0", "spec": "OrderPayout", "result": "violated",
  "violation_kind": "trans", "trace_type": "trans",
  "trans": "NoPayoutAfterRefund", "invariant": "NoPayoutAfterRefund", "generated_name": "NoPayoutAfterRefund",
  "requirement":  { "id": "REQ-PAYOUT-002", "text": "After a full refund, the seller payout must not be executed" },
  "requirements": [ { "id": "REQ-PAYOUT-002", "text": "..." } ],
  "origin": { "identity": "requirements:stage-access:1728:1736", "dialect": "requirements",
              "lowering_steps": [ { "kind": "resolve_stage_access", "detail": "stage(o) -> order_stage[entity]" } ] },
  "loc": { "line": 40, "column": 5 }, "violated_at_step": 5, "violating_bindings": null,
  "blame": { "conjuncts": [ { "index": 0, "holds": false,
      "text": "forall o: Order { old(stage(o)) == Refunded => old(order_paid_out[o]) or not order_paid_out[o] }" } ] },
  "last_action": { "name": "payout_after_return", "params": { "c": 1 }, "loc": { "line": 33, "column": 5 } },
  "trace": [
    { "step": 0, "state": { "order_delivered": {"0": false, "1": false}, "order_paid_out": {"0": false, "1": false},
                            "order_stage": {"0": "Created", "1": "Created"} } },
    "... steps 1-3: pay(c=1), ship(c=1), deliver(c=1) ...",
    { "step": 4, "action": { "name": "refund_return", "params": {"c": 1}, "loc": {"line": 24, "column": 5} },
      "changes": { "order_stage[1]": { "from": "Delivered", "to": "Refunded" } },
      "state": { "...": "full state" }, "blame": { "guards": [], "effects": [] } },
    { "step": 5, "action": { "name": "payout_after_return", "params": {"c": 1}, "loc": {"line": 33, "column": 5} },
      "changes": { "order_paid_out[1]": { "from": false, "to": true } },
      "state": { "...": "full state" }, "blame": { "guards": [], "effects": [] } } ],
  "checked_to_depth": 5, "completeness": "bounded",
  "cost": { "elapsed_s": 0.068, "solver": "...", "properties": "[...]" } }
```

Other shapes observed:

- **Invariant violation** (`handson/verify_v2b.json`): the same shape with `violation_kind: "invariant"`. It adds
  `violating_bindings: [{"o": 0}]`, and `blame.conjuncts[].violating_bindings`.
- **`leadsTo` violation** (`handson/verify_v4.json`): `violation_kind: "leadsTo"`, `bindings: {"o":0}`,
  `pending_since: 3`, `stutter: true` (or `loop_start` for a lasso), and
  `hint: "P held at step 3 but execution deadlocks at step 4 without Q"`. **No `requirement` field** (§7).
- **`forbidden` failure** (`handson/verify_forbidden_only.json`): `result: "error"`, `kind: "forbidden"`, exit 2,
  plus `id`, `text`, `accepted_step`, `step: {action, args}`, `accepted_trace: [{action, params}]`, the final
  `state`, and a `hint`.
- **`acceptance` failure** (`handson/probe_acceptance_fail.fsl`): `kind: "acceptance"`, `id`, `failed_step`, final
  `state`, and `expect` as a **legacy S-expression array** (`["bin","==",["index",["var","order_stage"],…]]`), not
  the typed Kernel expression.
- **`analyze` finding** (`handson/analyze_v2b.json`, schema `analysis-findings.v0`): `finding_type:
  "divergent_choice"`, `formal_status: "not_a_violation"`, `involved_nodes`, `witness {trace, state,
  actions[{name, params, successor}], differing_predicates}`, and a template `spec_question` such as "Both pay and
  payout_after_return are enabled in this reachable state and produce different contract outcomes. Which outcome
  is intended…?".
- **`mutate` survivor**: `{"op": "requires_remove", "target": "cancel requires #1", "loc": {…}, "status":
  "survived", "requirement": {"id": "REQ-CANCEL-001", …}}`.
- **`diff` finding**: `{"kind": "behavior_removed", "direction": "old_to_new", "witness": {"trace": […]}}`.

**Public Kernel JSON** (`fslc kernel`; `docs/design/DESIGN-kernel-contract.md`): `$schema` points at
`kernel.v1.schema.json` and `schema_version` is `1.0.0`. It has its own SemVer: patch means a clarification,
minor adds optional fields only where the schema is extensible, and major covers any semantic change.
Deprecations last two minors. It is shipped as a checksummed `fsl-kernel-contract-v1/v2` bundle per release.

The document carries `spec`, `semantics` (simultaneous / pre_state / rollback / weak fairness …), `constants`,
`types`, `state`, `init`, `actions` (typed guards and updates, `partial_operations`, `requirement`, `origin`,
`span`) and `properties`. Every expression is a typed AST with spans, so nothing needs reparsing. It is about
80 KB for our 7-action model, and v2 is about 92 KB. It rejects `compose` input.

This is the most stable surface FSL offers. It is useful for Comb to read back what was compiled, for example to
map generated names to IR nodes, but it is not the verification result.

**Python API.** None that is supported. `src/fslc` is frozen at 2.7.0, gets no new features, and is not on PyPI.
The Rust API `fsl_core::public_kernel_contract` exists, but the crates are unpublished.

## 7. Requirement traceability (critical for mapping back to Markdown)

- The ID enters through `requirement ID "text" { … }` blocks, `@requirement(...)`, or process `covers`. Violated
  invariants and `trans`, coverage, `scenarios` and RCIR claims carry `requirement: {id, text}` and `requirements[]`.
- `--strict-tags --requirements ids.txt` flags untagged declarations and orphan IDs. `analyze --projection
  requirement_property_graph` and `traceability_graph` export the graph.
- `fslc ledger` regroups findings by requirement ID with an assurance class:
  `proved(induction)` / `bounded(BMC depth k)` / `replay-observed` / `statistical` / `not_run`.

**Gaps observed:**

1. A `leadsTo` violation omits `requirement`. This was tested with both a `requirement` block and an `@requirement`
   annotation, on 4.3.0 and 4.8.1.
2. `fslc kernel` shows `requirement: null` for a `trans` that `verify` attributes to REQ-PAYOUT-002.
3. `scenarios` reports `acceptance` / `forbidden` under their own AC/FB id. The `@requirement` link is dropped
   there, although `document claims` keeps it (`["AC-PAYOUT-001", "REQ-PAYOUT-001"]`).
4. The `invariant` key holds the property name even for `trans` and `leadsTo` results (legacy naming).

**Consequence:** Comb should own the mapping property/action/scenario name → Markdown requirement and scenario ID.
A deterministic compiler emits stable names such as `R_payout_002__no_payout_after_refund` and keeps a sidecar
map. Treat FSL's `requirement` field as a cross-check only.

## 8. Documents FSL generates itself

- **`document generate --lang ja|en`.** A deterministic "controlled-language" requirements doc (457 lines for our
  spec). It has editable non-normative slots, claim blocks with digests, and front matter carrying spec and claim
  digests. Complex rules fall back to printing FSL source (`coverage.formula_fallbacks: 1`; our `trans` rendered as
  a raw `forall … old(…)` block). It is not a user-facing doc for non-FSL readers.
- **`document claims`.** RCIR JSON (`requirement-claims.v1`): per-claim kind, requirements, subject, source,
  provenance and digest. `document check` detects drift against a regenerated doc.
- **`ledger`.** A Japanese Markdown audit table by requirement ID: status, assurance class, finding type, a
  "business translation" line, and approve / reject / risk-accept checkboxes, with raw JSON in an appendix
  (`handson/ledger_v2.md`).
- **`html`.** A self-contained 57 KB review report.

For Comb, the Markdown spec stays the source of truth and these outputs are optional evidence artifacts. Comb's own
Markdown renderer should present verification status per requirement, modeled on the ledger. The ledger's
assurance-class vocabulary is worth copying.

## 9. Hands-on: order / payment / cancel / refund / payout

**Goal.** Encode "after a full refund, seller payout must not happen" so that a naive model violates it, then fix
the model. The process+data profile was tried first, since it is the skill's default requirements form, and the
kernel-wrapper form afterwards.

### 9.1 Naive model with the rule (`handson/order_v2_rule.fsl`, abridged)

```fsl
requirements OrderPayout {
  process Order with delivered: Bool = false, paid_out: Bool = false {
    stages Created, Paid, Shipped, Delivered, Cancelled, Refunded
    initial Created
    transition pay Created -> Paid by Buyer                 covers REQ-PAY-001 "Buyer pays for a created order"
    transition cancel Paid -> Cancelled by Buyer            covers REQ-CANCEL-001 "..."
    transition refund_cancelled Cancelled -> Refunded by Platform covers REQ-REFUND-001 "..."
    transition ship Paid -> Shipped by Seller               covers REQ-SHIP-001 "..."
    transition deliver Shipped -> Delivered by Carrier set delivered = true covers REQ-SHIP-002 "..."
    transition refund_return Delivered -> Refunded by Platform covers REQ-REFUND-002 "..."
    // Naive: the payout batch fires on the sticky delivery fact, not the current stage.
    transition payout_delivered Delivered -> Delivered by Platform
      when delivered and not paid_out  set paid_out = true  covers REQ-PAYOUT-001 "..."
    transition payout_after_return Refunded -> Refunded by Platform
      when delivered and not paid_out  set paid_out = true  covers REQ-PAYOUT-001 "..."
  }
  requirement REQ-PAYOUT-002 "After a full refund, the seller payout must not be executed" {
    trans NoPayoutAfterRefund {
      forall o: Order { old(stage(o)) == Refunded => (old(order_paid_out[o]) or not order_paid_out[o]) }
    }
  }
  @requirement("REQ-PAYOUT-002", "After a full refund, the seller payout must not be executed")
  forbidden FB-PAYOUT-001 "Payout after a post-delivery refund is rejected" {
    pay(0) ship(0) deliver(0) refund_return(0) payout_after_return(0)
    expect rejected
  }
  acceptance AC-PAYOUT-001 "Happy path" { pay(0) ship(0) deliver(0) payout_delivered(0)  expect Order 0 in Delivered }
}
verify { instances Order = 2 }
```

**Results:**

- `check`: ok.
- `verify`: `violated` / `trans` at step 5 in 0.07 s. The trace is pay → ship → deliver → refund_return →
  payout_after_return, and it carries REQ-PAYOUT-002 (§6).
- `sweep --instances Order=1..3 --depth 4..6` reports the minimal counterexample at one order, depth 5.
- `ledger` marks REQ-PAYOUT-002 🔴 要確認 ("needs review").
- `analyze --profile ai-review` returned **0 findings** on this spec.

**Formulation matters.** Rewriting the rule as the invariant `stage(o)==Refunded => not paid_out[o]`
(`handson/order_v2b_invariant.fsl`) gives a **different** shortest counterexample: deliver → **payout → refund**.
That exposes a second, real ambiguity: may a paid-out order still be refunded (clawback)? With that version,
`analyze` produced two `divergent_choice` findings. So the IR has to state ordering semantics explicitly ("after X,
never Y" vs "never both X and Y"). Different encodings surface different questions, and each is useful.

### 9.2 Fixed model (`handson/order_reqwrapper_fixed.fsl`, the shape a Comb compiler would emit)

```fsl
requirements OrderPayoutReq {
  entity Order
  enum Stage { Created, Paid, Shipped, Delivered, Cancelled, Refunded }
  state { stage: Map<Order, Stage>, paid_out: Map<Order, Bool> }
  init  { forall o: Order { stage[o] = Created  paid_out[o] = false } }

  requirement REQ-PAY-001 "Buyer pays for a created order" {
    fair action pay(o: Order) { requires stage[o] == Created  stage[o] = Paid } }
  requirement REQ-CANCEL-001 "Buyer can cancel a paid order before it ships" {
    fair action cancel(o: Order) { requires stage[o] == Paid  stage[o] = Cancelled } }
  requirement REQ-REFUND-001 "A cancelled order is fully refunded" {
    fair action refund_cancelled(o: Order) { requires stage[o] == Cancelled  stage[o] = Refunded } }
  requirement REQ-SHIP-001 "Seller ships a paid order" {
    fair action ship(o: Order) { requires stage[o] == Paid  stage[o] = Shipped } }
  requirement REQ-SHIP-002 "Carrier confirms delivery" {
    fair action deliver(o: Order) { requires stage[o] == Shipped  stage[o] = Delivered } }
  requirement REQ-REFUND-002 "A delivered order can be fully refunded after a return" {
    fair action refund_return(o: Order) { requires stage[o] == Delivered  stage[o] = Refunded } }
  requirement REQ-PAYOUT-001 "Seller is paid out once the order is delivered" {
    fair action payout(o: Order) { requires stage[o] == Delivered  requires not paid_out[o]  paid_out[o] = true } }
  requirement REQ-PAYOUT-002 "After a full refund, the seller payout must not be executed" {
    trans NoPayoutAfterRefund {
      forall o: Order { old(stage[o]) == Refunded => (old(paid_out[o]) or not paid_out[o]) } } }

  @requirement("REQ-PAYOUT-002", "After a full refund, the seller payout must not be executed")
  forbidden FB-PAYOUT-001 "GIVEN a delivered order WHEN it is fully refunded THEN payout is rejected" {
    pay(0) ship(0) deliver(0) refund_return(0) payout(0)  expect rejected }
  @requirement("REQ-PAYOUT-001", "Seller is paid out once the order is delivered")
  acceptance AC-PAYOUT-001 "GIVEN a paid order WHEN shipped and delivered THEN seller can be paid out" {
    pay(0) ship(0) deliver(0) payout(0)  expect stage[0] == Delivered and paid_out[0] }
  terminal { forall o: Order { stage[o] == Refunded } }
}
verify { instances Order = 2 }
```

**Results.** `check --strict-tags` passes with no warnings, and `verify --engine induction` is `proved` with
`transitions_checked: ["NoPayoutAfterRefund"]`. It compiled on the first try.

The process-profile fix (`handson/order_v3_fixed.fsl`, with an added `leadsTo PaidOrderSettles`) behaves as
follows:

- BMC: verified in 0.46 s.
- Induction: `proved` (the `leadsTo` stays bounded).
- `explicit` rejects `leadsTo`; `auto` falls back to BMC.
- `scenarios` emits 12 scenarios: `respond_*`, `cover_*`, `acceptance_*`, and `forbidden_FB-PAYOUT-001` with
  `rejected_by: requires_failed`.
- `mutate` kill rate is 0.857, with 17 survivors (below).
- `diff` against a variant that adds `when not paid_out` to `refund_return` gives `behavior_removed` with a witness
  (pay, ship, deliver, payout, then refund_return is no longer possible).

### 9.3 Errors hit and how informative they were

The base syntax was easy to get right with the skill loaded: 2 `check` iterations for the first model, and the
kernel-wrapper version compiled first try. The trouble came from **semantic and name-resolution quirks**:

1. **Copy slip `expect Claim 0 in …`.** The error was `{"kind":"semantics","message":"unknown identifier
   'claim_stage'"}`, with **no `loc`** and a generated name in the message. This is poor, and it is unchanged in
   4.8.1.
2. **Carried field in a property, `paid_out[o]`.** The error was "public Kernel cannot type identifier 'paid_out'
   at 40:5", located at the start of the `forall`. The fix is the generated name `order_paid_out[o]`. Neither the
   skill nor the error suggests it, and there is `stage(o)` sugar but no equivalent sugar for carried fields.
3. **`forbidden` passed silently while `verify` failed.** A `forbidden` whose last step violates a property counts
   as "rejected", so it passes. It fires only once no property catches the step
   (`handson/probe_forbidden_only.fsl` gives `kind:"forbidden"`, exit 2). It also stayed satisfied under
   `--exclude-property` on 4.3.0. Comb must read the `verify` result, not only scenario replay, and should check
   `rejected_by == "requires_failed"` to confirm a real guard exists.
4. **Other quirks:**
   - `sweep` rejects `--exclude-property`.
   - `explicit` rejects `leadsTo`.
   - `acceptance` and `forbidden` are rejected in a kernel `spec` ("expected kernel spec declaration").
   - Per-step `blame.guards` / `effects` came back **empty** in `verify` traces on both 4.3.0 and 4.8.1, although
     `explain` counterfactual traces fill them.
5. **Other diagnostics are located and terse:**
   - double assignment: "an action may not assign the same state location more than once" at 9:5
   - type error: "expression of type Int is not assignable to Bool at 13:5"
   - missing brace: "expected kernel spec declaration at 10:1", reported at the next declaration

   Only the first error is reported, and the `hint` / `expected` fields were empty in these cases.

**Version churn test.** All 7 hands-on specs gave identical verdicts and identical violation JSON keys and traces on
4.3.0 and 4.8.1 (`handson/verify_v2_481.json`). The core envelope was stable for this subset over 7 releases.

### 9.4 Mutation survivors as question generators (fixed model)

| Survivor | Underspecification it reveals | Candidate Comb question |
|---|---|---|
| `cancel requires #1` | Cancel guard removable | "Can an order be cancelled after shipping or payout?" |
| `refund_return requires #1` | Refund guard removable | "Can a refund happen from any stage?" |
| `payout requires #2` (`not paid_out`) | Nothing forbids paying out twice; a Bool cannot observe double payout | "Must payout happen at most once?" (this needs a counter in the IR) |
| `enum_constant_swap` Refunded→Cancelled | Nothing distinguishes the two terminal outcomes | "Is a returned-and-refunded order distinct from a cancelled one?" |
| `fair_remove` (×N) | Liveness depends on fairness that no property checks | Mostly noise; filter these out |

## 10. Assessment

**(a) Markdown→FSL generation.**

Direct LLM generation works when the skill (about 2,900 lines of context) is loaded, but reliability depends on
semantics rather than syntax:

- trans vs invariant gave different counterexamples
- generated carried-field names
- self-loop transitions needed to update a flag
- "a forbidden step is satisfied by a property violation"
- process profile vs kernel-wrapper
- what `fair` implies

The skill itself insists on a human-confirmed formalization memo before writing FSL. A deterministic **IR → FSL
compiler** avoids these traps and keeps name stability, which `diff` needs: renames show up as
`unknown / state_or_action_names_differ`. It also gives exact back-mapping.

The IR needs only a small vocabulary:

- entities with instance bounds
- enum lifecycle and flags/counters per entity
- actions: actor, parameters, guards, effects
- rules: always, never, after-X-never-Y, eventually
- scenarios: concrete steps with expect, and negative scenarios

Recommended split: the LLM produces Markdown → IR, which a human or Comb reviews as plain-language rules; code does
IR → FSL. An LLM can be kept as a repair fallback for exotic rules.

**(b) Is the counterexample JSON enough to generate a question automatically?** Mostly yes. The JSON gives:

- the violated property and its requirement {id, text} (missing for `leadsTo`)
- `violation_kind` / `trace_type`
- the ordered steps (action, params, full state, `changes` diff)
- `last_action`, `violating_bindings`, `checked_to_depth` / `completeness`

That is enough for: "Full refund後にSeller Payoutが実行可能です（REQ-PAYOUT-002に反します）。どちらが正しい？"
("Seller payout can still run after a full refund, which violates REQ-PAYOUT-002. Which is correct?")

- A: Payout is forbidden after a refund (add a guard).
- B: Payout is allowed, and the rule changes to clawback.
- C: Refund after delivery is not allowed (cut an earlier step).

Comb must supply the domain labels and the option generation itself, because:

- Per-step `blame` was empty, so Comb computes the read/write slice over its own IR (trivial).
- `analyze`'s `spec_question` is a generic template that pairs unrelated actions.
- `forbidden` and `acceptance` failures have a different envelope: `result: "error"`, exit 2, and `accepted_trace`
  with no per-step state.

Use `sweep` (or `--instances Entity=1`) to minimize the trace before phrasing the question. Add `mutate` survivors
and `analyze` `divergent_choice` findings as a second question stream for under-specification. `diff` witnesses
serve the change review ("this change removes behavior: …").

**(c) Integration: CLI subprocess plus JSON. Recommended, effectively the only option.** Reasons:

- It is the officially supported surface.
- It is one self-contained binary with no Python and Z3 bundled.
- It is fast: tens of ms per process for `check`.
- Exit codes and the envelope are documented, and runs are cache-friendly and parallel-safe (atomic cache writes).

Library routes:

- **Rust crates:** unpublished; a git dependency on about 208k LOC would couple Comb to internals.
- **WASM worker:** private npm package; building it needs the Rust and wasm toolchain plus z3-solver.
- **Python reference:** frozen, missing features, not on PyPI.

Design the adapter as:

- `FslRunner.verify(spec, opts)` → a typed result. Always pass `--no-cache`, or set a per-repo `FSLC_CACHE_DIR`.
- Validate the input/output against pinned schemas.
- Parse the outputs Comb depends on: `result`, `violation_kind`, `trace[]`, `requirement`, `last_action`,
  `violating_bindings`, `pending_since`, `loop_start`, `accepted_trace`.
- Golden-test them per fslc version.
- Optionally read `fslc kernel` (schema v1) to cross-check compiled names.
- Ship or download a pinned checksummed binary (mise packslip or a release asset).
- Handle the gaps: no Intel Mac (needs Rosetta or no support), and glibc ≥ 2.39 on Linux (old CI images fail).

**(d) Risks.**

1. **Bus factor of about 1 and vendor maturity.** The project is 3.5 months old, has 32 stars, and the issues are in
   Japanese. Development is AI-accelerated at about 10 commits/day with about 23 breaking-flagged changes. Two
   examples of semantic flips: the `implements` exit code, and the domain replay types (#1116).
2. **The counterexample envelope is not schema-locked.** `reproducer.v1` is the stable direction but covers
   invariants only.
3. **Bounded results are not proofs.** BMC `verified` is depth-bounded. Prefer `--engine induction` (proved) or
   `explicit` closure. Comb's UI must not say "verified" for a bounded result, and should reuse FSL's assurance
   classes.
4. **Liveness cost** grows exponentially with the number of entities.
5. **License** is Apache-2.0 and compatible with a commercial product (keep the NOTICE; the Z3 and lark MIT notices
   apply too).

Mitigations:

- Pin the version.
- Make the IR backend-neutral so a fallback (TLA+/Apalache, Alloy, Quint) stays possible.
- Keep the compiler output to a conservative subset (kernel-wrapper requirements, Map/enum/Bool/bounded int,
  invariant/trans/leadsTo/reachable, acceptance/forbidden).
- Contribute fixes upstream; the maintainer is responsive and the license allows a fork.

**(e) Which FSL layer matches Comb's Requirement + Scenario specs?** The **requirements** layer:

- `requirement ID "verbatim text" { actions / invariants / trans / leadsTo }` maps to Comb's Requirement.
- `acceptance` (positive) and `forbidden` (negative, `expect rejected`) map to concrete GIVEN/WHEN/THEN Scenarios.
- `time` / `deadline` covers timeouts.

Use the **kernel-wrapper form**, not the process+data profile. It is multi-entity, uses explicit names, and avoids
the generated `order_paid_out`. A GIVEN that is a symbolic state ("any delivered order") is better compiled into a
`trans` or invariant rule plus one concrete `acceptance` / `forbidden` witness. FSL scenarios are concrete step
sequences; `--from-state` can seed BMC from a full snapshot.

The `business` layer is too coarse: it has no data guards, and a transition rejects `with` / `when` / `set`. The
`design` layer (kernel `spec`) cannot hold `acceptance` / `forbidden`. Keep `implements` / `refine` / `chain` for a
later "design conforms to requirements" feature.

## 11. Suggested v0 pipeline

1. **LLM:** Markdown change proposal → IR delta (YAML/JSON). Comb shows the IR as plain-language rules for
   confirmation, which is the skill's "formalization memo".
2. **Compiler:** IR → `requirements` kernel-wrapper `.fsl`. The `.fsl` is hidden, for example under
   `.comb/build/*.fsl`, with stable names and a sidecar `names.json` (FSL name → Markdown requirement / scenario /
   action label).
3. **Run** `fslc check` (scenario replay), `fslc verify --depth 8`, then `--engine induction` (safety), and liveness
   `--property X --instances E=1`, all through a subprocess.
4. **Turn results into questions:**
   - `violated` → minimize with `--instances E=1` or `sweep` → build the question from the trace, the IR labels,
     and the requirement text → options: guard / relax rule / cut an earlier step.
   - `forbidden` / `acceptance` errors → "scenario contradicts the model" question.
   - `reachable_failed` / `never_enabled_action` → "this can never happen. Intended?"
5. **Async quality pass:** `mutate --by-requirement` survivors and `analyze --profile ai-review` →
   under-specification questions. On change archive, `diff --git` gives a behavior delta summary.
6. **Persist evidence:** assurance class per requirement (proved / bounded(k)), shown in the Markdown status. The
   `ledger` vocabulary can be reused.

## 12. File references

- `README.md` (install, "supported programmatic surface", exit codes)
- `CHANGELOG.md` (45 versions; #1002 implements folding; #1116 breaking; 3.0.0 no Intel Mac)
- `pyproject.toml` (frozen Python 2.7.0, lark + z3-solver, py ≥ 3.9)
- `rust/Cargo.toml` (workspace 4.8.0, `publish = false`, vendored z3)
- `rust/README.md`
- `rust/fsl-wasm/package.json` (private)
- `rust/fslc/cli-contract.json` (CLI contract snapshot)
- `docs/design/DESIGN-kernel-contract.md` (Kernel v1 contract and SemVer policy, L393+)
- `docs/design/DESIGN-reproducer.md`
- `docs/design/DESIGN-incremental-verify.md`
- `docs/manual/LANGUAGE.md` (3,204 lines; requirements profile ~L2265–2345)
- `schemas/fslc/envelope.v1.schema.json`
- `schemas/fslc/kernel/{kernel.v1,kernel.v2,reproducer.v1,replay-trace.v1}.schema.json`
- `schemas/fslc/analysis/analysis-findings.v0.schema.json`
- `schemas/fslc/document/requirement-claims.v1.schema.json`
- `examples/validation/order_refund.fsl`, `examples/pm/cancel_system.fsl`, `examples/e2e/2_requirements.fsl`
- `~/.claude/skills/fsl/SKILL.md`, `~/.claude/skills/fsl/reference.md`
- `~/.claude/skills/fsl-requirements/SKILL.md`, `~/.claude/skills/fsl-delivery/SKILL.md`
- Hands-on: `handson/order_v2_rule.fsl`, `order_v2b_invariant.fsl`, `order_v3_fixed.fsl`,
  `order_reqwrapper_fixed.fsl`, `order_kernel_naive*.fsl`
- Hands-on outputs: `verify_*.json`, `excerpt_verify_v2.json`, `scenarios_v3.json`, `mutate_v3.json`,
  `analyze_v2b.json`, `kernel_v3.json`, `claims_v3.json`, `doc_v2_ja.md`, `ledger_v2.md`, `diff_v3_v3c.json`,
  `repro.json`
