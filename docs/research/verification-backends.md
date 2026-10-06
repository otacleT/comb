> 調査時点: 2026-10-04。調査中に使ったクローンやハンズオンのファイルは一時領域（`.spike/`、git管理外）にあり、本文中のパスはその当時のものです。

# Comb: candidate formal verification backends (research as of 2026-10-04)

Scope: alternatives to FSL for Comb's hidden verification step (stateful, multi-actor, or async workflows → formal model →
model checker → counterexample → clarification question). FSL appears only as a comparison column, based on its README and
GitHub metadata. Its full evaluation is a separate task.
Facts come from GitHub API metadata, release notes, changelogs and official docs pulled on 2026-10-04 (sources at the end).
Note: the brief calls `fslc` Python-based. Its README now says a native Rust `fslc` with bundled Z3 is the authoritative
implementation, and the Python reference is frozen at v2.7.0.

## TL;DR

- **FSL is a reasonable v0 backend.** Three properties matter most for a CLI where users never see the formal language, and
  FSL is the only candidate that has all three: one native binary with no JVM, JSON on stdout for every command, and
  requirement IDs carried natively through diagnostics. Its weak spot is project risk. The repo is 4 months old, almost all
  commits come from one author, and the version is already v4.x with a kernel contract on v2. Mitigate by pinning versions
  and keeping an adapter seam.
- **Quint is the strongest alternative and the most likely second backend.** It is Apache-2.0, backed by a company, ships on
  npm, emits standard ITF JSON traces, and puts Apalache and TLC behind one CLI. The catch: exhaustive `quint verify` needs
  a JDK (Apalache 0.62.x needs Java 21+) and downloads a distribution of about 190 MB. Without the JVM you only get the Rust
  simulator, which finds bugs but cannot return VERIFIED.
- **FizzBee is the most LLM-friendly syntax** (Python/Starlark-like) with exhaustive explicit-state checking, liveness and
  refinement. Against it: one maintainer, no npm or pip package, a Linux archive of about 300 MB, and semi-structured output.
- **TLA+/TLC is the most mature and stable "reference" checker** (MIT, TLA+ Foundation, v1.8.0 released today). It needs a
  JVM. Studies show LLMs write correct TLA+ poorly, which matters less if Comb compiles to it deterministically.
- **Alloy 6 and P are not recommended for v0.** Alloy has gone stale, its JSON output is immature, and complete temporal
  checking needs nuXmv or NuSMV installed separately. P needs .NET 8 + Java 11, and by default it bug-finds rather than proves.
- **Adapter:** in v0, build one implementation behind a seam owned by Comb (normalized IR in → verdicts out), plus a golden
  corpus of IR fixtures with expected verdicts. Do not build multi-backend orchestration in v0.

## Comparison table

| | FSL (README only) | Quint | FizzBee | TLA+ (TLC / Apalache) | Alloy 6 | P |
|---|---|---|---|---|---|---|
| Backing / license | One maintainer (rizumita: ~850 of ~1.1k commits); Apache-2.0 | Quint Co (spun out of Informal Systems, independent since 2025); Apache-2.0 | One maintainer (jp-fizzbee: ~307 of ~320 commits); Apache-2.0 | TLA+ Foundation (Linux Foundation). TLC: MIT. Apalache: Apache-2.0, now under the Foundation | AlloyTools (MIT academic); LICENSE file says MIT for now, Apache-2.0 "not valid yet" | Microsoft origin, heavy AWS use; MIT |
| Latest release / activity | v4.8.1 (2026-10-01); repo created 2026-06-15; ~32 stars; very active | v0.33.0 (2026-09-28); 1.8k stars; monthly or bi-monthly releases | v0.5.4 (2026-10-01); 352 stars; active | tla2tools v1.8.0 (2026-10-04; previous stable 1.7.4 was Aug 2024); Apalache v0.62.3 (2026-10-01) | v6.2.0 (2025-01-09); last commit 2026-06; low activity | NuGet `P` 3.1.0 (2026-06-03); 3.7k stars; PeasyAI 1.0.0 (2026-03) |
| End-user install footprint | Single native binary, ~36–48 MB (linux x64/arm64, macOS arm64, win x64), Z3 bundled. Install script or mise. No npm/PyPI package, no macOS x64 build | `npm i -g @informalsystems/quint` or a ~96–137 MB standalone binary. **verify needs JDK** (Java 21+ for Apalache 0.62.x) and downloads Apalache (~190 MB) | brew or tarball (~33 MB macOS, ~290–350 MB Linux). Bash wrapper + Python parser + Go checker | tla2tools.jar 4.5 MB **+ Java 11+**. Apalache ~190 MB + Java 21+ | alloy.jar + JVM. nuXmv/NuSMV installed separately for complete checks | **.NET 8 SDK + Java 11+**, `dotnet tool install -g P` (or Docker) |
| Exhaustive engine | BMC + k-induction (Z3) + explicit BFS, auto-selected | Apalache (bounded symbolic SMT, inductive invariants) or TLC (explicit-state). Rust simulator is random only | Explicit-state BFS/DFS + random simulation | TLC explicit-state (complete for finite models). Apalache bounded/inductive | SAT-based bounded (default 10 steps); complete only via NuSMV/nuXmv | PChecker: systematic randomized schedule testing (bug-finding). PEx: exhaustive |
| Property kinds | invariants (`ensures`), `reachable`, deadlock (warn/error/ignore), `leadsTo`, refinement, compose, log conformance, vacuity | invariants, temporal (`always`, `eventually`, `leadsTo` since 0.32) via TLC; witnesses; inductive invariants (Apalache) | `always`, `exists` (EF reachability), `always eventually`, `eventually always`, weak/strong fairness, deadlock detection, refinement and composition modes | invariants, deadlock (TLC default), full LTL with fairness, refinement (implementation spec), POSTCONDITION | relational invariants + LTL (future/past), `run` reachability; no deadlock primitive | safety monitors, liveness via hot states. Refinement/proofs only via separate tooling |
| Machine-readable counterexample | JSON envelope on stdout for all commands; shortest-path traces; versioned kernel JSON contract (`fslc/kernel/kernel.v1`; v2 tarball shipped) | **ITF JSON** (`--out-itf`; on verify, Apalache only); `--out` JSON errors (ADR002); `--mbt` adds `mbt::actionTaken` / `mbt::nondetPicks` per step | Stdout text trace with JSON-encoded states + `error-graph.json` / `.dot` / `.html` in `out/run_*`. No documented stable schema | TLC: `-dumpTrace json file`, plus `-tool` structured messages. Apalache: ITF JSON | `exec -t json` exists but immature (instances missing, mixed stdout; issues #253/#254) | `PCheckerOutput/BugFinding/*.trace.json` + text logs |
| Mapping a trace to requirement IDs | **Native**: requirement IDs propagate through diagnostics | Via naming plus a source map; `mbt::actionTaken` names each step's action | Action names in trace; need own source map | Action names in trace; need own source map | Hard: steps carry no action labels unless an event relation is modeled | Event/handler names in trace; need own map |
| LLM authoring fit | Built for LLM write/verify/repair loops (JSON diagnostics, repair protocol in skills). Very little pretraining data | Good: typed, TS-like, `QNTxxx` error codes, REPL; growing corpus; Quint team says it tunes the language for LLMs | Best syntax prior (Python-like); FizzBee-specific gotchas (atomic vs serial, indentation) | Most training data, but hard syntax and semantics. One study: ≤26.6% parse, 8.6% semantically correct across 30 LLMs | Moderate data; relational frame conditions trip up LLMs | C#-like; PeasyAI uses RAG over 1,200+ examples |
| Deterministic compiler from a small IR (states, actions with guard/effect, invariants) | Easy, but the target grammar is still changing quickly | Easy (`action = all { guard, x' = ... }`, `step = any {...}`); TLA+ export available | Easy (indentation-sensitive) | Easy (mechanical `UNCHANGED`, plus a `.cfg` file) | Medium (relational encoding, frame axioms) | Medium (machines and events, plus a test driver to close the environment) |
| Agent / LLM tooling | 7 Agent Skills (business/requirements/design/review/delivery/from-code/doc), LSP, VS Code | Agent Skills (`quint-lang`, `quint-modeling`), Claude Code plugin, `quint-llm-kit` (agents + MCP servers quint-lsp / quint-kb; "internal use, as-is") | 4 Agent Skills via `fizz install-skills`; author says MCP is in progress | MCP server bundled in the VS Code TLA+ extension; community `tlaplus-mcp` (npx + Java) | None official | PeasyAI MCP server (27 tools, 14 resources) |
| Small workflow models (≈10²–10⁶ states) | Seconds; BMC depth-bounded; k-induction may give UNKNOWN on non-inductive invariants | Simulator: very fast but incomplete. TLC: seconds incl. JVM start. Apalache: several seconds of startup, cost grows with depth | Fine at this scale; slower per state than TLC (Starlark interpretation) | TLC excellent (JVM start ~1 s); Apalache as Quint | Fine for small scopes and steps | Fast iterations; no proof of absence by default |
| Main risk for Comb | Bus factor 1, version churn, young | JDK for real proofs; pre-1.0 language | Bus factor 1; packaging; output schema | JVM; no first-class JSON result object | Stale; JSON; temporal licensing | Heavy runtime; actor-centric; not a prover |

## Notes per candidate

**Quint.** This is the best-run alternative. It ships often (v0.31 to v0.33 in 2026 added a TLC backend, Rust-backend parity,
`leadsTo`, and fixes for temporal action properties). It is distributed on npm, which suits a Node CLI, and it puts both
Apalache (bounded symbolic, inductive invariants) and TLC (explicit-state, temporal) behind one CLI. The output story is the
best of the alternatives: ITF is a documented, tool-neutral JSON trace format with readers in Python and Rust, and `--mbt`
records which action fired at each step. That makes mapping a trace back to an IR action trivial if action names encode IR
IDs. The trade-off is that "zero-config" only covers simulation. A VERIFIED verdict needs a JDK, Java 21+ since the Apalache
0.62.1 default, and Quint fetches the Apalache distribution on first verify. Also, `--out-itf` on `verify` works only with
the Apalache backend. For Comb this argues for Quint as a second backend for users who already have Java (or for CI), not as
the v0 default.

**FizzBee.** Of all the candidates, its language is closest to what an LLM writes fluently, and it covers the property set
Comb needs: `always`, `exists` (scenario reachability), liveness with fairness, deadlock detection, and refinement and
composition modes in the checker. Distribution is the weak point. The `fizz` entry point is a Bash script that runs a Python
parser and a Go checker, there is no npm or pip package, and the Linux archives are about 300 MB. Results arrive as human
text plus `error-graph.json`, with no versioned schema. Almost all development comes from one author. It is a good fit if
Comb lets an agent author models directly, and a weaker fit for deterministic compilation from IR.

**TLA+ (TLC / Apalache).** This is the gold standard. It is Foundation-governed, MIT-licensed, has the deepest semantics
(full LTL with fairness, refinement) and the most examples. tla2tools v1.8.0 shipped today, the first stable release since
2024 (its notes appear partly carried over from 1.7.x). TLC is small (4.5 MB jar), but every user needs Java 11+. Results
come from `-dumpTrace json` plus parsing tool-mode output, so there is no first-class JSON verdict. LLM-authored TLA+ is
unreliable (≤26.6% parse rate, 8.6% semantically correct in a 30-model study), so Comb should only ever *compile* to TLA+. It
works as an "oracle" backend in CI for differential testing, reached either directly or through Quint's `--backend tlc`.
PlusCal (bundled) is easier for humans but adds nothing for a compiler.

**Alloy 6.** Its strength is structural constraints such as permission and role matrices. Alloy 6 added `var` and LTL, but
traces have no action labels, and the default check is bounded to 10 steps. Complete checking needs NuSMV or nuXmv installed
by the user, and nuXmv's license is non-commercial. Releases have stalled since 6.2.0 (Jan 2025), and the CLI's JSON output
has open issues. Not a fit for workflow counterexample → question loops.

**P.** It is semantically well matched to async multi-actor systems (machines exchanging events, which suits payment
webhooks and payout queues), proven at AWS, and has the richest dedicated LLM tooling (the PeasyAI MCP server). But end
users would need .NET 8 SDK + Java 11+. The default checker is randomized systematic testing, which finds bugs but cannot
honestly return VERIFIED, and models need hand-written test drivers. Better as inspiration for an "async/actor" IR extension
than as a backend.

**Others (brief).** XState/Stately (`@xstate/graph` shortest/simple paths; MIT, pure JS) can enumerate paths of finite
statecharts with no install, but it is not a property checker over data. That makes it useful for scenario and test
generation, not verification. Comb's v0 IR is small (enums, bounded ints, a few instances), so an **in-house explicit-state
BFS in TypeScript** is also feasible, a few hundred lines covering invariants, reachability and deadlock with shortest
traces. It could serve as a zero-dependency reference implementation of the adapter contract and as a differential oracle.
It would not cover liveness or proofs. Treat it as optional, not as a v0 deliverable.

## Recommendation

1. **Use FSL for v0**, on these conditions:
   - Comb generates FSL **deterministically from its own IR**, using an LLM only upstream (NL/spec → IR), so the hidden
     formal text is never hand- or LLM-written.
   - Pin an exact `fslc` version, keep a checksum per platform, and install via a postinstall download or optional
     per-platform npm packages, since FSL publishes none itself. Plan for the missing macOS x64 build.
   - Read only the documented JSON envelope / kernel contract, never human output.
   - Treat BMC "no violation up to depth k" as **bounded** evidence (see `assurance` below). Promote it to VERIFIED only when
     k-induction or the explicit engine finishes exhaustively.
   - Track project health (releases, breaking changes in the kernel contract) as an explicit risk.
   FSL wins over Quint and FizzBee for v0 on footprint (no JVM, one binary), output (JSON-first, requirement IDs native), and
   semantic fit (its requirements layer, vacuity and reachability checks map directly onto Requirements + Scenarios).
2. **Second backend, when one is needed: Quint** (npm-native, ITF, company-backed, TLC and Apalache in one CLI), or TLC
   directly if JSON parsing of TLC is acceptable. Add it when one of these happens: FSL stalls or breaks its contract,
   users need complete liveness proofs FSL cannot give, a platform cannot run the FSL binary, or you want differential
   testing in CI.
3. **Do not choose FizzBee as the default.** Reconsider it if Comb ever exposes models that agents author directly.

## Verification Adapter: interface sketch

The design principle is that Comb owns the IR, the property language, the verdict semantics and the trace shape. A backend
only compiles, runs, and maps results back. The question generator never sees backend names, source positions or syntax.

```ts
// ---- Input: Comb-owned, versioned, backend-neutral ----
type ReqRef = { requirementId: string; scenarioId?: string; specPath: string };
interface NormalizedModel {
  schema: "comb.model/v1"; id: string; specHash: string;
  types: Record<string, { kind: "enum"; values: string[] } | { kind: "int"; min: number; max: number }>;
  actors: { id: string; instances: number }[];                       // finite, symmetric where possible
  variables: { id: string; type: TypeRef; perInstanceOf?: string; init: Expr; source: ReqRef[] }[];
  actions: { id: string; actor?: string; params: { name: string; type: TypeRef }[];
             guard: Expr; effects: { target: LValue; value: Expr }[];      // unassigned vars = unchanged
             fairness?: "none" | "weak" | "strong"; source: ReqRef[] }[];
  bounds: { maxDepth: number };
}
type Expr = /* small closed AST: const | var | param | not/and/or/implies | eq/neq/lt/le | add/sub
               | in(set) | forall/exists over a finite domain | ite */ unknown;
interface Property {
  id: string; source: ReqRef[];
  kind: "invariant" | "reachable" | "unreachable" | "deadlockFree" | "leadsTo" | "actionEnabledOnlyIf";
  expr?: Expr; from?: Expr; to?: Expr; actionId?: string;            // shape depends on kind
}
// ---- Output ----
type Verdict = "VERIFIED" | "VIOLATION" | "UNKNOWN" | "ERROR";
interface PropertyResult {
  propertyId: string; source: ReqRef[]; verdict: Verdict;
  assurance?: "exhaustive" | "inductive" | { boundedDepth: number } | { sampled: number }; // why VERIFIED/UNKNOWN
  trace?: Trace;                    // VIOLATION, or witness for "reachable" (the meaning flips; see below)
  reason?: { code: "TIMEOUT" | "UNSUPPORTED_PROPERTY" | "BOUND_REACHED" | "COMPILE_ERROR"
                 | "BACKEND_MISSING" | "BACKEND_CRASH" | "INCOMPLETE_ENGINE"; detail: string };
}
interface Trace { steps: { i: number; actionId: string | null; actor?: string; params?: Record<string, Value>;
                           state: Record<string, Value>; changed: string[] }[];
                  loopStart?: number; failingStep: number }            // loopStart for liveness lassos
interface VerificationBackend {
  id: string; version(): Promise<string>;
  capabilities(): { kinds: Property["kind"][]; fairness: boolean; complete: boolean; bounded: boolean };
  check(model: NormalizedModel, props: Property[], opts: { timeoutMs: number; workDir: string })
    : Promise<{ results: PropertyResult[]; backend: { id: string; version: string; artifactSha256: string };
                durationMs: number; artifacts?: string[] }>;   // keep generated .fsl/.qnt for debugging only
}
```

Semantics to fix now, since they are hard to change later:
- **Verdict per property, not per run.** One run can return VIOLATION for P1 and VERIFIED for P2.
- **`reachable` flips the meaning.** Finding a trace is success (VERIFIED, with the trace kept as a witness that can become
  an example in the spec). Not finding one is VIOLATION ("this scenario can never happen"), and that drives a clarification
  question.
- **VERIFIED needs `assurance`.** Bounded or sampled evidence is reported as UNKNOWN with `BOUND_REACHED`, or as VERIFIED
  with a bounded assurance that the UI words differently. Pick one rule and keep it consistent.
- **Timeout gives UNKNOWN, not ERROR.** ERROR is reserved for Comb or compiler bugs and missing or crashed backends.
- **Source map.** Each adapter compiles IR IDs to backend-safe names deterministically (for example
  `a_<hash>__REQ_PAY_003`) and keeps a `nameMap` so it can translate traces back. Backend-native requirement IDs (FSL)
  are a convenience and must not be relied on.
- **Unsupported property kinds** return UNKNOWN with `UNSUPPORTED_PROPERTY`. They are never silently dropped.
- **Determinism and caching.** Cache key = hash(IR, properties, backend id and version). Traces are canonicalized
  (shortest first, stable variable order) so the same input gives the same question text.

**Build a seam in v0, not a multi-backend system.** Ship exactly one `VerificationBackend` (FSL), the IR and result JSON
Schemas, and a **contract corpus**: about 20–40 small IR fixtures (order/payment/refund/timeout/permission) with expected
verdicts and trace shapes, run in CI. The corpus pins FSL upgrades, catches compiler regressions, and is the acceptance test
for any future backend. Leave out backend selection UIs, portfolio or racing runs, and result merging. Add them only when a
second backend actually lands, and then begin with differential runs in CI before exposing a choice to users.

## Sources

- FSL README / releases: https://github.com/ymm-oss/fsl , https://github.com/ymm-oss/fsl/releases (v4.8.1, 2026-10-01)
- Quint repo + CHANGELOG (v0.33.0 2026-09-28; Apalache 0.62.1 needs Java 21+; TLC backend v0.31; `leadsTo` v0.32):
  https://github.com/quint-co/quint , https://github.com/quint-co/quint/blob/main/CHANGELOG.md
- Quint docs: https://quint.sh/docs/getting-started (JDK needed for verify), https://quint.sh/docs/quint (`--out-itf`,
  `--out`, `--mbt`, `--backend`), https://quint.sh/about (Quint Co spin-out), https://quint.sh/posts/llm_era (2025-11-17)
- Quint skills / LLM kit: https://github.com/quint-co/quint/tree/main/skills , https://github.com/quint-co/quint-llm-kit
- ITF format: https://apalache-mc.org/docs/adr/015adr-trace.html
- Apalache: https://github.com/apalache-mc/apalache (v0.62.3 2026-10-01; TLA+ Foundation; Java 21+ per docs/installation/jvm.md)
- TLA+ tools: https://github.com/tlaplus/tlaplus/releases/tag/v1.8.0 , https://github.com/tlaplus/tlaplus/blob/master/USE.md
  (Java 11+, `-dumpTrace json`), https://github.com/tlaplus/tlaplus/blob/master/general/docs/current-tools.md
- TLA+ MCP: https://github.com/tlaplus/vscode-tlaplus/issues/485 , https://github.com/richashworth/tlaplus-mcp
- LLM→TLA+ studies: https://arxiv.org/abs/2606.05792 (≤26.6% syntactic / 8.6% semantic), https://arxiv.org/abs/2509.23130 (SysMoBench)
- FizzBee: https://github.com/fizzbee-io/fizzbee (README, `fizz` script, main.go refinement/composition, examples/references/
  LANGUAGE_REFERENCE.md, baseline outputs with `error-graph.json`), https://fizzbee.io/design/tutorials/liveness/ ,
  https://news.ycombinator.com/item?id=45503780 , https://testguild.com/podcast/a565-jayaprabhakar/
- Alloy 6: https://github.com/AlloyTools/org.alloytools.alloy (v6.2.0 2025-01-09), https://alloytools.org/alloy6.html ,
  JSON issues https://github.com/AlloyTools/org.alloytools.alloy/issues/253 and /254
- P: https://github.com/p-org/P , https://p-org.github.io/P/getstarted/install/ , NuGet `P` 3.1.0 (2026-06-03),
  PeasyAI https://github.com/p-org/P/tree/master/Src/PeasyAI
- XState graph / MBT: https://stately.ai/docs/graph
