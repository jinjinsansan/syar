# 報告: プレイヤーの配合の確定（PLAN I-2・D-120）— 2026-09-22

- 開発側 Claude（`star-aa`）
- 対象の裁定: `55b2fd4`（置き場所・冪等キー）／`7efc3a0`（D-120）／`ff7028c`（命名前の仔・命名の検査）
- 開始 HEAD `4fd72d5` → 実装 `3aa5604` → 本報告のコミット（取引の分離・0062・実演の道具）
- **到達点: 「staging で生産成功（取引の中で・戻した）」まで。** 画面は無い。本番の DB・ワーカーには触れていない

## 1. 作ったもの

| | 中身 |
|---|---|
| `db/migrations/0061_foal_requests.sql` | `foal_requests`（kind = `breed_initial` / `breed` / `name`・冪等キー 2 段・種類ごとの部分一意）／`foal_drafts`（命名前の仔を `horses` の外に置く・`unique (dam_id, birth_week)`）／RPC `request_initial_breeding`・`my_initial_breeding`・`my_foal_drafts` |
| `db/migrations/0062_request_initial_breeding_fix.sql` | 🔴 **0061 の受付 RPC は呼ぶと落ちた**（下の §3-1）。定義し直し |
| `apps/worker/src/player-breeding.ts` | `confirmInitialBreeding`（1 件の確定・取引に触らない）／`runPlayerBreeding`（毎周・1 件 ＝ 1 取引）。`main.ts` の周の末尾につないだ（週送りの try の外・A-1） |
| `apps/worker/src/breeding-runner.ts` | 共通部品の切り出し（`breedingRecordOf` / `birthYearOffset` / `loadAncestorLookup` / `loadNicks` / `idAndSeedFromKey`）。NPC の母の印の取り方を変更（§3-2・§3-3） |
| `tools/verify-player-breeding-live.mjs` | staging の実演（取引の中・必ず rollback・22 判定）。登録簿（`classification` / `tool-aftermath`）に登録 |
| 検査 | `apps/cli/test/player-breeding.test.ts`（13）／`breeding-runner.test.ts` に 2 本追加 |

## 2. 測ったこと（コマンドと結果）

```
npx tsx tools/migrate.mjs --env staging            # 0060・0061・0062 を staging に適用（終了コード 0）
npx tsx tools/verify-player-breeding-live.mjs --env staging   # 2 回流した。どちらも 22/22 合格・終了コード 0
npm run gate                                        # 3aa5604 の時点で 5 段合格（本報告のコミットでも流す）
```

実演の主な値（staging・週 270・1 回目と 2 回目で同じ）:
- 受付: 同じ要求 ID → 同じ行／別の要求 ID → 最初の行／他人の要求 ID → 拒否。要求の行は 1 つ
- 確定: 下書き 1 頭（選んだ父母・本人・週 270）、母 `foal_count` 0→1・印 false→true、父 `coverings_this_year` 0→1、台帳に増減 0 の `stud_fee` 行、免除額 3,000 EP（要求の行）、EP 2,000 のまま
- 仔の ID ＝ `idAndSeedFromKey('player-foal|' + 要求 ID)`（2 回とも `0605f415-…`）
- もう一度確定 → `skipped`・下書き 1 のまま
- 本人の読む口の列: `draft_id, sex, sire_id, sire_name, dam_id, dam_name, birth_week, named_horse_id`（非公開の列なし）。他人からは 0 行
- ⑦ NPC の週次配合（週 305）: 同じ母の今年の仔 **0 頭**・既に居た 1。**対照**: 同じ週が番の他の母は **22/22 頭 産んだ**
- rollback の後、5 つの表の行数が前後一致
- 確定 1 件の所要: **2.8〜2.9 秒**（この PC → staging。VPS からは未測定）

## 3. 途中で見つけたこと

1. 🔴 **0061 の `request_initial_breeding` が呼ぶと落ちた**（`column reference "status" is ambiguous`）。`returns table (… status …)` の列名が PL/pgSQL の中で変数になり、表の列と衝突した。**偽の DB の検査では原理的に見えない**。0061 は staging に適用済みなので書き換えず、0062 で表の列を別名付きで参照する形に定義し直した。★**同じ形は他の `returns table` の関数にも起こりうる**（今回は網を作っていない。作るなら「`returns table` の列名と同じ語を、別名なしで SQL に書いていない」の静的検査）
2. 🔴 **NPC の配合は母の行をロックせずに読む**（呼ぶ側も取引を張らない）。プレイヤーの確定が間に入ると、NPC が同じ母で産ませうる。→ NPC 側の母の印を「**まだ取られていなければ取る**」条件付きの更新に変え、0 行なら入れた仔を消して「既に居た」と数える（母 → 父 の順）。取り合いの無い通常の運転では結果は変わらない
3. 🔴 **年の変わり目に NPC が全馬の印を戻す**ので、プレイヤーがその週に配合した母が同じ年にもう一度産めてしまう。`unique (dam_id, birth_week)` は表ごとで 2 つの表をまたげない。→ 印に頼らず **2 つの表でその年の仔を数える**（`damHasFoalInYearSql`）。プレイヤー側は両方の表、NPC 側は下書きの表だけ（自分がいま入れた仔を数えないため）
4. ⚠️ `foal_drafts` を問い合わせる NPC 側の条件は、**表が在るときだけ**付ける（`hasFoalDrafts`）。0061 の前の DB（いまの本番）で NPC の配合が落ちないため。表が無ければ下書きの仔も在りえないので判定は同じ
5. ⚠️ 確定の本体から `begin`/`commit` を外した（呼ぶ側が張る）。内側で commit すると実演の rollback が効かないため。検査で釘付け

各判定は**わざと壊して落ちることを確かめた**（`claim.rowCount` の分岐を殺す → 検査 ⑤ が落ちる／年の仔の判定を殺す → 失敗の検査が落ちる。戻した後の行数一致も確認）。

## 4. 決めたこと（裁定の範囲内で開発側が選んだ形）

- 仔の誕生週は **いまの週**（NPC は締まった週を処理するが、プレイヤーの仔は確定した時点で生まれる）
- 免除の記帳: `ep_ledger` に `delta = 0`・`reason = 'stud_fee'`・`ref_id = 要求 ID`・`dedupe_key = 'stud_fee_waiver:<要求 ID>'`。額は `foal_requests.waived_stud_fee_ep`
- 失敗の理由の語: `canMate` の reason ＋ `parent_missing` / `sire_not_candidate` / `dam_not_candidate` / `owner_limit`
- 1 周で拾う上限 20 件（`PLAYER_BREEDING_BATCH`）。⚠️ **確定 1 件 2.9 秒 × 20 ＝ 58 秒で周（60 秒）に迫る**。VPS からの所要を測ってから決め直す

## 5. 未完了・持ち越し（完成と呼ばない）

| | |
|---|---|
| 父母候補の出どころ（D-120 ⑥ N-1） | **暫定**: 持ち主の居ない NPC の種牡馬・繁殖牝馬だけ（`isInitialParent`）。裁定 §6 の「登録 N 人あたりの供給の減り」と「種牡馬の枠の消費」は**まだ出していない**（次の項目） |
| 命名（kind = `name`）・`name_key`・`name_checked_with` | 未実装（PLAN I-3） |
| 導入の永続状態・画面 | 未実装。デザイナー待ち |
| D-113 ⑦（開発期間中は招待制）の本番の現状 | **未測定**（D-120 ② の条件。本番を読む工程なのでオーナーに 1 コマンドで渡す） |
| 本番 | 0060・0061・0062 とも**未適用**。順序は 本番の血統修復 → 0060 → 配備 → 0061・0062。**ワーカーを配備する前に 0061 を当てる必要はない**（表が無ければ何もしない作り・§3-4） |
| VPS からの所要 | 未測定 |
