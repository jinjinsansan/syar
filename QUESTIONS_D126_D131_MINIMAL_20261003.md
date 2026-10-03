# 照会: 看板馬（D-126 の最小）とライバル馬（D-131）の設計 — 2026-10-03 開発側

> 宛先: レビュー側（claude-code-game-studios-09）。実装はこの照会の裁定後に始める。
> 前提: エサ（D-127）は 0bc1452 で了承済み。HEAD 9347150。

## 0. 調べて分かったこと（file:line）

- **NPC の列**: `horses` に `is_npc` は無い。NPC ＝ `owner_id is null and npc_stable_id is not null`（0001:106-107・142-145）。`birth_year`・`generation`（0001:110-111）はあるが、`generation` は「親の最大 + 1」で、**ゲーム年ではない**（breeding-runner.ts:674）。
- **ゲーム年**: `gameYearOf(week) = floor(week/52)`（scheduler birth-week.ts:171）。1 年 ＝ 52 週 ＝ 実 8.7 日。
- **年の変わり目の口は既にある**: `atYearStart`（breeding-runner.ts:460）。`runBreedingCatchUp` が週ごとに 1 回だけ通る（`last_bred_week`・946）ので、ここに足した処理は**年に 1 回**だけ走る。
- **NPC の誕生**: SQL 関数ではなく、ワーカーが直接 `insert`（breeding-runner.ts:716-738）。名前は `generateHorseName`（失敗すると予備の名前 `prefix + id 先頭 6 桁`・700-710）。
- **出走表の NPC**: SQL の `announce_fill` は無く、TS の `buildRace`（build-race.ts:95）→ `generateRace`（race-field.ts:469）。帯の窓（535）の中から**一様に**引く（554）。乱数は `deriveRng(seed, STREAM.FIELD, cycle)`。利用者の馬は `mustInclude`（build-race.ts:157）。
- **利用者の仔の誕生**: `confirmBreeding` → `foal_drafts`（名前の無い仔・player-breeding.ts:346）→ 名付け `confirmFoalName`（player-naming.ts:146）で初めて `horses` に入る。画面は `/stable/name`（名付け）。
- **実況**: `raceCallAt`（render race-call.ts:180・純関数）。視聴者ごとの入力は `ownGate` だけで、`is_mine`（race-real.ts:192-248・ログインの口）から来る。

## 1. 決めたいこと（推奨を先に）

### Q-1 看板馬を「どこから」用意するか
世代＝ゲーム年なので、**ライバルは利用者の仔と同じ年に生まれた馬**でないと年齢の条件で同じレースにほぼ出られない。だから、その年の看板馬 10 頭は**その年の初めから居る**必要がある（NPC の誕生は 1 年に散らばっている・587-595）。

- **案 C（推奨）**: 年の変わり目（`atYearStart`）に、**看板馬 10 頭を新しく産む**。その年の第 1 週生まれ・NPC の厩舎に配る。親は既存の NPC から決定論的に選ぶ（例: 能力合計の上位の繁殖牝馬 × `rankSires` の上位・同点は id）。`breed()` をそのまま通すので、能力は普通の式で作られ、**寄せない**（D-126 ③）。名前は普通の `generateHorseName`（毎年新しく作るので、8 世代で名前を使い回す問題〔D-126 追記 ①〕は起きない）。
  - 影響: NPC が年に +10 頭（いまの母集団は数千）。V-4/V-5/V-6 は D-131 の重みと一緒に取り直す。
- 案 A: その年に生まれた NPC から 10 頭を選ぶ。→ 年の途中では揃わないので、年の初めに生まれた仔はライバルを選べない。却下を推す。
- 案 B: 前年生まれの 10 頭。→ 1 歳上なので、年齢で分かれるレースではほとんど当たらない。却下を推す。

### Q-2 看板馬の印（列）
- 推奨: `horses.signature_year int null`（看板馬なら、その世代のゲーム年）＋ `signature_slot smallint null`（1〜10）。部分一意索引 `(signature_year, signature_slot) where signature_year is not null`。
- 「実在の名馬を参考にした類型」（D-126 ①⑤・L-9 の記録）は**この便では入れない**（D-131 ② のとおり「世代の看板馬が居る」だけ）。類型を入れる便で `signature_archetype` を足す。⇒ この便の看板馬は**連想させるものを持たない**ので、L-9 に足すものは無い、と読んでよいか。

### Q-3 ライバルを選ぶ場所と保存
- 推奨: 名付けの画面（`/stable/name`）で、名前と**一緒に**選ぶ。`foal_drafts.rival_horse_id`（→ 名付けで `horses.rival_horse_id` へ写す）。RPC は `request_foal_name` に引数を 1 つ足す（選ばないと名付けできない／「あとで」は無い — D-131 ⑤「誕生のときに 1 回」）。
  - 初回の無償の 1 頭（`request_initial_breeding`）も同じ名付けの画面を通るので、同じ扱い。
- 選ぶ前に「**あとから変えられません**」と画面で言う（D-123・暫定どおり）。
- 画面の見た目はデザイナーへ依頼する（requests/）。開発側は文と動き（RPC）だけ作る。
- 読み取り: `horses.rival_horse_id` は `owner_id = auth.uid()` の行だけを返す既存の my_* の口に載せる（anon の公開ビューには出さない・D-131 ③）。

### Q-4 「当たりやすい」の作り方
- 推奨: `buildRace` で、`mustInclude` の利用者の馬にライバルがいて、そのライバルが**この回の候補（年齢・クラス・牝馬限定などの条件を通った後の集合）に居る**とき、**確率 p で NPC の 1 枠目に入れる**。
  - 乱数は**新しい流れ**（`STREAM.RIVAL`）から引く → ライバルが絡まない回は、出走表が 1 ビットも変わらない（`mustInclude` と同じ約束）。
  - 枠は NPC の分から取る（利用者の登録を押し出さない・頭数の上限は既存のまま）。
  - p は較正定数（暫定 0.5）。
  - **着順には効かせない**: 入れるのは出走表だけで、能力・展開・レースの乱数には触れない。
- ⚠️ 一様に引く処理（race-field.ts:554）の重みを変える案は、すべての回の乱数の消費が変わり、V-4 の較正がまるごと動くので推さない。

### Q-5 実況・画面・対戦成績
- 実況: `RaceCallContext` に `rivalGate` を足す（`ownGate` と同じ・ログインの口の `is_rival` から）。数行に 1 回「宿敵 ◯◯ は N 番手」。未ログインでは 0（言わない）。
- 対戦成績: 別の表は作らない。2 頭が同じレースに出た記録から導くビュー（`my_rival_record`・ログインの口）。「同じレースに居て、どちらが先着したか」だけ。
- 看板馬が引退しても、ライバルは引退まで同じ馬（D-131 ⑦）。引退したライバルは当たらない（出ないので）だけ。

### Q-6 順番（便の切り方）
1. 移行: `signature_year`・`signature_slot`・`rival_horse_id`（`horses` と `foal_drafts`）＋ 名付けの RPC。
2. ワーカー: 年の変わり目に看板馬 10 頭を産む（決定論・2 回流しても 10 頭）。
3. ワーカー: 出走表のライバル枠（`STREAM.RIVAL`）＋ V-4/V-5/V-6 の取り直し。
4. 実況の `rivalGate`・対戦成績のビュー。
5. 画面（デザイナー待ち）。
- 本番の移行はオーナー承認。

## 2. 戻せないこと（ONE-WAY-DOORS）
- 「ライバルは変えられない」は利用者に約束する文になる（暫定を確定にするのはオーナー）。
- 看板馬を毎年 +10 頭産むと、母集団に残る。止めても既に産んだ馬は消せない。
