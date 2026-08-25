# REPORT — v5 を通常 /race の既定へ昇格（2026-08-25）

指示書: 実装指示「v5を通常 /race の既定候補へ昇格」
★採否は書いていません。commit・push はしていません。

---

## 1. 変更ファイル（6 本）

| ファイル | 変更 |
|---|---|
| `packages/render/src/broadcast-v2.ts` | `DEFAULT_RACE_SCRIPT = 'v5'` / `LEGACY_RACE_SCRIPT = 'v4'` / `broadcastV2ScriptFromSearch()` を追加。§5 のコメントを記載。カメラ定義（`SHOTS`）は無変更 |
| `packages/render/src/broadcast-v2-scene.ts` | `script` オプションを `BroadcastV2Script` 型へ広げ、固定カメラの終点 `broadcastV2ShotEndM` へ台本をそのまま渡すよう変更。★新しい台本型と固定カメラ終点を正しく伝播させるために必要な変更で、残骸ではありません |
| `apps/web/src/app/race/page.tsx` | URL の読み方を `@star/render` の関数へ委譲（1 行）。import に 1 語追加。既存の `script:` 3 か所はそのまま |
| `packages/render/test/script-v5.test.ts` | §8 の 10 項目へ書き換え（＋ポート・比較動画の検査で計 12 件） |
| `tools/capture-script-v5.mjs` | 旧 v4 側の URL を `&cinematography=v4` に（既定が反転したため） |
| `tools/render-script-v5-sheets.mjs` | 台本表の写しを削除し `broadcastV2ShotAt` を通すよう変更（§6 二重管理しない） |

`apps/web/package.json` のポート 3210 は保持。3D・S3・v9 の研究コードは入れていません。

### 既定の挙動

```
指定なし                        → v5
?cinematography=v5    → v5
?cinematography=v4              → 旧 v4
不正値                          → v5
```

URL だけで決まります（localStorage・時刻・乱数は使っていません／憲法4）。

⚠️ `broadcastV2ShotAt` などライブラリ側の既定引数は `v4` のまま残しました。
`script` を渡していない既存の測定ツール・テストが多数あり、そこまで巻き込むと指示の範囲を超えるためです。
画面の既定は `broadcastV2ScriptFromSearch` が決めます。

---

## 2. 実画面確認（§7）

開発サーバー（ポート 3210）で、seed 42 を同じ時刻で 5 点ずつ撮って突き合わせました。

| URL | HTTP | 着順 | 発走 | 序盤 | 第4コーナー | 直線 | ゴール前 |
|---|---|---|---|---|---|---|---|
| `/race` | 200 | 一致 | 基準 | 基準 | 基準 | 基準 | 基準 |
| `?cinematography=v5` | 200 | 一致 | 同 | 同 | 同 | 同 | 同 |
| `?cinematography=invalid` | 200 | 一致 | 同 | 同 | 同 | 同 | 同 |
| `?cinematography=v4` | 200 | 一致 | 同 | 同 | **違** | **違** | **違** |

- `/race` と `v5` と `invalid` は 5 点すべて**絵が完全に同じ**
- `v4` だけ旧映像。発走・序盤は同じ絵
- 着順は 4 URL すべて一致

⚠️ `v4` の**ゴール前も違う絵**になります。`finish-line` は台本上どちらも同じショットですが、
カメラ平滑化状態が前カットから引き継がれるためです（§5 の既知挙動・比較動画で承認済み）。

---

## 3. テスト結果

`packages/render/test/script-v5.test.ts` — **12 件パス**

| | 内容 | 結果 |
|---|---|---|
| ① | 既定が v5 | パス |
| ② | 明示的な v5 も同じ | パス |
| ③ | 不正値が v5 へ戻る（6 通り） | パス |
| ④ | v4 で旧台本を選べる | パス |
| ⑤ | 台本差は 2 ショットだけ（境界も同値） | パス |
| ⑥ | `fourth-corner-high` が選ばれる | パス |
| ⑦ | `homestretch-side` が選ばれる／発走・1角・道中・ゴールは両者同じ | パス |
| ⑧ | race-engine・sim-engine に変更なし | パス |
| ⑨ | HUD 無変更（基準 HEAD との差分が台本の受け渡し行だけ） | パス |
| ⑩ | カメラ定義値無変更（`SHOTS` が基準と一字一句同じ） | パス |
| ＋ | ポート 3210 保持 | パス |
| ＋ | 比較動画 8 本が対でそろう | パス |

全体: `npm test` **112 ファイル / 1121 件パス**、`npm run typecheck` エラーなし、`npm run build:web` 成功。

---

## 4. 既知の許容事項（今回は直していません）

1. **HUD 重なり** — 進行 88〜93% で馬体が右上の順位表の下を通ります。
   順位表の位置・透明度・表示時間、カメラ offset、`homestretch-side` の zoom、target は変更していません。
2. **カメラ状態の引き継ぎ** — `finish-line` の絵が旧 v4 と約 22.6% 変わります（seed 42 実測）。
   強制リセット・前カット状態の消去・smoothing 変更はしていません。

---

## 5. 途中で見つけたこと

**`out/2d-script-v5/seed-474-v5.mp4` が消えていました。**
01:18 時点では存在していた（送付用コピーをそこから作っています）ものが、テストで欠落を検出しました。
削除の原因は特定できていません。連番 1160 枚は無傷だったので、**撮り直さず同じコマから同じ設定で
再エンコード**して復元しました（1160 コマ / 30fps / 1280×720、対の一致は再確認済み）。
新規撮影はしていません。
