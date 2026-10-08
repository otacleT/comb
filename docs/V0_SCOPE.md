# Comb v0 Scope

v0 の目的は1つ。
**「CLI＋Agent Skills＋Markdown 仕様で回す収束ループ（レビュー → 質問 → 決定 → 仕様の更新）」だけで価値が成り立つかを確かめること。**

## Must（v0 に必ず入れる）

| # | 機能 | 内容 |
|---|---|---|
| M1 | `comb init` | `comb/` ディレクトリ、`config.yaml`、Claude Code 用の Skill とスラッシュコマンドを生成する |
| M2 | 仕様の保存形式 | `comb/specs/<capability>/spec.md`（OpenSpec 互換の構造に、安定した要件ID `REQ-<PREFIX>-<NNN>` を付けたもの） |
| M3 | Change | `comb/changes/<id>/`：proposal、delta（ADDED / MODIFIED / REMOVED / RENAMED を **ID で**指定）、tasks |
| M4 | Question / Decision | `questions.md`（`Q-n`、状態、重要度、参照、選択肢、推奨、回答）と `decisions.md`（`D-n`）。archive のときに、プロジェクト全体の `comb/decisions.md` へ恒久IDで統合する |
| M5 | レビュー | `/comb:review`：4つの観点（一貫性・定式化・境界条件・変更の影響）→ `review.md` と `questions.md` |
| M6 | 明確化ループ | `/comb:clarify`：質問を少しずつ提示 → 回答 → Decision の作成 → delta の更新 → レビューが古くなったことを検出 → 再レビュー |
| M7 | 状態サーバー | `comb status --json`（成果物の状態、ゲート、次の一手）と `comb instructions <artifact> --json`（テンプレート、ルール、文脈） |
| M8 | 検査 | `comb validate`：構造、ID の一意性、参照の整合（REQ / Q / D）、delta が適用可能か |
| M9 | archive | `comb archive <id>`：delta を正本へ決定的にマージする。Decision の統合と恒久IDの採番、変更フォルダの移動も行う。同じ archive を再実行しても結果は変わらない（冪等） |
| M10 | 実装 | `/comb:apply`：tasks に沿って実装する。重要度 high の未決質問が残っていれば警告する |
| M11 | 探索 | `/comb:explore`：対話で考えを整理する。ファイルは作らない |
| M12 | 取り出し | `comb list` / `comb show <ID>`：要件、Decision、change を ID で取り出す（エージェントが文脈を読み込むため） |

## Should（入れたいが、Must の完成を優先する）

| # | 機能 | 内容 |
|---|---|---|
| S1 | ベースの fingerprint | MODIFIED / REMOVED の対象要件について、提案時の正本のハッシュを記録する。archive の前に、正本が変わっていないか検出する |
| S2 | 評価用ベンチマーク | `bench/`：Spike の題材（注文ライフサイクルの仕様全体を新しい capability として追加する change と、ベースラインの指摘）を使い、レビューの再現率を回帰的に測る |
| S3 | `comb update` | インストール済みの Skill を、バージョンスタンプを見て更新する |

## Later（v0 の後）

| 時期の目安 | 機能 |
|---|---|
| v0.1 | ドキュメント生成：solo profile を1つ（正本からの投影、生成物のヘッダとハッシュ、`comb docs` と `comb docs stamp`） |
| v0.2 | Document Profile の拡張（client-work、ユーザー定義の profile、宣言的な契約） |
| v0.2 | Codex / Cursor などへの Skill 配布アダプタ |
| v0.x | Source（会議メモなどの資料の登録と、引用の照合） |
| 検証マイルストーン | FSL による検証（`comb verify --deep`）とテスト生成（`testgen`）。**入口の判定**：実装＋バグ注入による比較実験で、LLM が書くテストやレビューに対する上乗せを確認できること（Spike 04 を参照） |

## Non-goal（作らない）

- GUI、Web アプリ、SaaS、独自のクラウド
- 独自の LLM、独自の形式仕様言語
- プロジェクト管理（Jira や Notion の代替）
- 共同編集、権限管理、エンタープライズ向けの機能
- 何十種類もの Entity や Document Profile
- MCP サーバー（v0 は CLI＋Skill のみ）

## v0 の完成条件（体験ベース）

実際の Claude Code と LLM で、次の体験が成立すること。ユニットテストの数で完成を判断しない。

| # | 体験 | 合格条件 |
|---|---|---|
| E1 | 導入 | 空のリポジトリで `comb init` を実行すると、Claude Code に `/comb:*` が現れる |
| E2 | 提案 | 対話から `/comb:propose` で change を作ると、`comb validate` が通る。要件には安定IDが付く |
| E3 | レビュー | `/comb:review` が、選択肢と推奨の付いた質問を出す。ベンチマークの仕様では、ベースラインの high 7件のうち5件以上を再現する |
| E4 | 明確化 | 質問に答えると、Decision が作られ、delta が更新される。`comb status` は再レビューを促す。再レビューを重ねると未決 high が減り、ユーザーが残りを回答するか保留（deferred）にすると「apply 可能」になる。ループを閉じるのはユーザーの判断で、high が自然に0件になることは求めない（D-019） |
| E5 | archive | 正本へのマージが決定的で冪等である。Decision に恒久IDが付き、参照も書き換わる。正本との衝突は検出される |
| E6 | 2回目の変更 | 同じ capability への次の change で、レビューが過去の Decision と仕様全体を踏まえて影響を指摘する |

### v0.1 の完成条件

| # | 体験 | 合格条件 |
|---|---|---|
| E7 | ドキュメント | 正本に archive した仕様（ベンチマークの subscription-billing）で `/comb:docs` を実行すると、`comb docs` が error なしで通り、どのドキュメントにも引用されない要件がない。`## Gaps` が実際に仕様にない点を挙げ、抜き取った記述に引用先の裏付けがある。正本を変えると、生成元が変わったドキュメントだけが stale になり、作り直される |

## 開発の規律（Converge の教訓）

- 同時に進める作業ブランチは1〜2本まで。
- 進捗は E1〜E6 の成立で測る。
- 設計判断は `docs/DECISIONS.md` に追記するだけにする。タグや版の管理、承認ログといった仕組みは作らない。
- 記録済みのスコープ判断を覆すのは、新しい証拠があるときだけ。
