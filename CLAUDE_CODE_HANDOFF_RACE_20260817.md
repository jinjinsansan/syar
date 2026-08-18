# Claude Code 引継ぎ書 — 競馬レース演出の根本再設計

作成日: 2026-08-17  
対象リポジトリ: `V:\dev\Cusor\star`  
対象画面: `apps/web/src/app/race/page.tsx`

## 0. 最重要事項

ユーザーの最新評価は次の通り。

> 残念ながら全く変わっていません。

この評価を否定しないこと。自動テストや監査PNGが成功していても、ユーザーが開発サーバーで
見た画面が変わっていなければ、製品としては未反映である。

現在の最大の問題は、Broadcast V2を通常の `/race` へ置換せず、次のクエリ分岐だけに接続したこと。

```ts
const useBroadcastV2 = new URLSearchParams(window.location.search).get('renderer') === 'v2';
```

- 通常URL: `http://localhost:3100/race` → 旧 `drawFixed2DSideScene`
- V2 URL: `http://localhost:3100/race?renderer=v2` → 新 `drawBroadcastV2Scene`

ユーザーが通常URLを確認した場合、表示が変わらないのは当然である。
最初の作業はV2の画質調整ではなく、**どの描画分岐が実ブラウザで動いているかを証明すること**。

## 1. Claude Codeが最初に行うこと

1. 開発サーバーを完全に停止する。
2. `apps/web/.next` を安全に退避または削除し、Next.jsの古い生成物を除外する。
3. 開発サーバーを再起動する。
4. 画面左上に一時的な `BROADCAST V2 ACTIVE` バッジを出す。
5. 通常の `/race` でV2が実際に動くよう、クエリ分岐を反転または撤去する。
6. `/race` と `/race?renderer=v2` の両方を撮影し、どちらの分岐かを証明する。
7. ユーザーへURLを渡す前に、ブラウザコンソール、Network、Canvasの実表示を確認する。

旧版を比較用に残すなら、旧版側を明示的に `/race?renderer=legacy` とすること。
通常URLを旧版のままにしてはいけない。

## 2. ユーザーが求めている完成像

参考映像:

`V:\dev\Cusor\star\ダービースタリオン\ダービースタリオン2025の２D参考用.mp4`

ユーザーが求めているもの:

- 競馬場・レース名・距離・天候・馬場の高品質カットイン
- 馬が全頭ゲート内に収まっている
- ゲート開放から同じ馬が滑らかに飛び出す
- 発走直後は扇形ではなく密集した馬群
- 第1〜第4コーナー、向正面、最後の直線、ゴールのカメラ変化
- 芝、ラチ、背景、観客席がカメラと相対移動する
- 馬がその場で脚だけ動く状態にしない
- カット変更で別の隊列を再構成しない
- 影、芝片、接地感、速度感
- 実況者の顔付き実況帯
- ゴール直後に勝ち馬だけを追い、1着馬番・馬名・騎手・時計を表示
- 芝、背景、観客席、馬、騎手の現在の高品質画風は維持

## 3. ユーザーが明確に不合格としたもの

- 固定背景の前で馬だけが動く
- 馬群が固まりとして右へ流れるだけ
- 発走後に急に別の3頭カットへ変わる
- コーナーが存在しない
- カメラワークがない
- おもちゃ・昭和ゲームのようなゲートや発走
- 芝や背景が止まり、馬だけその場で動く
- 全馬完走まで勝ち馬追従が始まらない
- テスト上は成功でも、開発サーバーの見た目が変わっていない状態

## 4. 合格済みと評価された素材・要素

ユーザーが高く評価した基準画像:

- `apps/web/public/art/starting-gate-side-v1.png`
- `apps/web/public/art/race-backstretch-side-v1.png`
- `apps/web/public/art/race-corner-exit-side-v1.png`
- `apps/web/public/art/race-finish-side-v2.png`
- `apps/web/public/art/horse-jockey-side-v6-pose01.png` ～ `pose08.png`
- タイトルカットイン
- 芝、背景、観客席、馬、騎手の現在の画風

新たに生成した方向別素材:

- `horse-jockey-diag-front-v2-pose01..08.png`
- `horse-jockey-diag-rear-v2-pose01..08.png`
- `horse-jockey-high-diag-v2-pose01..08.png`
- `horse-jockey-winner-v1.png`
- `race-corner-rear-v2.png`
- `race-corner-high-v2.png`

これらは削除・低品質素材への差し替えをしないこと。ただし実画面で不自然なら、採用済みと決めつけず
ユーザーの目視を優先する。

## 5. Broadcast V2の実装場所

### ショット定義

`packages/render/src/broadcast-v2.ts`

- `broadcastV2ShotAt()`
- 発走、向正面、第3角、第4角、直線、ゴール、勝ち馬追従
- `broadcastV2RangeCenterMeters()` は全馬群の先頭・最後尾の中点を返す

### シーン解決と描画入口

`packages/render/src/broadcast-v2-scene.ts`

- `resolveBroadcastV2Scene()`
- `drawBroadcastV2Scene()`
- レースエンジン所有の `(s,w)` を変更しない
- 背景プレートと方向別フレームを選ぶ

### 透視投影

- `packages/render/src/course.ts`
- `packages/render/src/perspective.ts`
- `packages/render/src/perspective-draw.ts`

### Web接続

`apps/web/src/app/race/page.tsx` の `useBroadcastV2` 分岐付近。

ここに新旧両方の描画コードが混在している。V2を通常経路へ昇格させた後、旧固定2Dコードを
別ルートまたはlegacy分岐へ隔離すること。混在させたまま追加修正を続けない。

## 6. 重要な技術的問題

### 6.1 自動監査はブラウザ反映を保証しない

`tools/audit-broadcast-v2.mjs` は `@napi-rs/canvas` 上で共有描画関数を実行する。
次の値は成功している。

- timeline samples: 381
- transitions: 6
- anomalies: 0

出力:

- `out/broadcast-v2-audit/contact-sheet.png`
- `out/broadcast-v2-audit/timeline-metrics.json`

しかし、これはブラウザがV2分岐へ入った証明ではない。今回のユーザー評価により、この監査だけを
完成根拠にしてはいけないことが確定した。

### 6.2 背景プレートと馬の投影は完全には同じカメラではない

高品質背景は生成済みの2Dプレートで、馬はコース座標から透視投影している。
見た目上、コーナーのラチ方向と馬群軌道がずれる可能性がある。
ブラウザの実画像で位置合わせが必要。

### 6.3 背景移動は限定的

背景プレートは拡大クロップの `progress` で移動させているが、完全なワールド描画ではない。
ユーザーが再び「背景が止まっている」と感じる可能性が高い。
実表示を見て、複数レイヤーのパララックスまたは動画背景化を検討すること。

### 6.4 勝負服オーバーレイは画像領域推定

`silksOverlays()` は相対座標と色判定で勝負服・帽子・鞍布を着色する。
方向別素材ごとにマスクが正しいとは限らない。実ブラウザで全12頭を確認すること。

### 6.5 1600mコースの区間

現在の `ovalCourse(1600)` は発走、向正面、第3角、第4角、直線を主に返す。
1600mで必ず第1・第2コーナーが出るわけではない。
ユーザーが全4コーナー演出を求める場合、距離・コースレイアウト仕様を再確認すること。

## 7. ゲートとレース本編の境界

タイトルとゲートは `raceIntroAt()`、`drawRaceTitleCard()`、`drawStartingGate()`。
V2はイントロ終了後から始まる。

確認すべきこと:

- ゲート内の各馬と、V2開始時の各馬が同一に見えるか
- ゲート開放最終フレームとV2初回フレームの位置・縮尺・背景が飛ばないか
- `auditSec` だけでなく実時間再生で確認する
- 発走直後の馬群が扇形になっていないか

## 8. ゴール後演出

- 勝ち馬が決勝線を通過した時点で `winner-follow`
- `horse-jockey-winner-v1.png` を使用
- `drawWinnerLowerThird()` で1着馬番・馬名・騎手名・時計
- 表示時間は3.4秒
- 良芝の芝片強度は `0.07`

これもV2分岐へ入らなければユーザーには一切見えない。

## 9. 検証状況

- `npm run typecheck`: 成功
- 全体テスト実行時: 861件成功、ツール分類漏れ1件のみ失敗
- 分類漏れを `tools/lib/classification.mjs` へ登録後、`tool-guard.test.ts` 9件成功
- V2関連テスト成功
- `/race?renderer=v2` のHTTP応答は200

注意: HTTP 200はCanvasの表示成功を意味しない。

## 10. Git・作業ツリーの注意

作業ツリーは大量の変更・未追跡画像を含む。ユーザーの既存作業と今回の作業が混在している。

- `git reset --hard`、`git checkout --`、一括削除をしない
- 未追跡PNGを勝手に整理・削除しない
- 先に `git status --short` と差分を確認する
- コミットはユーザーから明示依頼があるまで行わない

## 11. 推奨する次の実装順

1. V2を通常 `/race` の既定描画へ変更する。
2. 画面上へ一時的なV2識別バッジを出す。
3. `.next` キャッシュを除外し、開発サーバーを再起動する。
4. 実ブラウザでタイトル→ゲート→発走→向正面→3角→4角→直線→ゴール→勝ち馬を通し確認。
5. 各区間をユーザーへ1枚ずつ見せ、合否を取る。
6. 背景停止、馬群軌道、勝負服マスク、ゼッケン、実況帯の重なりを修正。
7. ユーザーが合格するまで「100点」「完了」と言わない。
8. 合格後にlegacyコードと一時バッジを整理する。

## 12. 関連文書

- `docs/broadcast-v2-redesign-20260817.md`
- `docs/race-visual-review-feedback-20260817.md`
- `docs/race-reference-camera-parallax-spec-20260817.md`
- `docs/race-2d-quality-rebuild-plan.md`
- `RACE_REFERENCE_REPRODUCTION_PLAN.md`

## 13. 引継ぎ時の結論

V2用のコードと素材は存在するが、ユーザーの通常閲覧経路へ確実に反映できていない。
したがって現状は未完成であり、ユーザーの「全く変わっていない」という評価が正しい。

Claude Codeは内部監査値の改善から再開せず、**通常URLの実ブラウザ表示がV2へ入っていることの証明**から
再開すること。
