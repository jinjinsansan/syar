# 引継ぎ書 2026-10-01 夕方（開発側 Claude → 次のセッション）

> まずこれを読む。続けて CLAUDE.md と MEMORY.md の索引を読む。
> 書いた時点の HEAD は `2a2dc62`。origin/main も同じで、すべて push 済み。
> 作業ツリーには、別の作業者（サブエージェント）の **未コミットの変更** が残っている（§1）。

## オーナーの方針（変わらず）
- 「余計な作業は省いてください　とにかく完成を仕上げてください」
- 「本番がどう見えるか？は気にしないでください。重要なのは完成品にすることです」
- push は「プッシュしてください」と言われている。web の配備は `git push origin HEAD:refs/heads/main`。反映は `https://www.umamonogatari.com/api/healthz` の sha で確かめる。
- 本番の移行と、ssh でのワーカー配備はオーナーが手で回す（私の ssh は分類器に止められる）。
- 見た目は必ずデザイナー経由（DesignSync・projectId `8d3af359-df88-42aa-b686-b4f1d09ce64f`・`requests/` に 1 依頼 1 ファイル・`_INDEX.md` を更新）。

---

## 0. オーナーへの返事待ち（最初に聞く／返事を拾う）

1. 🔴 **ホームの馬が「黒くオーバーレイされている」**（スクリーンショットはホーム・PC 幅・鹿毛の 1 頭）。
   - 原因（推定・ほぼ確実）: 今日の `df3f8dc` で、ホームと育成の馬にレースと同じデフォルメ用の毛色の表 `DEFORMED_COAT_TRANSFORMS` を当てた。
     - 鹿毛は `saturate 0.60 / brightness 0.82 / hue -5`（`packages/render/src/coat.ts:295`）。それまでのホームは素材のオレンジのままだった。
   - オーナーには次の 2 択を出して、返事待ち。
     - **A**: 鹿毛を少し明るく（レースも同じだけ明るくなる。値はデザイナーに決めてもらう）
     - **B**: ホームと育成だけ素材の色に戻す（レースと色がずれる）
   - 背景の暗さは別の原因で、`screenOverlayCss()`（暗幕）。PC 2a では「ホームは暗幕なし」が仕様で、§1 の作業に入っている。
   - ⚠️ 馬の見た目は決定済み（`DECISIONS_HORSE_LOOK_20260924.md`・9 毛色・白斑なし・メモリ horse-look-decided-9-coats）。足す提案はしない。
2. **場名の確認**: `packages/scheduler/src/venues.ts` の VENUES に、府中・淀・仁川・幕張など実在の競馬場の通称に見えるものがある。D-125（近いが変えた名前は可）でよいかを、公開前に 1 回だけ見てもらうよう伝えた。
3. オーナーが今日答えたもの: 経済は **案 B**。「最後の直線の異常な速さは今のところ見えない。ただし芝が停止したり、ぎこちない部分はある」→ §2。

---

## 1. ✅ PC 大型ビジョン（デザイナー案 2a）— 完了・コミット `801ba3c`・push 済み（追記）

> **この節の下の本文は、書いた時点（作業中）のまま。** その後サブエージェントが完了し、私がスクリーンショット（1280 のホームと /vote）を見てコミットした。報告の全文は `out/tmp/pc-vision-report.md`、撮影は `out/tmp/vision-final/`。
> - 残り（していないこと）: 1 段目の「残り 600m」・§1-2 の背景（パノラマ 46%・一様の暗幕 0.6）・ほかの画面の主ボタン移動・/exchange /entry /stable/market の EP/PP を上の段へ。
> - 掲示板が空になる件: PC 幅に固有の不具合は再現しなかった。CSS とタイマーの 2 つの時計を 1 つにした（onAnimationEnd）。
> - 範囲外の発見: 掲示板と待ち画面で「芝3000m ・ 芝3000m」のように距離が二重に出る（`raceLine` がレース名にある距離を足している）。**未修正。**
> - デザイナーの R-27 回答の ① に「実装しました」を追記して同期するのは、まだ。

（以下、作業中に書いた原文）

- 指示の範囲: `out/vision/design_handoff_pc_vision_votehistory/README.md` の ①（1-1〜1-6）。見本は `PC表示 修正案.dc.html` の 2a と `PcAlt.dc.html`。
- 頼んだこと:
  1. 1024px 以上だけ 1240 の枠に揃える。上段の EP/PP は横長のカプセルにする。
  2. 右上に大型ビジョン（RaceStrip の big・柱・頭の行・下の 次/掲示板）。
  3. ホームの配置（馬の舞台・6 ボタンを 1.5fr×2＋1fr×4）。
  4. ほかのページは中身を right:460 に収め、/vote の主ボタンはビジョンの下へ。
  5. 🔴 掲示板の欄が PC 幅で空になる原因を調べる。
- 🔴 レビュー側の条件: 大型ビジョンには小窓と同じ中身（RaceStrip）を流す。録画や別のレースにしない（オーナー決定）。
- 報告は `out/tmp/pc-vision-report.md` に書くよう頼んだ（このセッションが終わるため）。**次のセッションは、まずこのファイルがあるか見る。**
  - 無ければ、作業が途中で止まっている。`git diff --numstat` で下の未コミットの変更を見て、自分で仕上げる。
- 未コミットの変更（書いた時点）:
  - `apps/web/src/app/home/page.tsx`
  - `apps/web/src/app/train/page.tsx`
  - `apps/web/src/app/vote/page.tsx`
  - `apps/web/src/app/mypage/page.tsx`
  - `apps/web/src/components/uma/race-strip.tsx`
  - `apps/web/src/components/uma/race-strip-sizes.ts`
  - `apps/web/src/components/uma/uma-parts.tsx`
  - `apps/web/src/components/uma/uma-theme.css`
  - `apps/cli/test/race-strip-sizes.test.ts`
  - ⚠️ `apps/web/public/art/uma/title-eye.*` の削除と `design/art/prompts/train-body-idle.txt` は **私のでもサブエージェントのでもない**。コミットに含めない。
- 確かめること:
  - 1280 / 1100 / 390 で撮る（dev は :3210）。390 は見た目が変わっていないこと。
  - `npx vitest run apps/cli/test`。既知の失敗は `breed-year-scale.test.ts` の 1 件だけ。
  - `npx tsc --noEmit -p apps/web`
- 仕上げたら、デザイナーへの `requests/R-27-answer-20261001-dev.md` の ① に「実装しました」を追記して同期する（手元にも同じファイル `design/hud-ds/requests/R-27-answer-20261001-dev.md` がある）。

## 2. 🔴 「芝の動きが停止・ぎこちない」— 原因の候補を 1 つ直して配備した・効果は未確認

- 道具（すべて読むだけで、本番に繋ぐ）:
  - `out/tmp/jank-local.mjs <url> <秒>`: 実時間で再生し、50ms を超えたコマを `__raceDiag.shot` と `__raceGround.d` 付きで記録する。
    - `GPU=1` で GPU を使って描く（Intel Iris Xe）。`CLICK=1` は dev の「演出開始」を押すが、dev は遅すぎて比べられなかった。
  - `out/tmp/jank-profile.mjs <from> <to>`: 表示時刻 d がその範囲にある間だけ CPU プロファイルを取る（`GPU=1` 可）。
  - `out/tmp/jank-trace.mjs`: Chrome のトレースを取る（画像の展開か描画かを見分ける）。
  - `out/tmp/jank-prod.mjs`: 最初の版。
  - `tools/lib/cdp.mjs` に `opts.extraArgs` を足した（コミット済み）。
- 修正前の実測（本番・GPU あり、`2a2dc62` の前）:
  - **start-gate-side**（d=31.2〜33.7・ゲートが開いてスタート）: 1 コマ 80〜270ms が続く。
  - **flyover**（d≈18〜19.6・コース上空を飛ぶ演出）: 1 コマ 130〜280ms が 9 コマ続く。
  - レースの本編（homestretch など）は、ほぼ滑らか。
  - 画像の展開（decode）は主因ではなかった（トレースで確認）。
  - CPU の内訳（ゲートの 3 秒・合計 2.7 秒）: `restore` 665ms のうち 530ms と、コースの位置の計算 `c` 約 530ms が、`world-textured.ts` の `strip()`（生垣・木立・スタンドを 0.35m 刻みの短冊で描く）から出ていた。
- 直したもの（`2a2dc62`・配備済み）:
  - 短冊ごとの save/transform/restore を、`setTransform`（元 × 短冊）に替えた。描く絵は数学的に同じ。
  - 捨てる短冊では上端の 2 点を計算しない。
  - `Ctx2D` に `getTransform?` / `setTransform?` を足した。
- 🔴 **修正後の測り直しは「悪く」出た**（ゲート 350〜700ms・イントロも全体に重い）。
  - ただし同時にサブエージェントが dev サーバーとヘッドレスの撮影を回していて、PC に負荷がかかっていた（修正と関係ないパドックなども一律に重くなっていた）。
  - → **条件を揃えて測り直す**。サブエージェントが止まり、dev サーバー（:3210）も止まっている状態で `GPU=1 node out/tmp/jank-local.mjs https://www.umamonogatari.com/race 140` を 2 回流す。修正前の数字（上）と比べる。
  - それでも重いなら `GPU=1 node out/tmp/jank-profile.mjs 31 34` で内訳を取り直す。
  - 本当に悪化していたら `2a2dc62` を戻すことも考える。
- そのほかの重い所（未着手）:
  - flyover は同じ `drawTexturedWorld` の `strip()` を使うので、同じ修正が効くはず（未確認）。
  - 馬の描画（`drawImage` 171ms・馬ごとの save/restore 135ms）。
  - パドックの歩き 8 コマが 1536×1024 の PNG 1.3MB × 8 = 10.4MB。本番は焼いた素材（bakedLibs）を使っておらず、`loadNativeSet('horse-jockey-side-walk-v1')` を通る。準備中の 8〜13 秒の長いコマの一因らしい（未確認）。
- 🔴 レビュー側の候補: タブが背面に回ると rAF が間引かれ、戻ったときに時間が飛ぶ（`document.visibilityState`・1 コマの dt に上限があるか）。まだ確かめていない。
- 簿に起票するよう、レビュー側から言われている（芝の停止とぎこちなさを別件として）。**まだ起票していない。**
- 「直した」と言わない。測れたのは「ゲートの場面の CPU の内訳」まで。オーナーの目で確かめてもらう（メモリ owner-eyes-decide-video）。

## 3. 経済 案 B（D-130）— 正典は改訂済み・コードは未着手

- レビュー側が正典に D-130 を起票し、§7.2 を改訂した（`d5c78a7`）。指示書は出ない。**正典の表が指示書**。
- 中身: 調教費を一律 0.6 倍。
  - 坂路 300→180・ウッド 300→180・プール 400→240・ゲート 200→120・併せ馬 500→300・追い切り 800→480・軽め 100→60・休養 0。
- やること:
  1. `menus.ts` の `epCost`（正典の写し）を表に合わせる。表とコードの一致を見る検査があれば、それも通す。
  2. 合格線: 付与された 1 頭が毎日の受け取り 2,000 EP だけで、設計の頻度で走り、毎週調教できる（余りが 0 以上・bronze の倍率 1.0）。
  3. gold（1.5×）で 1 頭が回るかを併記する。回らないなら「上の格は余裕のある人向け」と文書に書く。
  4. 2 頭は回らない。倍率を勝手に下げない（オーナーの判断）。
  5. `economy-balance.ts` で、変更前と変更後の純発行を並べて記録する（V-11 は未決）。
  6. 厩舎の格の倍率（D-103）はそのまま（V-14 を壊さない）。

## 4. V-4 / 本番を数える（約 8 日後・10-08〜10-10）

- レビュー側の判定 §11: 模型は作らない。門の後の本番を 2,000 本数えて待つ。それまで較正は触らない。
- 見積りは V-4 ≒ 29.8%（合格域 30〜34% に約 0.2pp 届かない見込み）。
  - 届かなかった場合の選択肢はオーナーへ: (i) 窓を広げる（CLASS_BAND・OVERSAMPLE_RATIO）(ii) 開放率の散らばりを広げる (iii) この値で行く。
- 流すコマンド: `npx tsx tools/count-v456-production.mjs --env production --since 2026-10-01T00:00:00+09:00`
  - ⑦ の誕生週の散らばり（位相 % 4）と最大の山（10% 未満なら ✔）で、簿の SEED-LOCKSTEP と POOL-CLIFF を同時に閉じる（until 10-10）。
  - staging での試し（10-01）: 現役 2,197 頭・誕生週 144 種類・最大の山 0.91%・崖なし。
- 簿 `UNLOCK-DAILY-WRONG-POPULATION` を起票済み。unlock_daily は門の前の母集団で数えているので、直すまで根拠に使わない。
- verify:open は SEED-LOCKSTEP の期限切れで落ちていたが、レビュー側が直した（`06cc5c7`）。

## 5. 今日終わったもの（参考）

- 投票の履歴 `/vote/history` と投票の控え `/vote/history/[betId]`（`4c47e8b`）。
  - 入口: /vote の「履歴」、マイページ、受付直後の「控えを見る」。
  - 状態の札: 結果待ち／確定・的中／確定／返還。取消の口は作っていない（D-123）。
- デザイナー R-27 回答（確認 5 問）を同期した。`_INDEX.md` で R-26 を完了にし、R-27 を足した。
  - 回答の 1 つ目: 控えの期間の一文は外した。消す決まりが無いので、書くと約束になるため。
- 簿 UNLOCK-DAILY-WRONG-POPULATION。数える道具の ⑦。

## 6. 止まっている順（レビュー側の推奨・§1〜§3 の後）

1. 名前の G2/G3 の便
2. エサ（D-127・§7.2 の 9 番目の献立。追加の行動にしない）
3. D-126 ⑥（「似たパラメータ」と再現の鞍の持ち方を 1 つの設計として）

## 7. 既知の落ちている検査

- `apps/cli/test/breed-year-scale.test.ts`: 前から落ちている。
- `packages/render/test/edit-grammar-audit.test.ts` ⑭ と `existing-shot-gate.test.ts` ⑫: 「撮影・測定が画面の変更より古い」。今日の race 画面の変更で期限が切れた。オーナーの端末で道具を流し直すもので、ここからは流さない。

## 7.5 レビュー側の引継ぎ（レビュー側もセッションを終えた）

- 次のレビュー側は `V:\dev\Cusor\game\Claude-Code-Game-Studios\STAR_REVIEW_HANDOVER.md` §15（commit 47fd312）を読んで続ける。
- レビュー側から引き継いだ約束:
  1. 10-09 前後に、count-v456-production を本番で 1 回流す（線は 28.5%・合格域 30〜34% は動かさない）。
  2. 待つ間、較正は触らない。
  3. D-130 は「§7.2 が正・epCost は写し」。純発行の前後を並べ、gold で 1 頭が回るかも併記する。
  4. 芝の件を簿に起票し、背面タブの間引き（1 コマの dt に上限があるか）から潰す。
  5. 止まっている順は §6 のとおり。
- オーナーに上げ残している問いは 3 つ（引継ぎ書 §15-9）:
  1. V-4 が 0.2pp 届かない場合の扱い
  2. **2 頭を回せるようにするか**（D-130 の 0.6 倍では 1 頭しか回らない。2 頭なら 1 回 100 EP 前後が要る）
  3. 芝の件

## 8. 注意（今日踏みかけたもの）

- 共有の作業ツリーなので `git add -A` / `stash` は使わない。ファイルを名指しする。
- dev サーバーと build を同時に回さない（`.next` を奪い合う）。メモリが少ないので、dev は使い終わったら止める。
- ヒアドキュメントでソースを書かない。Write / Edit を使う。Python の print は `PYTHONIOENCODING=utf-8`。
- レビュー側の宛先は `claude-code-game-studios-42`。
