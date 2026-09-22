# 報告: 自分の繁殖牝馬で配合する経路（`kind = 'breed'`・相手は NPC の種牡馬だけ）／不快な語の一覧 — 2026-09-22

> 開発側 → レビュー側。裁定 `REVIEW_BREED_OWN_MARE_VERDICT_20260922.md`、および同 `REVIEW_I1_STEP3_ROLE_REQUEST_VERDICT_20260922.md` §5-2。
> staging には `0071` を当てた。**本番には触れていない。** push していない。
> 画面は作っていない（B-7: 「繁殖入り」と一緒にデザイナーへ依頼する）。

## §0 一行

受付の RPC・確定・種付料の引き落とし・読む口・総獲得賞金の 1 か所化を入れた。
- 受付は `request_breeding`。
- 確定は `breed_initial` と同じ関数（`confirmBreeding`）で、経路は 1 本のまま。
- 種付料はワーカー専用の `spend_stud_fee_ep` で引く。
- 読む口は `npc_stallion_facts`（事実だけを返す）。
- 総獲得賞金は SQL の関数 `horse_total_prize_pp` の 1 か所にまとめた。

staging の予行は判定した 6 件すべて合格（⑥ は staging にレースが 0 件なので判定しないと明示した）。初回の配合の予行（37 件）も合格したまま。

## §1 変えたもの

| ファイル | 中身 |
|---|---|
| `db/migrations/0071_breed_own_mare.sql` | ① `horse_total_prize_pp`（stable・利用者から実行不可）<br>② `foal_requests` に `breed_year`・`max_fee_ep`・`stud_fee_ep` を足し、形の制約 2 つと部分一意 `(dam_id, breed_year) where kind='breed' and status<>'failed'`<br>③ `spend_stud_fee_ep`（ワーカー専用・記帳を先に行い一意で二重に引かない・`spend_training_ep` と同じ作り）<br>④ `request_breeding`（利用者の行を先にロック・ST020/022/023/024/025/040/041/042）<br>⑤ `npc_stallion_facts`（事実だけ） |
| `apps/worker/src/player-breeding.ts` | `confirmBreeding` にまとめた。`confirmInitialBreeding` は旧名として同じ関数を指す<br>・母の条件と種付料を `kind` で分ける<br>・ロックは要求 → **利用者** → 母 → 父（役割の変更・購入と同じ「利用者 → 馬」）<br>・種付料は確定のときの `npcStudFee`。上限を超えれば `fee_above_max`<br>・引き落としはセーブポイントで包み、ST001 なら `ep_short`<br>・待ちの拾い上げと数えに `'breed'` を足した |
| `apps/worker/src/market-flow.ts` | 総獲得賞金を `horse_total_prize_pp(h.id)` に |
| 試験 | `player-breeding.test.ts`（+5: 成功／上限超え／EP 不足／母が変わった／ロックの順）・`total-prize-single-source.test.ts`（新規）・`rpc-guard.test.ts`（読むだけ 2・ワーカー専用 1）・`fake-predicate-coverage.test.ts`（賞金の述語が関数へ移った） |
| `tools/verify-breed-own-mare-live.mjs`（新規・STATE_CHANGING・必ず rollback） | 予行 ①〜⑦ |
| 登録簿 | classification・tool-aftermath |

## §2 裁定の条件への対応

- **§1（B-4 の条件）**: 払うのは常に確定の額で、上限は断る理由にだけ使う。画面が見積もりをそのまま入れること、`fee_above_max` を `internal_error` と分けて見せることは、デザイナーへの依頼文に書く（画面はまだ無い）。
- **§2（読む口で計算しない）**: `npc_stallion_facts` が返すのは、`horse_id`・`name`・`birth_week`・`g1_wins`・`coverings_this_year`・`total_prize_pp` の 6 列だけ。残り枠と額は返さない。素質・能力の列も無い（予行 ⑤ で列を数えた）。
- **§3（総獲得賞金の 1 か所化）**:
  - `horse_total_prize_pp` を作り、`market-flow`・`player-breeding`・読む口が呼ぶ。
  - 試験は、コード（apps・packages・tools）に `sum(prize_pp)` が 0 か所、移行では関数の中の 1 か所だけであることを見る。
  - 変異: `market-flow` に元の SQL を戻すと赤。
  - ⚠️ この試験を書いたとき、`g` 付きの正規表現を `.test` で使い回していた（前の一致位置が残り、ファイルによっては見落とす）。フラグ無しに直した。
- **§4（EP の引き方）**:
  - `spend_stud_fee_ep` は `spend_training_ep` と同じ作り（記帳が先・`dedupe_key = stud_fee:<要求 ID>`・一意に当たれば引かない）。`public`／`anon`／`authenticated` から実行できない。
  - 予行 ② で、台帳の最後の `balance_after` と `users.entry_points` が一致した（997,000）。

## §3 staging の予行（`npx tsx tools/verify-breed-own-mare-live.mjs --env staging`）

| # | 結果 |
|---|---|
| ① 受付 | pending・再送は前の行・ST040／ST042（同じ母・同じ年）／ST024（自分の繁殖牝馬でない）／ST025（持ち主のいる父）／ST023（上限 0） |
| ② 確定 | done・下書き 1・額 3,000・残高 1,000,000 → 997,000・台帳の最後 997,000（−3,000・stud_fee） |
| ③ 上限超え | fee_above_max・残高も台帳も動かない |
| ④ EP 不足 | ep_short・残高 1 のまま・台帳 0・下書き 0 |
| ⑤ 読む口 | 206 頭・事実の 6 列だけ・総獲得賞金 ＝ `horse_total_prize_pp`・持ち主のいる種牡馬は出ない |
| ⑥ 総獲得賞金の値 | **判定しない**（staging はレース・出走とも 0 件）。数え方の 1 か所化は構文の試験が見ている |
| ⑦ 後始末 | 要求・下書き・台帳・馬の数が前後で一致 |

- 回帰: `verify-player-breeding-live`（初回の配合）は 37 件すべて合格。確定の関数を共有しても壊れていない。
- 単体の変異: 上限の確かめを外すと赤、EP 不足の見分けを外すと赤。
- 取引の境界（裁定 I-1 §6 の決め）: `confirmBreeding` は相変わらず `begin`／`commit` をしない。足したのは種付料のセーブポイントだけ。呼び出すもの:
  - `runPlayerBreeding`（1 件 ＝ 1 取引）
  - `verify-player-breeding-live`（旧名で）
  - `verify-breed-own-mare-live`
  - 偽の DB: `player-breeding.test.ts`
  4 つとも新しい文に答えるか、既定で通ることを確かめた。

## §4 不快な語の一覧（§5-2・`f1a5ebe`）

- `loadNameChecks`: 一覧を 3 種類持つ。実在馬名（無ければ既定で止まる）、不快な語の完全一致、不快な語の「含む」（名前の中の連続した部分をすべて調べる）。不快な語の 2 本は無くても投げない。
- 版は、読めた一覧だけを決まった順に並べた文字列（例 `real-horse:<16 桁>+offensive-contains:<16 桁>`）。1 つも無ければ null。**どの一覧に当たったかは返さない**（提案 §2 段 1）。
- ワーカーの命名（利用者）と NPC の仔の名前の両方が、これを使う。
- 再検査の道具は「今の一覧の組で検査されていない行」（null、または前の組で合格した行。当たりの印は除く）を拾い直す。不快な語の一覧を足した日に、既存の合格の行も見直せる。
- 憲法の検査（`verify-constitution` C-4）の見張りの正規表現を、新しい関数名にも広げた。ワーカーの 2 か所を拾えていることを確かめた。
- staging の `--rehearse`（検証用の実在馬名 2 件＋「含む」1 文字）: 当たり 1,659 頭・合格 5,711 頭。6 件とも合格し、戻した後は未検査 7,370 頭に戻った。
- ⚠️ 「前の組で合格した行を拾い直す」経路は、staging の行がすべて未検査のため、予行では通っていない。
- 試験 `name-checks.test.ts`（6 件）。「含む」の走査を先頭だけにする変異で赤。
- ⚠️ 残り: 提案 §4 の後半（運営が名前を仮の名前に戻す道具）はまだ。

## §5 次

- デザイナーへの依頼（繁殖入り＋自分の母の配合の画面・`fee_above_max` と `ep_short` の見せ方）の文を用意する。依頼はオーナーの画面の方針に従う。
- 本番: `0071` が増えたので、手順書 ④「0066〜最後」に含まれる（番号の範囲は変えない）。
