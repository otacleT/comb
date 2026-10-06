# Experience log

実際の LLM で V0_SCOPE の体験（E1〜E6）を確かめた記録。追記のみ。

| 日付 | 版 | 体験 | 結果 | メモ（つまずいた点、エージェントの逸脱、直すべきこと） |
|---|---|---|---|---|
| 2026-10-06 | 0.0.1 | E1 | pass（非対話で確認） | `comb init --language ja` の後、`claude -p` の init イベントで、スラッシュコマンド `comb:explore` / `comb:propose` と Skill `comb-explore` / `comb-propose` が登録されていることを確認した。UI の候補に表示されるかは目視していない。**つまずき**：`/comb:propose` は Skill ツールへ処理を渡す作りのため、Skill の実行許可（`Execute skill: comb-propose`）が別途必要になる。非対話モードでは許可が拒否され、エージェントは SKILL.md を自分で読んで手順を続けた。→ M1 の追加タスク F1 |
| 2026-10-06 | 0.0.1 | E2 | pass | `claude -p '/comb:propose …本の貸し借り…'`（acceptEdits、許可ツールは `Bash(comb:*)` とファイル操作のみ）。15ターン、97秒、$0.67。新しい capability `book-lending`（prefix は `LEND`）、`REQ-LEND-001`〜`004`、シナリオ12件（日付や書名など具体的な値）、tasks 13件。`comb validate` は ok（diagnostics なし）。ユーザーが言っていない点は、指示どおり `Assumption:` 7件として proposal に明示された（借り手の扱い、期限超過の判定、通知の手段・回数など。M2 のレビューで質問になるべきもの）。正本の `comb/specs/` は編集されていない。`find` / `cat` / `ls` といった読み取りの Bash も使われた |
| 2026-10-06 | 0.0.1+F1 | E1・E2（再確認） | pass | F1 の修正後に、新しい playground で同じ `claude -p '/comb:propose …'` を実行（許可ツールに Skill は含めていない）。Skill ツールは呼ばれず、ツールエラーは0件。11ターン（修正前は15）、103秒、$0.68。`REQ-LEND-001`〜`006`、シナリオ16件、`Assumption` を明示、`comb validate` は ok、正本は編集されていない。コマンドファイルが手順そのものを持ち、frontmatter に `allowed-tools: Bash(comb:*)` が付いた |
