> 調査時点: 2026-10-04。調査中に使ったクローンやハンズオンのファイルは一時領域（`.spike/`、git管理外）にあり、本文中のパスはその当時のものです。

# OpenSpec research note (for Comb Reuse / Adapt / Avoid)

Source: `git clone --depth 50 https://github.com/Fission-AI/openspec` → `scratchpad/openspec` (HEAD `2500d6d`, 2026-10-02).
All paths below are relative to that clone. Read from source, not only README.

---

## 0. TL;DR

- OpenSpec = **TypeScript CLI (`openspec`) + generated Agent Skills / slash commands + repo-local Markdown** under `openspec/`.
  Since 1.0 ("OPSX"), the CLI is a **state/instruction server**. Generic skills call `openspec status|instructions --json` and
  receive the next artifact's template, instruction, project context and rules. Artifact kinds and their order are data
  (`schema.yaml`, an "artifact graph"), not code.
- The **only deterministic semantics** are: (a) a hand-rolled Markdown structure parser (`### Requirement:` / `#### Scenario:`),
  (b) structural lint (≥1 scenario, SHALL/MUST, length limits), and (c) a requirement-block **delta merge** (ADDED/MODIFIED/
  REMOVED/RENAMED) run on archive. Everything semantic (verify, conflict resolution, "intelligent" sync, ambiguity discovery)
  lives in very long prompts. The 12 generated skills total ~178 KB.
- Artifact completion is **file existence only**. There is no notion of a requirement being correct, consistent, or traced.
  Requirements have no stable IDs (identity = header text). No base-version fingerprint for MODIFIED deltas.
- For Comb, the UX scaffolding is excellent to borrow: change folders, delta ops, the artifact graph, JSON agent contract,
  multi-tool skill installer, and the context/rules injection. The weak spots are exactly where an FSL backend adds value.

---

## 1. Snapshot / maturity

| Item | Value |
|---|---|
| Package | `@fission-ai/openspec` **1.14.0** (tag `v1.14.0`, released 2026-09-30); `package.json` |
| Repo | created 2025-08-05; ~71k stars, ~4.9k forks, 184 open issues (gh api, 2026-10-04) |
| Cadence | 50 commits in ~10 days (2026-09-23 → 10-02). 52 CHANGELOG versions. 1.0.0 = "OPSX release" (`CHANGELOG.md:904`) |
| License | MIT (`LICENSE`) |
| Runtime | Node ≥ 20.19, ESM, pnpm. `bin/openspec.js` → `dist/cli/index.js` |
| Deps (10) | commander, @inquirer/core+prompts, chalk, ora, zod 4, yaml, fast-glob, diff, cross-spawn |
| Size | npm unpacked 2.18 MB; `src/` 210 files ≈ 49.6k LOC; `test/` 217 test files ≈ 85k LOC |
| Telemetry | PostHog **on by default** (command name + version), via `edge.openspec.dev`. Opt out with `OPENSPEC_TELEMETRY=0` or `DO_NOT_TRACK` (`src/telemetry/index.ts:30`, `src/telemetry/opt-out.ts`) |
| Dogfooding | the repo's own `openspec/` has 37 capability specs (5.7k lines), ~30 active changes, and a `config.yaml` |

Maturity read: very popular and fast-moving. The core lifecycle is stable. The beta areas are `stores`, `worksets`,
`references` and `context` (multi-repo planning; `docs/stores-beta/User-guide.md`). The codebase is heavily
defensive: long comments that cite issue numbers, path-safety checks, Windows edge cases. Most churn goes to tool
adapters and to hardening prompts.

---

## 2. Repository structure / build

```
bin/openspec.js          entry shim
src/cli/index.ts         Commander program; every action lazy-imports its implementation (perf, #2025)
src/cli/commands/*.ts    register* fns for spec|config|schema|store|doctor|context|workset groups
src/commands/            command implementations (validate, show, change, schema, workflow/{status,instructions,new-change,...})
src/core/
  artifact-graph/        schema.yaml model: types.ts (zod), graph.ts (Kahn topo), state.ts (file-existence), resolver.ts, instruction-loader.ts
  parsers/               markdown-parser.ts, requirement-blocks.ts (delta parser), change-parser.ts, spec-structure.ts, requirement-text.ts
  validation/            validator.ts (1087 LOC), constants.ts (rules + messages), task-*.ts
  specs-apply.ts         delta → main-spec merge (1393 LOC)
  archive.ts             archive command (2408 LOC: validation, merge, atomic move, retirement)
  command-generation/    ToolCommandAdapter registry + ~34 per-tool adapters
  shared/                skill-generation.ts, skill-paths.ts, tool-detection.ts, allowed-tools.ts
  templates/workflows/   12 skill/command prompt templates as TS strings (~5.2k LOC)
  init.ts, update.ts, legacy-cleanup.ts, migration.ts, profiles.ts, global-config.ts, project-config.ts
  store/, references.ts, worksets.ts   multi-repo "stores" (beta)
schemas/spec-driven/     built-in workflow schema.yaml + templates/{proposal,spec,design,tasks}.md
skills/                  pre-rendered SKILL.md copies for skills.sh distribution (parity-tested)
docs/                    user docs + docs/agent-contract.md (JSON contract)
openspec/                dogfooded specs/changes for OpenSpec itself
```

Build: `node build.js` (tsc). Tests: vitest. Lint: eslint + typescript-eslint. Release: changesets. CI covers
Linux/macOS/Windows plus a Nix flake (`.github/workflows/ci.yml`, `flake.nix`).

---

## 3. CLI architecture

Commander-based, verb-first. Every command is defined in `src/cli/index.ts`, and its action does `await import(...)`, so
`--help` stays cheap. Errors go through `failWithError()`: in `--json` mode it prints exactly one JSON doc, with a
`status: [diagnostic]` array, to stdout and exits 1.

| Command | Purpose |
|---|---|
| `init [path] --tools a,b\|all\|none --profile --language` | scaffold `openspec/{specs,changes/archive}` + `config.yaml`, install skills/commands per tool |
| `update [path]` | regenerate skills/commands for detected tools (profile/delivery aware) |
| `new change <name> [--schema] [--goal] [--description]` | create `changes/<name>/.openspec.yaml` |
| `status --change <id> [--all] --json` | artifact graph state: done/ready/blocked/skipped, nextSteps, actionContext |
| `instructions <artifact\|apply\|archive> --change <id> --json` | enriched instruction payload for the agent |
| `list [--specs\|--archived\|--all] --json`, `show <item> [--json --diff --deltas-only]`, `view` (TUI dashboard) | read |
| `validate [item] [--all\|--changes\|--specs] [--strict] [--json] [--report findings]` | structural validation |
| `archive [change] [-y] [--skip-specs] [--no-validate] --json` | merge deltas into main specs, then move the folder to `archive/YYYY-MM-DD-<name>` |
| `schema which\|validate\|fork\|init`, `schemas`, `templates` | custom workflow schemas |
| `config …`, `store …`, `workset …`, `context`, `doctor`, `completion …`, `feedback`, `version` | misc / beta |
| `change show\|list\|validate` | deprecated noun-first aliases |

Agent JSON contract: `docs/agent-contract.md`, which says it is verified against src. Diagnostics use one envelope:
`{severity, code, message, target?, fix?}`. Root resolution follows a single precedence order: `--store` → nearest
`openspec/` → declared store pointer → global default store → error. A documented wart: key casing is mixed
(snake_case for store payloads, camelCase for workflow payloads).

---

## 4. Artifact model and exact formats

### 4.1 Workflow schema = artifact graph (`schemas/spec-driven/schema.yaml`; zod in `src/core/artifact-graph/types.ts`)
```yaml
name: spec-driven
version: 1
artifacts:
  - id: proposal   generates: proposal.md       template: proposal.md  requires: []
  - id: specs      generates: "specs/**/*.md"   template: spec.md      requires: [proposal]
  - id: design     generates: design.md         template: design.md    requires: [proposal]
  - id: tasks      generates: tasks.md          template: tasks.md     requires: [specs, design]
    # each artifact also has description + a long `instruction:` prompt (the real authoring guidance)
apply: { requires: [tasks], tracks: tasks.md, instruction: "..." }
```
- `ArtifactGraph` (`graph.ts`) does Kahn topological order, `getNextArtifacts`, and `getBlocked`. Ties break by
  declaration order (the code comments explain why).
- `detectCompleted()` (`state.ts`) marks an artifact **done iff its `generates` path/glob exists**. That is the whole
  completion model. The community `anvil` schema doc says so outright: "OpenSpec only checks that artifacts exist, so
  enforce the gate with your own CI or hook" (`docs/customization.md:425`).
- Schema validation (`schema.ts`): duplicate ids, unknown `requires`, `apply.requires` references, cycle DFS, max 1000
  artifacts, relative-path safety. That is all.
- An artifact `instruction` may **delegate to another skill/command**. The propose skill is told: "If the `instruction`
  field delegates creation to a specific skill or command, invoke it" (`src/core/templates/workflows/propose.ts`).
  This is a real extension hook.

### 4.2 Main spec — `openspec/specs/<capability-path>/spec.md` (nested paths allowed, e.g. `identity/user-auth`)
```markdown
# <Title>
## Purpose
<≥50 chars, else warning>
## Requirements
### Requirement: Change Selection
The command SHALL support both interactive and direct change selection methods.

#### Scenario: Interactive selection
- **WHEN** no change-name is provided
- **THEN** display interactive list ...
- **AND** allow user to select one
```
Other `##` sections are allowed and ignored (e.g. "Command Syntax" in `openspec/specs/cli-archive/spec.md`).
Requirement identity = **normalized header text** (case-sensitive; case/whitespace "fold" used only for typo
detection; `requirement-blocks.ts:17-35`). Scenario bodies are stored as `rawText`. WHEN/THEN/AND are **never parsed**,
and a body only has to be non-empty (`requirement-text.ts:43`).

### 4.3 Change folder — `openspec/changes/<kebab-id>/`
```
.openspec.yaml        schema: spec-driven / created: 2026-09-04 / goal? / skip_specs? / retire_capabilities? / affected_areas? / initiative?
proposal.md           ## Why / ## What Changes / ## Capabilities (### New / ### Modified) / ## Impact
specs/<cap>/spec.md   delta spec (below)
design.md             ## Context / ## Goals / Non-Goals / ## Decisions / ## Risks / Trade-offs (/ Migration Plan / Open Questions)
tasks.md              ## 1. Group  /  - [ ] 1.1 Task … (verification stated in the task text)
```
(`src/core/change-metadata/schema.ts`; templates in `schemas/spec-driven/templates/`). The proposal's `## Capabilities`
list is described as the contract between the proposal and specs phases. It is **not machine-checked** against the
delta files.

### 4.4 Delta spec format (parsed by `src/core/parsers/requirement-blocks.ts::parseDeltaSpec`)
```markdown
## Purpose                      <- only for NEW capabilities; copied into the created main spec
## ADDED Requirements
### Requirement: User can export data
The system SHALL allow users to export their data in CSV format.
#### Scenario: Successful export
- **WHEN** user clicks "Export"
- **THEN** system downloads a CSV file
## MODIFIED Requirements         <- must contain the ENTIRE block (header must match exactly) incl. all existing scenarios
## REMOVED Requirements
### Requirement: Legacy export
**Reason**: Replaced by new export system
**Migration**: Use /api/v2/export
   (or bullet form:  - `### Requirement: Legacy export`)
## RENAMED Requirements
- FROM: `### Requirement: Old name`
- TO: `### Requirement: New name`
```
Section headers are case-insensitive. Unpaired FROM/TO, orphan requirements outside delta sections, and
non-canonical `###` headers are all reported (`DeltaPlan` fields `unpairedRenames`, `orphanedRequirements`,
`skippedHeaders`).

### 4.5 Project config — `openspec/config.yaml` (`src/core/project-config.ts`)
```yaml
schema: spec-driven
context: |            # ≤50 KB, injected into every instructions payload (not copied into artifacts)
  Tech stack: ...
rules:                # per-artifact-id bullet constraints, additive to schema instruction
  specs: [ "Include scenarios for Windows path handling ..." ]
  design: [ ... ]
operations: { apply: { guidance: [...] }, archive: { guidance: [...] } }
store: <id>           # optional pointer to a planning store repo
references: [...]     # read-only upstream stores (beta)
```
Global config (`~/.config/openspec/config.json`, XDG): `profile: core|custom`, `delivery: both|skills|commands`,
custom workflow list, telemetry, `defaultStore`.

---

## 5. Change lifecycle

There is no explicit state field. State is derived from the filesystem:

1. **Explore** (optional, prompt-only): `/opsx:explore` is a conversational thinking partner that is told
   "track decisions in the conversation, not in files" (`templates/workflows/explore.ts`).
2. **Create**: `openspec new change <id>` writes `.openspec.yaml`.
3. **Plan**: the agent loops `status --json` → first `ready` artifact → `instructions <id> --json` → writes the file →
   re-runs status. `/opsx:propose` (or `ff`) does all artifacts in one go; `/opsx:continue` does one at a time.
   Propose enforces a **planning boundary**: no code edits, stop after artifacts.
4. **Apply**: `instructions apply --json` returns `state: blocked|ready|all_done`, `tasks[]` with `sourcePath`/`line`,
   `contextFiles`, and progress. The agent ticks `- [x]` at the exact line. Progress is computed from checkboxes in
   `apply.tracks`.
5. **Verify** (prompt-only): `/opsx:verify` reports Completeness/Correctness/Coherence with CRITICAL/WARNING/SUGGESTION.
   It works by "keyword search, file path analysis, reasonable inference" (`templates/workflows/verify-change.ts:200`).
6. **Sync** (optional, agent-driven): `/opsx:sync` has the **LLM edit main specs** using "intelligent merge"
   (`templates/workflows/sync-specs.ts`).
7. **Archive**: either the CLI `openspec archive` (deterministic merge) or the `/opsx:archive` skill (assess sync state,
   run the sync inline, re-verify structure, then `mv` to `changes/archive/YYYY-MM-DD-<id>`).
   CLI archive gates: delta validation (blocking unless `--no-validate --yes`) and incomplete tasks (prompt, or `--yes`).
   Proposal-level warnings are informative only.

`skip_specs: true` lets a change have zero deltas (refactor/docs). Otherwise `validate` rejects zero-delta changes.
`retire_capabilities: true` is required before archive may delete a main spec whose last requirement was removed.

---

## 6. Delta merge on archive (`src/core/specs-apply.ts::buildUpdatedSpec`, archive in `src/core/archive.ts`)

- **Pre-validation** (throws): duplicates within each section; cross-section conflicts (MODIFIED+REMOVED,
  MODIFIED+ADDED, ADDED+REMOVED); MODIFIED must use the *new* name after a RENAME; RENAMED TO must not collide with ADDED.
- **Apply order: RENAMED → REMOVED → MODIFIED → ADDED** (`specs-apply.ts:439`). The map is keyed by requirement name
  and the original order is preserved, with new blocks appended at the end.
  - RENAMED: source missing but target present → no-op ("early-sync"). Target exists → error. A near-miss by case
    → error.
  - REMOVED: missing → warning, treated as already removed, *unless* a case-variant exists (typo → error).
  - MODIFIED: missing → error. The whole block is replaced. **Scenario-loss guard**: if the current block has scenario
    names that the incoming block lacks, abort (multiplicity-aware; `diffScenarioNames`). Identical content counts as
    already synced.
  - ADDED: same name with identical content → no-op. Different content → error. A case/space variant → error ("use
    MODIFIED").
- New capability: only ADDED is allowed. A skeleton is built with a delta `## Purpose`, or with the placeholder
  `TBD - created by archiving change <x>. Update Purpose after archive.`, which validation then flags.
- The rebuilt spec is validated before any write. The destination name is claimed first (`.openspec-archive.lock`),
  the move is copy-verify-remove with fingerprints, and retirement keeps backups. That is a lot of engineering for
  atomicity across FS edge cases.
- `validate` dry-runs `buildUpdatedSpec` and reports "Archive would refuse this delta" as INFO
  (`validator.ts::findArchiveBlockers`).
- **Known unsolved problem**: parallel changes touching the same requirement. `openspec-parallel-merge-plan.md`
  documents silent scenario loss when B's MODIFIED was authored against a pre-A baseline. It proposes base
  fingerprints (`meta.json` with SHA of the base requirement) and rebase UX. **Not implemented.** Only the
  scenario-name guard exists, so text edits *inside* a scenario or in the requirement body are still silently
  overwritten.
- **Two merge engines disagree**: the CLI requires full MODIFIED blocks and treats ADDED-existing as an error. The
  agent-driven `/opsx:sync` prompt allows partial MODIFIED ("add a scenario without copying the entire requirement")
  and treats ADDED-existing as an implicit MODIFIED. The `/opsx:archive` skill uses the agent sync by default.

---

## 7. Parsing and validation

- **Parser**: hand-rolled, line-based regex over `^#{1,6}\s+` with a code-fence mask (`parsers/markdown-parser.ts`,
  `code-fence.ts`). There is no remark/mdast. BOM and CRLF are normalized. The many comments about `#` closing runs,
  NBSP, and fences show that a fragile surface syntax costs ongoing bug-fixing (e.g. "Scenarios MUST use exactly 4
  hashtags … will fail silently", which the schema instruction itself warns about).
- **Legacy oddity**: if no delta files exist, `parseDeltas()` infers operations from `What Changes` bullets by keyword
  regex (`add|create|new` → ADDED, etc.; `markdown-parser.ts:188-226`).
- **Rules** (`validation/constants.ts`, `validator.ts`, zod in `core/schemas/*.ts`):
  - ERROR: missing Purpose/Requirements sections; requirement with empty body; requirement with 0 scenarios
    (delta/zod); zero deltas without `skip_specs`; duplicate or conflicting delta entries; unpaired RENAMED; delta file
    outside `specs/<cap>/spec.md`; `skip_specs` alongside spec files; scenario loss against the main spec (when
    `mainSpecsDir` is given); main spec containing delta headers, requirements outside `## Requirements`, or duplicate
    requirements.
  - WARNING: body lacks the English `SHALL|MUST` (a regex `\b(SHALL|MUST)\b`; guidance-only since multi-language
    support); requirement text >500 chars; Purpose <50 chars or still the placeholder; main-spec requirement with no
    scenarios; >10 deltas; task numbering/checkbox issues; unknown `.openspec.yaml` keys.
  - Why must be 50–1000 chars (zod, ChangeSchema).
  - INFO: "archive would refuse", `skip_specs` accepted, skipped non-canonical headers.
  - `--strict`: warnings fail too (`validator.ts:1003`).
- **JSON**: `validate --json` → `{items:[{id,type,valid,issues:[{level,path,message,line?,column?}],durationMs}],summary,version:"1.0",root}`.
  `show --json` returns requirements as `{name,text,scenarios:[{name,rawText}]}`. `-r <n>` selects by **1-based index**,
  since there are no IDs.
- **No semantic checks at all**: no cross-requirement contradiction detection, no cross-spec consistency, no check that
  scenarios cover the requirement, no check that tasks reference requirements, and no check that the proposal's
  Capabilities list matches the delta files.

---

## 8. Agent integration

- **Tool registry**: `AI_TOOLS` in `src/core/config.ts` lists about 50 tools. Each entry has `skillsDir` (project) or
  `globalSkillsDir` (home), `detectionPaths`, `legacySkillsDirs`, and `requiresIdeRestart`. Claude → `.claude`,
  Cursor → `.cursor`, Codex → `.agents` (legacy `.codex`), Copilot → `.github`, plus a vendor-neutral `agents` target
  (`.agents/skills`). Aliases cover rebrands (`windsurf` → `devin`).
- **Skills** (Agent Skills standard): `<projectRoot>/<skillsDir>/skills/openspec-<workflow>/SKILL.md`
  (`shared/skill-paths.ts`). Frontmatter comes from `shared/skill-generation.ts::generateSkillContent`:
  ```yaml
  name: openspec-propose
  description: Propose a new OpenSpec change ... Also use when the user says "openspec propose" or "opsx propose".
  allowed-tools: Bash(openspec:*)        # pre-approve the CLI only
  license: MIT
  compatibility: Requires openspec CLI.
  metadata: { author: openspec, version: "1.0", generatedBy: "1.14.0" }
  ```
- **Slash commands**: a `ToolCommandAdapter {toolId, getFilePath(id), formatFile(content), invocationPrefix?}`
  per tool (`command-generation/types.ts`, ~34 adapters, `registry.ts`). Claude: `.claude/commands/opsx/<id>.md` with
  `name/description/allowed-tools/category/tags`, invoked as `/opsx:<id>`. Cursor: `.cursor/commands/opsx-<id>.md`,
  invoked as `/opsx-<id>`. Some tools use TOML or YAML formats. Bodies are written once with `/opsx:<id>`, and the
  generator rewrites invocation spelling per tool (`generator.ts`, `utils/command-references.ts`). Codex and Warp are
  `skills-invocable` with no command files (`command-surface.ts`).
- **Delivery and profiles**: `delivery: both|skills|commands` decides HOW. `profile: core` = propose, explore, apply,
  update, sync, archive; `custom` picks from 12 workflows (`profiles.ts`). Templates contain
  `[[opsx:if-workflow X]]…[[opsx:else]]…[[opsx:end]]` conditionals, resolved at generation so no generated file names
  an uninstalled workflow (`templates/optional-workflow.ts`).
- **Refresh**: `openspec update` detects configured tools, reads `generatedBy` from SKILL.md (commands fall back to
  content equality), regenerates what is stale, and deletes files for deselected workflows or delivery modes
  (`update.ts`, `shared/tool-detection.ts`, `profile-sync-drift.ts`). **The CLI owns these files. Users must not edit
  them**; customization goes through `config.yaml` or schemas.
- **AGENTS.md / CLAUDE.md**: pre-1.0 wrote `openspec/AGENTS.md`, `project.md`, root `AGENTS.md`/`CLAUDE.md` blocks
  between `<!-- OPENSPEC:START/END -->` markers, and `/openspec:proposal|apply|archive`. 1.0 **removed** all of that
  (`CHANGELOG.md:904-935`). `legacy-cleanup.ts` deletes only marker blocks and known filenames, never user content.
  `project.md` is migrated into `config.yaml: context`.
- **Distribution**: `skills/` holds pre-rendered copies for `npx skills add Fission-AI/OpenSpec`, guarded by a parity
  test. There is also a Copilot cloud-agent workflow generator (`core/github-copilot/cloud-agent.ts`).
- **Prompt hygiene**: every skill embeds `PROJECT_ROOT_GUARD` (`templates/workflows/project-root.ts`). If the model
  auto-selected the skill in a non-OpenSpec repo, the skill tells it to back off silently. If the user explicitly
  invoked it, the skill asks before init. It never creates `openspec/` as a side effect.

---

## 9. Where the intelligence lives (prompt vs CLI)

- **CLI (deterministic)**: path and root resolution; schema/graph ordering; template and instruction assembly; file
  existence; checkbox parsing; structural lint; delta merge; atomic archive.
- **Prompts (LLM)**: deciding scope and ambiguity ("ask if it materially affects scope/behavior/acceptance"); choosing
  capability names; writing requirements and scenarios; edge-case discovery (only "move examples and edge cases into
  scenarios"); verify; bulk-archive conflict resolution (a conflict = two or more changes touching the same capability
  path, resolved by "checking the codebase"); agent sync; explore.
- **Size**: skills range from 5.9 KB (new-change) to 22.8 KB (explore). The total is ~178 KB, so even the core profile
  installs ~90 KB of prompt text. Much of it is accreted bug-fix prose (store flags, skip_specs semantics, retirement
  conditions restated in prose, etc.). The archive and sync skills repeat CLI invariants in English. That is a smell:
  the same rule is implemented twice, once in TS and once in a prompt, and the two drift.
- **Good pattern**: the "dynamic instructions" split. The skill is a generic driver. Per-artifact semantics come from
  `instructions --json` = `{template, instruction, context, rules, dependencies, unlocks, resolvedOutputPath}`.
  Custom schemas therefore change behaviour without regenerating skills.

---

## 10. Extension points

1. **Custom workflow schemas**: resolution order is project `openspec/schemas/<name>/` → user `$XDG_DATA_HOME/openspec/schemas/`
   → package built-in (`artifact-graph/resolver.ts:120-170`). `schema fork|init|validate|which` exist. Use cases are
   adding a `review` artifact or a `test-plan`. Community schemas (intent-driven with ADRs, anvil with
   review/test-plan/verify, nanopm, superpowers-bridge, e2e-runbooks) are copied in by hand, with no package manager
   (`docs/customization.md:413+`).
2. **config.yaml**: `context`, per-artifact `rules`, `operations.apply|archive.guidance`.
3. **Artifact instruction delegation** to another skill (e.g. an artifact whose instruction says "invoke skill X").
4. **Stores and references** (beta): planning in a separate repo; read-only upstream spec indexes injected into
   instructions.
5. **No** code plugin API, no hooks/events, no custom validators, and no custom delta operations. Validation rules are
   hard-coded to the spec format, so a custom schema cannot add semantic checks. The library export (`src/index.ts`) is
   minimal.

---

## 11. Tests and code quality

- 217 vitest files (~85k LOC, more than src). There are CLI e2e tests, "docs-claims" tests that assert docs match
  behaviour, a skills.sh parity test, a vocabulary sweep, and cross-platform path canonicalization guidance
  (`test/AGENTS.md`).
- Code is careful and defensive. Comments explain *why* and cite issues. JSON contract discipline is strong.
- Smells: huge files (`archive.ts` 2.4k LOC, `init.ts` 1.5k, `update.ts` 1.4k, `schema.ts` 1.5k). The regex Markdown
  parser has a long tail of edge-case fixes. Deprecated aliases are kept. The beta multi-repo surface widens every
  prompt (store flags appear in nearly every step). Telemetry is on by default.

---

## 12. Assessment

### Well-designed (adapt conceptually)
- **Change-as-folder + delta ops + archive** gives a clear "current truth vs. proposed modification" split that reviews
  well in PRs. Archive leaves a dated audit trail.
- **Artifact graph as data** (`requires`, `generates`, `template`, `instruction`, `apply.tracks`), with
  status/next-step computed by the CLI. Schemas are customizable per project.
- **CLI as instruction server for agents**: `status`/`instructions --json` and a single JSON doc per call with a
  diagnostic envelope that carries a `fix`. Skills stay generic, and the CLI owns state and paths.
- **Context/rules injection**, with explicit wording to the AI: "constraints for you, do NOT copy into the artifact".
- **Multi-tool installer**: registry + adapter + `generatedBy` stamp + `update` reconciliation + legacy cleanup by
  explicit list (never pattern-delete user files). Also `allowed-tools: Bash(openspec:*)`.
- **Merge safety rails**: apply order, idempotent re-apply ("early-sync"), near-miss typo detection, scenario-loss
  guard, an explicit `retire_capabilities` opt-in, and a dry-run in validate.
- **Behavioural guardrails in prompts**: the planning boundary (propose never implements), the project-root guard, and
  "re-read dependency files from disk".

### Weak (where Comb should differentiate)
- **Consistency / contradiction**: none. Two requirements can contradict each other (in one spec, across specs, or
  across concurrent changes) and validate passes. "Conflict" in bulk-archive just means the same capability path.
  MODIFIED without a base fingerprint silently overwrites concurrent body edits.
- **Edge-case discovery**: entirely LLM free-form ("ask about material ambiguity"). There is no systematic enumeration
  of states, inputs, or failure modes, and no notion of an invariant or forbidden flow. Scenarios are unparsed prose
  (WHEN/THEN not checked).
- **Traceability**: requirement identity is header text. Renames need explicit RENAMED, and `show -r` uses a positional
  index. Tasks have no link to requirements. Verify is keyword grep. Nothing traces scenario → test → code. The
  proposal's Capabilities list is not cross-checked against delta files.
- **Decisions / rationale**: `design.md ## Decisions` is free text, gets archived with the change, and is then
  effectively lost. There is no durable decision log or ADR in core (only the community `intent-driven` schema has
  one). Explore keeps decisions "in the conversation, not in files". The REMOVED Reason/Migration text disappears
  from main specs after archive.
- **Completion = file exists**: there are no quality gates. Gates have to be added through CI or hooks.
- **Dual merge semantics** (CLI vs. agent sync) and prompt-duplicated invariants lead to drift and bugs. The CHANGELOG
  is full of prompt patches.
- **Fragile surface syntax**: four hashes for scenarios, exact header matching, English SHALL/MUST, a regex parser.

---

## 13. Reuse / Adapt / Avoid for Comb

### Reuse (take the concept almost as-is)
1. Layout: `comb/specs/<capability-path>/…` (source of truth) and `comb/changes/<id>/…` (proposal, deltas, design,
   tasks, metadata yaml), with `changes/archive/YYYY-MM-DD-<id>/`.
2. Delta vocabulary ADDED / MODIFIED / REMOVED / RENAMED. Apply order RENAMED→REMOVED→MODIFIED→ADDED, idempotent
   re-apply, near-miss typo errors, an explicit opt-in to retire a capability, and validate-time dry-run of archive.
3. The agent JSON contract style: one JSON doc per invocation, the `{severity, code, message, target, fix}` envelope,
   a null-shape on failure, stderr for human prose.
4. `status`/`instructions --json` as the agent's driver loop, so skills stay thin and generic.
5. The tool-installer architecture: tool registry, per-tool adapters, a `generatedBy` stamp, `update` reconciliation,
   cleanup by explicit list, `allowed-tools: Bash(comb:*)`, and the vendor-neutral `.agents/skills` target.
6. Prompt guardrails: the planning boundary, the project-root guard, and "re-read artifacts from disk".

### Adapt (keep the idea, change the mechanism)
1. **Artifact graph with semantic gates**: completion = exists **AND** its gate passes. Examples: `fslc check` for the
   model artifact, `verify` for properties, and a refinement check for design → requirements. Gate results go into
   `status --json`.
2. **Formal artifact in the graph**: e.g. `proposal → requirements(md) → model(.fsl) → design → tasks`. The `.fsl`
   artifact `instruction` delegates to the fsl-requirements / fsl-design skills (OpenSpec's delegation hook).
3. **Stable requirement IDs** (e.g. `REQ-AUTH-003` in the header or front-matter). Keep the name as display text,
   use IDs for MODIFIED/REMOVED targeting, and trace ID → FSL property/action → scenario → test → task.
4. **Base fingerprints on MODIFIED/REMOVED** (hash of the base block at authoring time). Archive refuses on drift and
   offers a rebase. This implements OpenSpec's own unimplemented plan.
5. **Contradiction and edge-case discovery via the model checker**: replace "ask about ambiguity" prose with
   counterexample-driven questions (deadlock, unreachable states, violated invariants), and turn counterexamples into
   scenarios automatically.
6. **Durable decisions**: promote `design.md ## Decisions` into a persistent decision log or ADRs that archive merges
   (like specs), linked to the requirement IDs they justify. Keep REMOVED Reason/Migration in history.
7. **Structured scenarios**: parse GIVEN/WHEN/THEN (or the FSL scenario syntax) so scenarios can be replayed or used
   for test generation. Use a real Markdown AST, or a stricter fenced-block / front-matter format, instead of
   line-regex headers.
8. **config.yaml context/rules**: keep them, and add verifier settings (bounds, which properties gate which artifacts).

### Avoid
1. **Two merge engines**: CLI deterministic merge plus an LLM "intelligent sync" with different semantics. Comb should
   have one deterministic merge, with the LLM only *authoring* deltas.
2. **Restating CLI invariants in skill prose** (~178 KB of prompts). Push rules into the CLI and return them as JSON
   diagnostics with `fix`.
3. **File-existence completion** and LLM-grep "verify" sold as verification. Be explicit about what is
   machine-checked and what is advisory.
4. **Fragile header syntax** (exact `####`, English SHALL/MUST regex as the normativity signal) and keyword-guessing
   fallbacks such as `parseDeltas` from prose.
5. **Identity by header text and positional indices**.
6. **Telemetry on by default** (an enterprise and formal-methods audience will object). Avoid early sprawl into ~50
   tool adapters and a beta multi-repo "stores" surface that inflates every prompt.
7. **Giant monolithic command files** (archive.ts at 2.4k LOC). Keep the merge/apply library pure and testable, and
   keep the FS transaction layer separate.
