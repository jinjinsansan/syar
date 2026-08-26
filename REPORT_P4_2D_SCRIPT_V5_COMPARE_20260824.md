# REPORT — P4 2D StarHorse編集台本・比較動画 v1（2026-08-24）

指示書: 実装指示「StarHorse編集台本・比較動画 v1」
★採否は書いていません。判定はレビュー側です。

---

## 1. 変えた 2 ショット

現行 v4 のショット列のうち、置き換えたのは 2 か所だけです。

| 区間（until） | 現行 v4 | 候補 v5 |
|---|---|---|
| 第4コーナー（0.500–0.660） | `fourth-corner-front` | **`fourth-corner-high`**（正面 → 俯瞰） |
| 直線（0.660–0.940） | `homestretch-front` | **`homestretch-side`**（正面 → 横追従） |

そのほか（`start-front` / `first-corner-front` / `side-drive` / `finish-line`）は維持。
カット境界 `until` は 6 行とも同値で、18.6 秒の直線カットは分割していません。
target とカメラ定義は各ショットが元から持っているものをそのまま使い、
接戦判定・自馬追従・先頭馬追従は足していません。

フラグ: `/race?cinematography=v5`（完全一致のみ。指定なし・不正値は現行 v4）

---

## 2. 比較動画 8 本

`out/2d-script-v5/`

| seed | 現行 v4 | 候補 v5 | コマ数 | 長さ | 解像度 |
|---|---|---|---|---|---|
| 42 | `seed-42-current.mp4`（30MB） | `seed-42-v5.mp4`（30MB） | 1157 | 38.53s | 1280×720 |
| 332 | `seed-332-current.mp4`（30MB） | `seed-332-v5.mp4`（25MB） | 1128 | 37.57s | 1280×720 |
| 474 | `seed-474-current.mp4`（30MB） | `seed-474-v5.mp4`（29MB） | 1160 | 38.63s | 1280×720 |
| 14 | `seed-14-current.mp4`（30MB） | `seed-14-v5.mp4`（28MB） | 1188 | 39.57s | 1280×720 |

レース開始からゴールまで・30fps・音声なし・HUD 条件統一（`badge=0` のみ）。
**後から時間位置を調整していません。** 各 seed の連番は現行・候補とも同じ表示秒で撮っています。

比較シート（発走／第4コーナー／直線入口／直線中盤／ゴール前を上下に並置）:
`seed-42-comparison.png` `seed-332-…` `seed-474-…` `seed-14-…` `all-seeds-comparison.png`
各コマの上に、その時点で実際に選ばれているショット ID を出しています。

---

## 3. 破綻の有無

**破綻は出ていません。** 停止条件はどれも該当しませんでした。

- 候補側 2 ショットとも背景（芝・柵・スタンド・内馬場）が描かれています
- 黒帯・素抜けはありません
- 全馬が画面外になるコマはありません（`fourth-corner-high` で 7 頭、`homestretch-side` で 2〜6 頭）
- 着順・表示順位は対で一致（`gate.json` の `orderMatch` が 4 seed とも true）
- 既定 `/race` の映像は変わっていません
- 動画生成は 8 本とも技術的に成功（各本ともコマ数と異なる絵の数が一致、同じ絵の連続は最長 1）

なお指示どおり、「2 頭しか見えない」「自馬が一部画面外になる」は停止条件として扱わず、
隊列の再加工もしていません。

---

## 4. 既定が変わっていないことの確認

- `/race`（フラグなし）→ `v4`（テスト①）
- `/race?cinematography=starhorse-V1` など不正値 → `v4`（テスト②）
- 台本表の差分はショット 2 個のみ、`until` は全行同値（テスト③）

---

## 5. テスト結果

`packages/render/test/script-v5.test.ts` — **7 件パス**

| | 内容 | 結果 |
|---|---|---|
| ① | フラグなしは現行 v4 と同じショット | パス |
| ② | 不正値では候補にならない（完全一致だけ） | パス |
| ③ | v4 との違いはショット 2 個だけ（境界も長さも同じ） | パス |
| ④ | 第4コーナーで `fourth-corner-high` が選ばれる | パス |
| ⑤ | 直線で `homestretch-side` が選ばれる | パス |
| ⑥⑦⑧ | 4 seed とも 2 本そろい、コマ数・fps・解像度・長さ・着順が一致 | パス |
| ⑨ | ポート 3210 の設定を保持 | パス |

⑩ commit・push はしていません（`git status` は未コミットのまま、HEAD は `93d270c`）。

全体: `npm test` **112 ファイル / 1116 件パス**、`npm run typecheck` **エラーなし**。

---

## 6. 変更ファイル

製品コード（フラグで分岐、既定は不変）

- `packages/render/src/broadcast-v2.ts` — `BroadcastV2Script` に `'v5'` を追加、`SCRIPT_STARHORSE_V1` と `scriptRowsOf()`
- `packages/render/src/broadcast-v2-scene.ts` — `script` オプションを受け渡し
- `apps/web/src/app/race/page.tsx` — `?cinematography=` の読み取り（完全一致のみ）

測定・成果物

- `tools/capture-script-v5.mjs`（新規）
- `tools/render-script-v5-sheets.mjs`（新規）
- `packages/render/test/script-v5.test.ts`（新規）
- `tools/lib/classification.mjs` — 登録簿に 2 本追記（R-24）
- `out/2d-script-v5/` — 動画 8 本・シート 5 枚・`gate.json`・`README.txt`

`apps/web/package.json` のポート 3210 変更は保持しています（どのコミットにも含めていません）。

---

## 7. 撮影で踏んだ問題（作り直す人向け）

1. **同じ値をシークバーに入れ直しても React は再描画しません。** → 値を一度ずらして戻します
2. **長く連続シークすると描き直しを取りこぼします。** 区切って開き直しても消えず、
   34 コマの連続が開き直しの境目でちょうど終わっていました。→ 1 コマずつ前と見比べ、
   同じならシークからやり直します（1 回だけ）
3. **`gate.json` を丸ごと書き直していたため、`--seeds` を分けて走らせると先に撮った
   seed の検査記録が消えました**（42/332 が 474/14 の実行で消えた）。→ seed 単位の差し替えに変更し、
   撮り直さず検査だけやり直す `--verify-only` を追加
4. **比較シートの第4コーナーを進行 68% で撮っていましたが、境目 0.660 を越えていて
   直線カットでした。** 俯瞰が 1 枚も写らないので 60% に直しました
