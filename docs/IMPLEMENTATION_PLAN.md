# Comb v0 Implementation Plan（ロードマップ）

関連：[DESIGN](DESIGN.md) / [V0_SCOPE](V0_SCOPE.md) / [DECISIONS](DECISIONS.md)

## 進め方

- **縦に薄く切る（Loop first）。** マイルストーンごとに、実際の Claude Code で体験（V0_SCOPE の E1〜E6）が成立する状態まで作る。そこで止めて、LLM での確認結果を [experience-log](experience-log.md) に記録する。
- **詳細な計画は1マイルストーンずつ書く。** テストとコード付きの詳細計画（`docs/plans/`）は、直前のマイルストーンの体験確認が終わってから書く。LLM と組み合わせた結果を見て、指示文（テンプレート）やインターフェースを直すことが前提になるため。先のマイルストーンは、この文書で範囲と継ぎ目だけを決めておく。
- **作業ブランチは同時に1本。** `feat/m<N>-…` をマイルストーンごとに切り、体験確認まで終えてからマージする。
- **完了の判定は体験の成立。** テストが通ることは必要条件であって、完了条件ではない。
- 設計から外れる判断をしたら、[DECISIONS](DECISIONS.md) に追記する。

## マイルストーン

| # | 名前 | 完了条件（体験） | 主な成果 | 詳細計画 |
|---|---|---|---|---|
| **M1** | Walking skeleton | **E1** 導入、**E2** 提案 | 解析、検査、`init` / `new change` / `validate` / `status` / `instructions(proposal, delta, tasks)`、explore / propose の Skill | [2026-10-06-m1-walking-skeleton.md](plans/2026-10-06-m1-walking-skeleton.md) |
| **M2** | Clarify loop | **E3** レビュー、**E4** 明確化 | Question / Decision、レビューの stale 判定と clarify のゲート、`instructions(review, clarify)`、4つのレビュー観点、review / clarify の Skill、E3 用のベンチマーク題材 | [2026-10-06-m2-clarify-loop.md](plans/2026-10-06-m2-clarify-loop.md) |
| **M3** | Archive | **E5** archive、**E6** 2回目の変更 | delta の適用（テキストの範囲の差し替え）、Decision の恒久ID、archive のトランザクション、ベースのハッシュ（S1）、`list` / `show`、`instructions(apply)`、apply / archive の Skill | M2 の体験確認の後に作成 |
| **M4** | Should | — | ベンチマークの自動実行（S2）、`comb update`（S3）、パッケージ名の決定と公開の準備 | M3 の後に作成 |

## M1：Walking skeleton（詳細計画あり）

**完了条件：** E1（`comb init` の後に `/comb:*` が使える）と E2（`/comb:propose` で、`validate` が通る、安定IDの付いた change ができる）。

| Task | 内容 |
|---|---|
| 1 | パッケージの土台、診断の型、JSON 封筒、`runCli` |
| 2 | テキストの正規化、frontmatter、見出しブロック（mdast） |
| 3 | 要件IDと正本の仕様の解析 |
| 4 | delta の解析 |
| 5 | 仕様と delta の検査（4章のコード） |
| 6 | 設定、パス、プロジェクトと change の読み込み |
| 7 | change の作成、change とプロジェクト全体の検査 |
| 8 | CLI `new change` / `validate`（`NOT_A_COMB_PROJECT` を含む） |
| 9 | 状態の計算と `comb status` |
| 10 | `comb instructions`（proposal / delta / tasks）とテンプレート |
| 11 | Claude Code への導入（Skill・コマンド）と `comb init` |
| 12 | 体験の確認（E1・E2）、README、体験ログ |

### M1 の追加タスク（M2 の前に行う。体験確認で見つかったもの）

| # | 内容 | 根拠 |
|---|---|---|
| F1（完了：2026-10-06） | `/comb:<wf>` のコマンドファイルの本文を、Skill に処理を渡す形ではなく、同じ Skill テンプレートから生成した手順そのものにする。あわせて、コマンドの frontmatter に `allowed-tools: Bash(comb:*)` を付ける。テンプレートの正本は1つのままにする | E1：コマンドから Skill を呼ぶと、Skill の実行許可が別に必要になる（[experience-log](experience-log.md)） |

## M2：Clarify loop（範囲と継ぎ目）

**完了条件：**
- **E3**：`/comb:review` が、選択肢と推奨の付いた質問を出す。ベンチマークの題材で、ベースラインの high 7件のうち5件以上を再現する。
- **E4**：回答すると Decision が作られ、delta が更新される。review が stale になり、再レビューの後、high の未決が0件になると、next が tasks か apply に進む。

| Task | 内容 | 主なインターフェース（M1 への追加・変更） |
|---|---|---|
| 1 | Question / Decision の解析 | `parseQuestions(text, file)`、`parseDecisions(text, file, scope: 'change' \| 'canonical')`、型 `Question` / `Decision`（DESIGN §4） |
| 2 | 参照の検査 | `validateChange` に `REF_UNKNOWN_REQ`、`REF_UNKNOWN_DECISION`、`QUESTION_UNRESOLVED_LINK` を追加する。正本の `comb/decisions.md` も読む |
| 3 | delta のハッシュと `comb mark-reviewed` | `deltaHash(change)`、`review.md` の frontmatter `reviewed` への書き込み |
| 4 | 状態の本実装 | `computeStatus` を拡張する。review の `stale`、clarify の `blocked`（high の open が n 件）、next で stale の review を優先する |
| 5 | `instructions(review, clarify)` | `InstructionArtifact` に `review` / `clarify` を追加する。lenses の定義、`ids.nextQuestion` / `nextDecision`、`context.openQuestions` を返す |
| 6 | テンプレート | `templates/lenses/{consistency,formalization,edge-cases,change-impact}.md`（DESIGN §6）、`templates/formats/{review,questions,decisions}.md`（§3.5〜3.7）、`templates/instructions/{review,clarify}.md` |
| 7 | Skill | `templates/skills/{review,clarify}.md`。clarify は、質問 UI があれば選択肢付きで提示し、なければテキストにフォールバックする |
| 8 | E3 のベンチマーク題材 | `bench/order-lifecycle/`：Spike 01 の仕様（`.spike/spike/spec/order-lifecycle.md`）を「新しい capability を追加する change」に変換したものと、ベースラインの high 7件の一覧（`docs/research/spikes/spike-01-verification-loop.md` から） |
| 9 | 体験の確認（E3・E4） | 体験ログに記録する |

## M3：Archive（範囲と継ぎ目）

**完了条件：**
- **E5**：archive が決定的で冪等である。Decision に恒久IDが付き、参照も書き換わる。正本との衝突は検出される。
- **E6**：同じ capability への2回目の change で、レビューが過去の Decision と仕様全体を踏まえて影響を指摘する。

| Task | 内容 | 主なインターフェース |
|---|---|---|
| 1 | ベースのハッシュ（S1） | `validate --change` が MODIFIED / REMOVED の対象のハッシュを `.comb.yaml` の `base` に固定し、ずれたら `BASE_DRIFT` を出す |
| 2 | delta の適用 | `applyDelta(baseText, capability, delta, deltaText): { text; retired; diagnostics }`。テキストの範囲の差し替え、適用順、冪等性、新しい capability の作成 |
| 3 | Decision の恒久ID | `assignPermanentIds(local, canonical): Map<string, string>`、`rewriteDecisionRefs(text, map)`、Supersedes / Superseded by |
| 4 | archive のトランザクション | `planArchive(...)` → `executeArchive(plan)`。一時ファイル → rename、change の移動、フラグ（`--yes`、`--allow-dropped-scenarios`、`--allow-base-drift`） |
| 5 | `comb list` / `comb show` | 要件、Decision、change を ID で取り出す |
| 6 | `instructions(apply)` と Skill | `templates/skills/{apply,archive}.md` |
| 7 | 体験の確認（E5・E6） | 体験ログに記録する |

## M4：Should（範囲のみ）

- **S2**：`bench/` を自動で回すスクリプト。レビューの再現率を記録する。
- **S3**：`comb update`。`generatedBy` を比べて Skill を再生成する（`initProject` の更新ロジックを再利用する）。
- 公開の準備：パッケージ名を決める（DESIGN §10）、`files` を確認する、CHANGELOG を作る。

## リスクと対策

| リスク | 対策 |
|---|---|
| Skill や指示文の質が、体験の成否を決める | M1 から実 LLM で確認する。指示文は CLI のテンプレートに集めてあるので、Skill を直さずに改善できる |
| レビューの再現率が E3 の基準（high 5/7）に届かない | M2 では、観点の定義を改善するループを回す。届かなければ観点を絞るか、基準を見直す。いずれも DECISIONS に記録する |
| archive でユーザーの仕様の書式を崩す | M3 はテキストの範囲を差し替える方式にし、触れていない部分のバイト列が変わらないことをテストで固定する |
| 範囲が膨らむ | V0_SCOPE の Must 以外は M4 以降に回す。新しい機能は DECISIONS に記録してから着手する |
