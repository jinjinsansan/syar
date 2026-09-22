# 報告: 導入の永続状態（初回の馬づくりを途中から再開できるようにする）— 2026-09-22

- 開発側 Claude（`star-aa`）
- 照会 `QUESTIONS_ONBOARDING_STATE_20260922.md`・裁定 `REVIEW_ONBOARDING_STATE_VERDICT_20260922.md`（`8a32840`・§6 `2b3b4c5`）
- **到達点: staging で完了**（本番は未適用）。画面の行き先の切り替え（login・home）は、導入の画面（デザイナー待ち）ができてから

## 1. 作ったもの

| | 中身 |
|---|---|
| `0067` | `users.onboarding_flow`（`'legacy' / 'first_horse_v1'`・check で閉じる・**既定値は `'legacy'`**〔裁定 §6〕・書き換える口は無い）／`create_account` を定義し直し（0037 と同じ中身 ＋ `'first_horse_v1'` を明示して書く）／読む口 `my_onboarding_state(p_min_breeding_age_weeks, p_max_lifetime_foals)` |
| `0068` | 🔴 **`world_state` の行が無いと、候補が在っても「候補切れ（false）」を返していた**のを直した（いまの週が読めなければ `null`＝分からない）。0067 は staging に適用済みなので書き換えず、定義し直した |
| 段階 | `no_account / legacy / choose_parents / waiting_birth / naming / ready`。★新しい列に書き写さず、在る行（口座・要求・命名前の仔）から導く |
| 候補切れ | `choose_parents` のとき `has_dam_candidate`。★年齢の下限と生涯の産駒数の上限は、呼ぶ側が `@star/sim-engine` の値を渡す（SQL に定数を写さない）。★いまの週はワーカーが書く `world_state.game_week`（時刻から計算しない） |
| ワーカー | 母が候補でなく、いま選べる母が 1 頭もいなければ、失敗の理由を `no_candidate`（`internal_error` とは別の見せ方） |
| 画面 | `apps/web/src/lib/onboarding.ts`（`fetchOnboardingState`・知らない段階の語は投げる） |
| 検査 | `onboarding-screen-reads.test.ts`（画面が要求・命名前の仔の表を直に読まない・構文）／`no_candidate`（偽の DB）／`my_onboarding_state` を読み取り専用の登録簿へ |

## 2. 測ったこと

- 門: 5 段合格（検査 2,818 件・赤 3 件・登録 3 件）。⚠️ **バックグラウンドの門は Claude Code に 3 回止められた**（待機中の空きメモリ不足の判断・`build:web` の段）。前景で timeout 10 分にして通した
- staging の実演 **37/37**（`tools/verify-player-breeding-live.mjs` ⑩）:
  - 本物の `create_account` が `first_horse_v1` を書く・直に入れた行は既定値で `legacy`（対照）
  - いまの週が分からない（`world_state` の行が無い）ときは候補の有無を `null`（★「候補切れ」と言わない）→ 行を入れると `true`
  - 段階の並び: 作成直後 `choose_parents` → 要求の後 `waiting_birth` → 確定の後 `naming` → 命名の後 `ready`
  - `legacy` の口座は初回の配合に戻さない・段階の読む口が非公開の能力値を返さない
- 📝 **staging の `world_state` は 0 行**だった（★staging のワーカーが一度も書いていない）。★0068 の欠陥はこれで表に出た。★本番は、ワーカーが動いているので行が在る見込み（未測定）

## 3. 未完了・配備で注意すること

| | |
|---|---|
| 本番への適用 | 未。0067・0068 は 0061〜0066 の後ろ。オーナーの許可が要る |
| ⚠️ 既存の口座 | 0067 の後、★既存の口座（★オーナーの確認用を含む）は `legacy` になる。★**新しい流れを試すには新しい口座を作る**（裁定 §3・配備の手順書にこの 1 行を書く） |
| 画面の行き先 | `login`・`home`・`useStableView` を `my_onboarding_state` で振り分けるのは、導入の画面（父母選択・誕生・命名）ができてから。★いまは段階を読む口だけ |
| 「あとで」 | 導入の画面に「あとで」ボタンは置かない・ナビで `/home` などへ抜けるのは止めない・戻れば続きから（裁定 §4）→ デザイナーへの確認事項 |
| `world_state` が古いとき | 年齢の判定が遅れの週だけずれる。★判定の正本は確定時のワーカー |
