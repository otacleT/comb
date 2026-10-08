# Comb v0 Design

関連ドキュメント：[PRODUCT_PRINCIPLES](PRODUCT_PRINCIPLES.md) / [V0_SCOPE](V0_SCOPE.md) / [DECISIONS](DECISIONS.md) / [research](research/)

## 1. 全体像

```
            ┌───────────────────────── Claude Code（ユーザーの AI Agent）─────────────────────────┐
 ユーザー ⇄ │  /comb:explore → /comb:propose → /comb:review ⇄ /comb:clarify → /comb:apply → /comb:archive │
            │        │  Skill（薄い手順書。CLI の instructions に従う）                                 │
            └────────┼────────────────────────────────────────────────────────────────────────────┘
                     │ comb status / instructions / validate / archive …（JSON）
              ┌──────▼──────┐
              │  comb CLI   │  決定的な処理：解析・検査・ゲート判定・テンプレート配布・マージ
              └──────┬──────┘
                     │ 読み書き
              ┌──────▼──────────────────────────────────────────┐
              │ comb/  （Git 管理の Markdown）                    │
              │   specs/<cap>/spec.md   … 正本の仕様              │
              │   decisions.md          … 正本の決定ログ          │
              │   changes/<id>/…        … 提案・レビュー・質問・決定 │
              └─────────────────────────────────────────────────┘
```

役割の分担は次のとおり。

| 担当 | 責務 | やらないこと |
|---|---|---|
| **CLI** | 解析、検査、ID の採番、状態とゲートの判定、instructions（テンプレート・ルール・文脈）の配布、正本への決定的なマージ | LLM を呼ばない。内容の良し悪しを判断しない |
| **Skill** | CLI から instructions を受け取り、エージェントに作業させる手順書 | ルールを書き写さない（ルールの正本は CLI のテンプレート） |
| **エージェント（LLM）** | 対話、提案物の作成、レビュー、質問の作成、回答を Decision と delta に反映 | 正本（`comb/specs/`、`comb/decisions.md`）を直接編集しない |
| **人** | 回答・決定・承認 | — |

## 2. プロジェクト内のファイル構成

Comb を導入したリポジトリの構成。

```
comb/
├── config.yaml
├── decisions.md                         # 正本：プロジェクト全体の決定ログ（追記型、D-001…）
├── specs/
│   └── <capability>/
│       └── spec.md                      # 正本：capability ごとの仕様
└── changes/
    ├── <change-id>/
    │   ├── .comb.yaml                   # CLI が管理するメタデータ
    │   ├── proposal.md
    │   ├── specs/<capability>/spec.md   # delta
    │   ├── review.md
    │   ├── questions.md
    │   ├── decisions.md                 # この change で生まれた決定（D-1…、ローカルID）
    │   └── tasks.md
    └── archive/
        └── YYYY-MM-DD-<change-id>/      # archive 済みの change（そのまま保存）

.claude/skills/comb-<workflow>/SKILL.md  # comb init が生成（Claude Code 用）
.claude/commands/comb/<workflow>.md      # /comb:<workflow> のスラッシュコマンド
```

- `<capability>`：kebab-case（例：`order-lifecycle`）。
- `<change-id>`：kebab-case の動詞句（例：`add-auto-cancel-unshipped`）。

## 3. ファイル形式

共通の約束は次の2つ。

- **構造のキーワード**（`Requirement:`、`Scenario:`、`GIVEN/WHEN/THEN/AND`、`ADDED/MODIFIED/REMOVED`、各フィールド名）は英語で固定する。
- **本文**は `config.yaml` の `language` で指定した言語で書く（D-013）。

### 3.1 正本の仕様 `comb/specs/<cap>/spec.md`

```markdown
---
prefix: ORDER
retired: [REQ-ORDER-010]
---
# order-lifecycle

## Purpose
注文が「購入」から完了・キャンセル・返金のいずれかに至るまでの振る舞いを定める。

## Conventions
（任意の節。表や規約を書いてよい）

## Requirements

### Requirement: REQ-ORDER-001 Order creation
The system MUST create an order when ... 受付時に価格を確定する（D-021）。

#### Scenario: Successful order creation
- **GIVEN** an on-sale listing priced ¥3,333
- **WHEN** the buyer taps "Buy" with card payment
- **THEN** an order is created in `awaiting_payment`
- **AND** the listing becomes `in_transaction`
```

規則は次のとおり。

- **frontmatter**
  - `prefix`：要件IDの接頭辞（必須）。
  - `retired`：削除済みの要件ID。再利用を防ぐため、CLI が archive のときに追記する。
- **要件の見出し**：`### Requirement: <ID> <title>`。ID は `REQ-<PREFIX>-<NNN>`（3桁以上の連番）で、プロジェクト全体で一意。
- **要件の本文**：次の `###` または `##` までが1つの要件。各要件に1つ以上の `#### Scenario:` が必要。
- **シナリオ**：`- **KEYWORD** text` 形式の箇条書き。KEYWORD は GIVEN / WHEN / THEN / AND のいずれか。
- **Decision の参照**：本文中の `D-<NNN>`（正本）を参照として解析し、`comb/decisions.md` に存在するかを検査する。
- **`## Requirements` 以外の `##` 節**：自由記述の「Section」として、そのまま保存する。

### 3.2 delta `changes/<id>/specs/<cap>/spec.md`

```markdown
---
prefix: ORDER          # 新しい capability を作るときだけ必須
---
## ADDED Requirements

### Requirement: REQ-ORDER-019 Auto-cancel of unshipped orders
...（全文。シナリオを含む）...

## MODIFIED Requirements

### Requirement: REQ-ORDER-006 Buyer cancellation without seller approval
...（変更後の全文。変更しないシナリオもそのまま含める。タイトルの変更もここで行う）...

## REMOVED Requirements

### Requirement: REQ-ORDER-010
**Reason:** 自動キャンセルに置き換えるため
**Migration:** 運用キューは廃止する

## ADDED Sections

### Section: Timers
...（節の全文）...

## MODIFIED Sections

### Section: Allowed transitions
...（節の全文で置き換える）...
```

- 対象は **ID で特定**する。OpenSpec のように見出しのテキストでは特定しない。そのため RENAMED は不要で、タイトルの変更は MODIFIED で行う。
- 新しい capability を作るときは、delta に `## Purpose` を含める。既存の capability の Purpose は、`## Purpose` か `MODIFIED Sections` の `Section: Purpose` で置き換える。
- `Section: Requirements` は使えない（`SPEC_PARSE`）。正本の要件が隠れてしまうため。Purpose を `## Purpose` と `Section: Purpose` の両方で書くこともできない。
- 節が小見出しを持つときは、delta では1段深く（`####`）書く。archive が正本では `###` に戻す。
- `(D-n)` のように、change ローカルの Decision を本文で参照してよい。archive のときに恒久IDへ書き換える。

### 3.3 `proposal.md`

```markdown
# Change: <title>

## Why
## What Changes
- ...
## Impact
- Capabilities: order-lifecycle
- Requirements: REQ-ORDER-006, REQ-ORDER-019 (new)
```

### 3.4 `tasks.md`

```markdown
- [ ] 1.1 自動キャンセルのジョブを追加する（REQ-ORDER-019）
- [x] 1.2 ...
```

チェックボックスの数を CLI が数え、進捗として扱う。

### 3.5 `review.md`

```markdown
---
reviewed: sha256:…        # comb mark-reviewed が書く（delta の内容ハッシュ）
requirements: { REQ-ORDER-019: "sha256:…", "order-lifecycle#States": "sha256:…" }   # comb mark-reviewed が書く（要件、節、Purpose ごとのハッシュ。再レビューで変更箇所を特定する）
lenses: [consistency, formalization, edge-cases, change-impact]
---
# Review: add-auto-cancel-unshipped

## Summary
high 2 / medium 3 / low 1。質問を作成：Q-1〜Q-5

## Findings
### consistency
- **F-1 (high)** …（要点）→ Q-1
### formalization
...

## Behavior model
（定式化観点の成果物。状態を持つ振る舞いに触れる change でのみ書く）
### Glossary
### State × Event
### Coverage map
### Assumptions

## Checked and consistent
- ...（矛盾がないことを確認した点）
```

### 3.6 `questions.md`

```markdown
# Questions

## Q-1: 期限後・ジョブ実行前の発送を受け付けるか
- **Status:** answered            # open | answered | deferred
- **Severity:** high              # high | medium | low
- **Refs:** REQ-ORDER-005, REQ-ORDER-019
- **Lens:** edge-cases
- **Decision:** D-1               # answered のときに必須。仕様を変えない回答は `none: <理由>`

現在の仕様では、次の流れが起こりえます：
1. …（REQ-ORDER-004）
2. …
結果：…。これは REQ-ORDER-019 の「…」と矛盾します。

**Options**
- **A.** … — Spec change: REQ-ORDER-005 に「…」を追加
- **B.** … — Spec change: …
- **C.** 別のルールを指定する

**Recommendation:** A — …

**Answer:** A（2026-10-05）
```

### 3.7 `decisions.md`

change ローカルの形式（`changes/<id>/decisions.md`）。

```markdown
# Decisions

## D-1: 自動キャンセルの期限以降は発送を受け付けない
- **Date:** 2026-10-05
- **Refs:** REQ-ORDER-005, REQ-ORDER-019
- **From:** Q-1
- **Supersedes:** D-007            # 任意。既存の決定を置き換えるとき

期限（paid_at + 120h）を過ぎた後の発送は `SHIP_WINDOW_CLOSED` で拒否する。

**Why:** 期限後に発送を認めると、キャンセルと発送が競合し、返金済みの注文が届いてしまうため。
```

正本の形式（`comb/decisions.md`）は同じ書式で、ID は `D-<NNN>`（プロジェクト全体の連番）。
追加で `- **Change:** <change-id>` を持つ。置き換えられた Decision には、archive のときに `- **Superseded by:** D-<NNN>` が追記される。

### 3.8 `.comb.yaml`（CLI が管理。人やエージェントは編集しない）

`base` は、`comb validate --change <id>` が MODIFIED / REMOVED の対象を初めて見つけたときに、その時点の正本の要件ブロックのハッシュを記録する。記録済みのものは上書きしない。

```yaml
schema: comb.change/v1
id: add-auto-cancel-unshipped
created: 2026-10-05
base:                       # S1：MODIFIED/REMOVED の対象を提案時点でハッシュとして固定
  REQ-ORDER-006: sha256:…
```

### 3.9 `comb/config.yaml`

```yaml
version: 1
language: ja                # 成果物の本文の言語
agents: [claude-code]
context: |                  # すべての instructions に含めるプロジェクトの文脈（16KB まで）
  個人開発の C2C マーケットプレイス。決済は PSP、配送はヤマト／日本郵便。
review:
  lenses: [consistency, formalization, edge-cases, change-impact]
  batch: 3                  # clarify で一度に提示する質問の数
rules:                      # 成果物ごとの追加ルール（任意）
  delta: ["金額はすべて税込の整数円で書く"]
documents:                  # v0.1：生成するプロダクトのドキュメント
  profile: solo             # v0.1 で選べるのは solo だけ
  dir: docs                 # 書き出し先（プロジェクトのルートからの相対パス。comb/ の外）
```

## 4. プロジェクトモデル

v0 の型は4種類（Requirement＋Scenario、Change、Question、Decision）。Capability は Requirement の入れ物として扱う。

```ts
type Capability  = { name: string; prefix: string; sections: Section[]; requirements: Requirement[]; retired: string[] }
type Requirement = { id: string; title: string; body: string; scenarios: Scenario[]; decisionRefs: string[]; span: SourceSpan }
type Scenario    = { name: string; steps: { keyword: 'GIVEN'|'WHEN'|'THEN'|'AND'; text: string }[] }
type Change      = { id: string; meta: ChangeMeta; proposal?: Doc; deltas: Delta[]; review?: Review; questions: Question[]; decisions: Decision[]; tasks?: TaskList }
type Delta       = { capability: string; prefix?: string; added: Requirement[]; modified: Requirement[]; removed: Removal[]; addedSections: Section[]; modifiedSections: Section[] }
type Question    = { id: string; title: string; status: 'open'|'answered'|'deferred'; severity: 'high'|'medium'|'low'; refs: string[]; lens?: string; decision?: string /* 'D-n' または 'none: <理由>' */ }
type Decision    = { id: string; title: string; date: string; refs: string[]; from?: string; supersedes?: string; change?: string; rule: string; why: string }
```

関係と不変条件（`comb validate` で検査する）は次のとおり。

| コード | 種類 | 内容 |
|---|---|---|
| `SPEC_PARSE` | error | 見出し、frontmatter、シナリオの構造が読めない |
| `REQ_ID_FORMAT` / `REQ_ID_PREFIX` | error | ID の形式が違う、または接頭辞が capability と一致しない |
| `REQ_ID_DUPLICATE` | error | 正本、もしくは有効な change の ADDED どうしで ID が重複している |
| `REQ_ID_RETIRED` | error | 削除済みの ID を再利用している |
| `REQ_NO_SCENARIO` | error | シナリオのない要件がある（ADDED / MODIFIED） |
| `DELTA_TARGET_MISSING` | error | MODIFIED / REMOVED の対象が正本にない |
| `DELTA_ID_EXISTS` | error | ADDED の ID がすでに正本にある |
| `DELTA_CONFLICT` | error | 同じ ID が delta の複数の節に出てくる |
| `REMOVED_NO_REASON` | error | REMOVED に Reason がない |
| `SCENARIO_DROPPED` | warning | MODIFIED で、既存のシナリオ名が消えている |
| `SCENARIO_CONTENT_DROPPED` | warning | MODIFIED で、既存のシナリオの後ろにあった注記や例（手順以外の行）が消えている |
| `REF_UNKNOWN_REQ` | error | Question / Decision の Refs、または生成したドキュメントの引用に、存在しない要件がある |
| `REF_UNKNOWN_DECISION` | error | 本文や Supersedes、または生成したドキュメントの引用に、存在しない Decision がある |
| `REF_UNKNOWN_QUESTION` | error | Decision の From に存在しない質問がある。ドキュメントでは、引用した `<change-id>#Q-n` が archive 済みの change にない（日付付きのフォルダ名で書いたときは、fix が日付なしの形を示す） |
| `QUESTION_UNRESOLVED_LINK` | error | answered なのに `Decision:` がない（`D-n` か `none: <理由>` が必要） |
| `BASE_DRIFT` | warning | 提案時から正本の対象要件が変わっている（S1） |

## 5. ワークフローとゲート

### 5.1 成果物の順序と状態

```
proposal → delta → review → clarify → tasks → apply → archive
```

| 成果物 | done の条件 | その他の状態 |
|---|---|---|
| proposal | `proposal.md` があり、Why / What Changes / Impact がそろっている | missing |
| delta | delta が1つ以上あり、`validate` に error がない | invalid |
| review | `review.md` があり、`reviewed` のハッシュが現在の delta のハッシュと一致する | **stale**（delta が変わった）/ missing |
| clarify | 重要度 high の open な質問が0件 | blocked（high が n 件）。medium / low の open は件数だけ示す |
| tasks | `tasks.md` がある | missing |
| apply | 全タスクが完了 | in-progress（k/n） |
| archive | 下記の archive 条件を満たす | — |

- **delta のハッシュ**：change の `specs/**/spec.md` を、パス順に連結して正規化した内容の sha256。
- **next**：上の順で最初に done でない成果物。invalid な delta は stale な review より先に来る（レビューでは delta を直せないため。D-021）。すべて done でも open な質問が残っていれば clarify（archive の条件を満たさないため）。
- **archive の条件**：
  - `validate` に error がない。
  - review が stale でない。`review.md` がない場合は `--yes` が必要。
  - open な質問が0件（すべて answered か deferred）。
  - タスクが未完了（`tasks.md` がない場合を含む）なら、`--yes` が必要。
  - `SCENARIO_DROPPED` と `BASE_DRIFT` がある場合は、それぞれ明示的なフラグが必要。

### 5.2 各ワークフロー

| ワークフロー | Skill の手順（要約） | 呼ぶ CLI |
|---|---|---|
| **explore** | 対話でアイデアや問題を整理する。必要なら正本の仕様を読む。ファイルは作らない。まとまったら propose を勧める | `comb list`、`comb show` |
| **propose** | change を作る → proposal → delta（次に使える ID を受け取る）→ tasks → validate が通るまで直す | `new change`、`instructions proposal / delta / tasks`、`validate` |
| **review** | 観点の定義を受け取る → 正本、delta、関連する Decision を読む → `review.md` を書き、質問を追記する → 記録する | `instructions review`、`validate`、`mark-reviewed` |
| **clarify** | open な質問を重要度順に `batch` 件ずつ提示する → 回答を受け取る → Decision を書き、Question を更新し、delta を更新する → validate → review が stale になったら、変更された要件を中心に再レビューする | `instructions clarify`、`validate`、`status` |
| **apply** | tasks に沿って実装する。high の open な質問が残っていれば、先に警告する | `instructions apply`、`status` |
| **archive** | CLI に archive させ、結果を要約してユーザーに伝える | `archive` |

clarify では、Claude Code の質問 UI（選択肢つき）が使えればそれを使う。使えなければテキストで提示する。

### 5.3 archive のアルゴリズム（`comb archive <id>`、決定的）

1. `validate` を実行し、archive の条件（5.1）を確認する。満たさなければ中止する（何も書かない）。
2. change ローカルの Decision（D-1…）に、正本の連番の続きとして恒久ID（D-NNN）を割り当てる。対応表は `ローカルID → 恒久ID`。change ローカルの ID と同じ文字列の ID が正本にあると、参照を書き換えられないので中止する（`DECISION_ID_CONFLICT`）。
3. change 内のファイル（delta、questions、decisions）に出てくる `D-n` を、対応表で書き換える（作業用のコピー上で行う）。
4. capability ごとに delta を正本へ適用する。
   - 順序：REMOVED → MODIFIED → ADDED → MODIFIED Sections → ADDED Sections。
   - **テキストの範囲を差し替える方式**で行う。AST から再生成しないので、触れていない部分の書式はそのまま残る。
   - REMOVED した ID は frontmatter の `retired` に追加する。
   - 新しい capability は `spec.md` を新しく作る。
5. Decision を `comb/decisions.md` に追記する（`Change:` を付ける）。`Supersedes` の対象には `Superseded by` を追記する。
6. 適用後の正本を再検査する。error があれば中止し、何も書かない。
7. 変更するすべてのファイルを一時ファイルに書く。次に change を `changes/archive/YYYY-MM-DD-<id>/` に移し、最後に一時ファイルを rename でまとめて反映する。移動に失敗したら、正本は変わらない。移動先がすでにあれば、何も書かずに中止する（`ARCHIVE_TARGET_EXISTS`）。既存のファイルを書き換えるときは、BOM と CRLF の改行を元のファイルに合わせる。
8. **冪等性**：同じ内容がすでに適用済みなら、その操作はスキップする。ADDED は同じ ID の同一ブロックがあれば、MODIFIED は同一内容ならスキップする。archive が終わった change は `changes/` からなくなるので、同じ `comb archive <id>` を再実行しても `CHANGE_NOT_FOUND` になり、何も変わらない。途中で中断した archive は再開しない（正本は Git で戻す）。

## 6. レビューの観点（lenses）

レビューの観点ごとの定義は、CLI のテンプレート（`templates/lenses/*.md`）が正本。`comb instructions review` で配布する。

| 観点 | 目的 | 見るもの | 主な出力 |
|---|---|---|---|
| **consistency** | 矛盾の検出 | 要件どうし、要件とシナリオ、表・規約と要件、要件と過去の Decision | 矛盾の指摘と、どちらを正とするかの質問 |
| **formalization** | 定式化の規律で曖昧さと抜けを洗い出す（FSL 公式の「定式化メモ」の手法） | 用語集（実体、状態、アクター、操作）、要件ごとの正規化（契機、制約、例外、境界）、網羅表（要件 → 状態・イベント）、状態×イベント表の空欄、タイマー表（ジョブが発火時に確認すること × その間に起きうる変化）、お金の表（出金ごとの式 × 別の経路で先に動いたお金）、前提の台帳。ガードは仕様が定める場所から引用し、本文から補わない | `review.md` の Behavior model と、空欄・未記載のガード・暗黙の前提についての質問 |
| **edge-cases** | 境界条件 | 時間（期限とジョブ実行の間、停止と再開）、競合（同時操作）、外部イベント（重複、遅延、順序の入れ替わり）、お金（保存則、二重実行、返金の上限、別の経路で先に戻ったお金）、権限。直列化されていることを理由に安全と判断しない | 具体的な事象の流れ付きの質問 |
| **change-impact** | 変更が全体に与える影響（change のときのみ） | delta とベースの正本全体、既存の Decision、変更されていない要件・シナリオ・表との整合、更新漏れ | 回帰と更新漏れの指摘 |

**質問の書き方**（全観点で共通。Spike 01 の質問化の形式に基づく）は次のとおり。

1. 根本原因ごとに1問にする。同じ原因の指摘はまとめる。
2. 仕様で実際に起こりうる流れを、番号付きの手順で書く。各手順には根拠の要件IDを付ける。結果と、どの記述と矛盾するかも書く。
3. 選択肢は、次の修復パターンから2〜3個作る。
   - (i) 最後の手順を禁止する
   - (ii) 前の手順を変える・禁止する
   - (iii) 最後の手順の効果を変える
   - (iv) ルールを緩める（現状の振る舞いを許容し、明文化する）

   「別のルールを指定する」は常に付ける。
4. 各選択肢に「Spec change:」（どの要件に何を足すか、変えるか）と「New:」（持ち込む状態、項目、記録、操作、流れ。なければ nothing）を書く。推奨は1つ、理由は1行。推奨は穴を塞ぐ最小の仕様変更を優先する。その場面での禁止や現状の明文化を、新しい状態・項目・記録・支払い手段・流れの追加より先に選ぶ。大きい選択肢を推奨するのは、小さい選択肢ではお金が狂うか、到達してはならない状態に届くときだけで、その旨を理由に書く。他の capability や未決の業務判断に依存する穴は、ここで設計せず、境界を明記する（D-018）。
5. 重要度の基準：
   - **high**：お金、取り返しのつかない操作、到達してはならない状態、実装が進められない。
   - **medium**：実装者によって解釈が分かれる。
   - **low**：記述の不備。
6. 仕様の書き手の意図を推測で補って、黙って直さない。必ず質問にする。

## 7. CLI

### 7.1 コマンド（v0）

| コマンド | 内容 | 区分 |
|---|---|---|
| `comb init [--agent claude-code]` | `comb/` と config を作り、Skill をインストールする | M1 |
| `comb new change <id>` | change のフォルダと `.comb.yaml` を作る | M3 |
| `comb status [--change <id>] [--json]` | 成果物の状態、ゲート、next、未決質問の件数、ベースのずれ | M7 |
| `comb instructions <artifact> --change <id> [--json]` | テンプレート、ルール、文脈、関連する正本の抜粋、次に使える ID、書き出し先のパス | M7 |
| `comb instructions docs [--json]` | ドキュメントを書くための指示、profile の書き出し先とテンプレート、読むファイル、引用の書式（change に結びつかないので `--change` は受け付けない） | v0.1 |
| `comb validate [--change <id>] [--json]` | 3〜4 章の規則で検査する | M8 |
| `comb mark-reviewed --change <id>` | `review.md` の frontmatter に、delta のハッシュと要件ごとのハッシュを書く | M5 |
| `comb archive <id> [--yes] [--allow-dropped-scenarios] [--allow-base-drift]` | 5.3 の手順 | M9 |
| `comb list [--json]` / `comb show <REQ-…\|D-…\|change-id> [--json]` | 一覧と取り出し | M12 |
| `comb update` | Skill の再生成 | S3 |
| `comb docs [stamp]` | 生成したドキュメントの状態と検査（error があれば exit 1）。`stamp` は、書いたばかりのドキュメントに生成元のハッシュを記録する | v0.1 |

`instructions` の artifact は次のいずれか：proposal / delta / tasks / review / clarify / apply / docs（docs だけは `--change` が不要）。

### 7.2 JSON の契約

すべての `--json` 出力は、1つの封筒の形にそろえる。

```json
{
  "schema": "comb.v1",
  "command": "status",
  "ok": true,
  "data": { },
  "diagnostics": [
    { "severity": "error", "code": "DELTA_TARGET_MISSING", "message": "…",
      "target": { "file": "comb/changes/x/specs/order-lifecycle/spec.md", "line": 12, "id": "REQ-ORDER-006" },
      "fix": "ADDED に移すか、ID を確認してください" }
  ]
}
```

終了コード：0 = ok、1 = 検査エラーまたはゲート未達、2 = 使い方の誤り、3 = 内部エラー。

4章の表のほかに、CLI と構成についてのエラーコードを使う。

| コード | 終了コード | 内容 |
|---|---|---|
| `NOT_A_COMB_PROJECT` | 2 | カレントディレクトリとその親に `comb/config.yaml` がない |
| `REVIEW_MISSING` | 1 | `mark-reviewed` の対象の review.md がない |
| `USAGE_ERROR` | 2 | 引数やオプションが不正（`--json` を指定していれば、この場合も封筒を返す） |
| `CHANGE_NOT_FOUND` / `UNKNOWN_ARTIFACT` / `UNKNOWN_AGENT` | 2 | 指定した change、成果物、エージェントが存在しない |
| `CHANGE_ID_INVALID` / `CHANGE_EXISTS` | 1 | change ID が kebab-case でない、またはすでに存在する |
| `CHANGE_META_INVALID` | 1 | `.comb.yaml` がない、または読めない |
| `CONFIG_INVALID` | 1 | `config.yaml` の型や値が不正（context が 16KB を超える場合を含む） |
| `DELTA_EMPTY` | 1 | delta に変更が1つもない |
| `ARCHIVE_BLOCKED` | 1 | archive の条件（5.1）を満たしていない。満たしていない条件ごとに1件出し、fix に解消の方法やフラグを書く |
| `DECISION_ID_CONFLICT` | 1 | change ローカルの Decision ID と同じ文字列の ID が正本にある、または Supersedes の対象がすでに別の Decision に置き換えられている |
| `ARCHIVE_TARGET_EXISTS` | 1 | archive の移動先のフォルダがすでにある |
| `ARCHIVE_IO_FAILED` | 1 | archive 中にファイルの読み書きが失敗した。移動の前なら何も変わらない。移動の後なら、まだ置き換えていないファイルと、残っている一時ファイルを示す |
| `ID_NOT_FOUND` | 2 | `comb show` に指定した ID の要件、Decision、change が見つからない |
| `DOC_MISSING` / `DOC_STALE` / `DOC_USER_OWNED` | 1 | `comb docs`：ドキュメントがない／生成元が変わった（または stamp 前）／書き出し先に印のないファイルがある |
| `REF_EMPTY_CONTEXT` | 1 | `comb docs`：`config:context` を引用しているが、config の context が空 |
| `REF_UNKNOWN_SECTION` | 1 | `comb docs`：`<capability>#<見出し>` の見出しが、その capability の正本の節（Purpose を含み、Requirements を除く）にない。fix に節の一覧を示す |
| `DOC_UNCITED_SECTION` / `DOC_UNCOVERED` | 0（warning） | `comb docs`：引用のない節がある／どのドキュメントにも引用されない要件がある |
| `DOC_CITES_SUPERSEDED` | 0（warning） | `comb docs`：decisions を生成元に持たないドキュメントが、置き換えられた Decision を引用している |

`instructions` の `data` は次の形。

```json
{ "artifact": "review", "change": "add-auto-cancel-unshipped",
  "outputPath": "comb/changes/add-auto-cancel-unshipped/review.md",
  "template": "…", "instruction": "…", "rules": ["…"], "language": "ja",
  "context": { "project": "…", "capabilities": ["order-lifecycle"],
               "readFiles": ["comb/specs/order-lifecycle/spec.md", "…/specs/order-lifecycle/spec.md", "comb/decisions.md"],
               "openQuestions": [{ "id": "Q-2", "title": "…" }] },
  "ids": { "nextRequirement": { "order-lifecycle": "REQ-ORDER-020" }, "nextQuestion": "Q-6", "nextDecision": "D-3" },
  "lenses": [{ "id": "edge-cases", "definition": "…" }] }
```

### 7.3 内部構成（単一の TypeScript パッケージ）

```
src/
  cli/                 # commander の定義。core を呼んで封筒の JSON を出すだけ
  core/
    markdown/          # remark で mdast を作り、要件・節・シナリオのテキスト範囲（span）を取り出す
    spec/              # Capability / Requirement の解析と検査
    change/            # Change の読み込み、delta の解析、適用（純粋関数）、archive のトランザクション
    decision/          # Question / Decision の解析、参照の検査、恒久IDの採番と書き換え
    workflow/          # 成果物グラフ、ゲート、next、delta のハッシュ
    instructions/      # テンプレートの読み込みと組み立て（変数を差し込むだけ）
    project/           # config と frontmatter の読み込み（zod で検証）、パスの解決
  agents/
    adapter.ts         # AgentAdapter { id; install(); uninstall(); files() }
    claude-code/       # Skill とスラッシュコマンドの生成
templates/
  instructions/        # artifact ごとの指示
  lenses/              # レビュー観点の定義
  formats/             # 各ファイルの書式例（questions、decisions、review…）
  skills/              # SKILL.md とコマンドのテンプレート
test/
  fixtures/            # 仕様、delta、change の例（Spike の題材を含む）
bench/                 # S2：レビューの再現率を測るベンチマーク
```

- 依存は最小限にする：commander、yaml、mdast-util-from-markdown、mdast-util-to-string（remark のパーサの中核）。テストは vitest。config の検証は手書きで行う（zod は必要になるまで入れない）。
- Node 22.12 以上（D-017）。npm で配布する。パッケージ名は `@otaclet/comb`（D-020。npm の `comb` は使用済み）で、コマンド名は `comb`。
- `core/` の関数は、ファイル入出力を持たない純粋関数を基本にする。入出力は `project/` と `change/` の archive トランザクションに閉じ込める。
- テレメトリはなし。

## 8. エージェント統合（Claude Code）

- `comb init --agent claude-code` が生成するもの：
  - `.claude/skills/comb-{explore,propose,review,clarify,apply,archive}/SKILL.md`
  - `.claude/commands/comb/{explore,propose,review,clarify,apply,archive}.md`（`/comb:<wf>`。中身は対応する Skill を使う指示だけ）
- SKILL.md は薄い手順書にする。
  - frontmatter：`name`、`description`、`allowed-tools: Bash(comb:*)`、`metadata.generatedBy: comb@<version>`
  - 本文：「`comb instructions <x> --json` を実行し、返ってきた instruction・rules・template に従う → validate」という流れだけを書く。観点の定義や書式は書かない。
- `comb update` は、`generatedBy` のバージョンを比べて、Comb が生成したファイルだけを再生成する。ユーザーが作ったファイルと、ユーザーが編集したファイルには触れない。より新しい comb が生成したファイルは上書きせず、`newer` として報告する（古い comb による巻き戻しを防ぐ）。
- 将来、Codex や Cursor に対応するときは、`AgentAdapter` を追加する（v0.2）。

## 9. 後のマイルストーンの概略（v0 では作らない）

### 9.1 Document Profiles（v0.1 で solo、v0.2 で拡張）

v0.1 の設計は [specs/2026-10-08-document-profiles-design.md](specs/2026-10-08-document-profiles-design.md) を正とする。要点は次のとおり。

- 組み込みの solo profile は、正本（specs、decisions、archive 済みの質問）と config の context から、6本のドキュメント（product、features、screens、flows、decisions、open-questions）を作る。作業中の change は含めない。
- ドキュメントはエージェントが `/comb:docs` で書き、すべての記述に引用（`REQ-…`、`D-NNN`、`<change-id>#Q-n`、正本の節 `<capability>#<見出し>`、`config:context`）を付ける。CLI は `comb docs` で、引用、節ごとの引用の有無、要件の網羅、生成元ハッシュによる古さを検査する（D-022）。
- profile は宣言的なフォルダ（`profile.yaml`、`SKILL.md`、`templates/`）。v0.2 でユーザー定義の profile と client-work を足す。

### 9.2 形式検証（検証マイルストーン）

- 入力：review の Behavior model を構造化した Behavior IR（Spike 01 の形式が出発点）。
- 継ぎ目：`VerificationBackend.check(model, properties) → { verdict, assurance, trace, reason }[]`。最初の実装は FSL（CLI の JSON を介した連携）。
- 必須の条件：
  - カバレッジの開示（何を証明したか、何をモデル化していないか）。
  - 反例は、6章の形式の質問にする。
- 入口の判定：V0_SCOPE の Later に書いた比較実験。

### 9.3 Source（v0.x）

会議メモや資料を登録し、AI が書いた記述に元資料からの引用を付けて機械的に照合する（Converge の引用照合の考え方）。

## 10. リスクと未決事項

| 項目 | 対応 |
|---|---|
| レビューの質がばらつく（LLM の非決定性） | `bench/`（S2）で再現率を回帰的に測る。観点ごとの定義を改善していく |
| clarify の操作性（エージェントによって質問 UI が違う） | Skill が UI の有無で振る舞いを分ける。テキストへのフォールバックを用意する |
| 仕様が大きいとコンテキストが足りない | `instructions` が読むべきファイルを絞って返す。Decision は要約を返す |
| 同じ要件を複数の change が同時に変える | S1（ベースのハッシュ）で archive 前に検出する。v0 では自動の rebase はしない |
| npm のパッケージ名 | `@otaclet/comb` に決定。最初の公開は 0.1.0（D-020） |
| 日本語の本文に英語の構造キーワードが混ざる | 解析の確実さを優先して許容する（D-013） |
