# R-18: いまの実装が ★引き渡し資料どおりか ★ソースで照合してください（2026-09-27・開発側 → デザイナー）

> ★**オーナーの指示**（2026-09-27）: 「★まず今の状態で デザイナーのハンドオフ通りか？ ★GitHub の URL を渡して ★デザイナーにソースコードをチェックしてもらってください。★デザイナーが意図しているサイトの UI とは ★異なる場合があります。」

## 0. 先に伝えること（★決まったこと 2 つ・★次の便の前提）

1. 🔴 ★**常設レース表示の走る馬の絵は ★`horse-gallop.webp` ではなく ★`horse-jockey-side-v8-pose01〜08`（★本編・TOP と同じ 8 コマ）に決まりました**（★2026-09-27 オーナー決定）。
   ★`horse-gallop` は 09-17 に TOP の馬として試し、★オーナーが ★「絵柄が別系統」と差し戻した絵です。★`RACE_NOTICE_HANDOFF.md` §2 はその後に書かれていたので、★ここで読み替えています。
2. 🔴 ★**`RACE_NOTICE_HANDOFF.md` §4「★横にしたら 既存 /race の本編エンジンを起動」は ★段 B に回しました**（★レビュー側の裁定）。
   ★いまは ★段 A ＝ ★帯の走行（side-v8・同じ進行位置）を ★その場で全画面にします（★ページは移らない・入力は残る・無音・「録画・結果から再現」と明示）。
   ★理由: ★帯が流すのは ★たいてい自分の馬が出ていないレースで ★本編はまだ開けない／★本編は 19〜24MB で十数秒かかり ★45 秒の窓に間に合わない／★本編に「途中から始める」口が無い。

## 1. 見てほしいもの（★ソースと本番）

- ★**GitHub（公開）**: https://github.com/jinjinsansan/syar  （★ブランチ `main`・★コミット `bde33df747c3629949c5a41b612de45fe8444e0e`）
- ★**本番**: https://star-two-chi.vercel.app （★いま `bde33df` が出ています。★`/api/healthz` で確かめられます）
- ★照合してほしい資料: ★**`design_handoff_uma_monogatari`**（★README の §4.3 画面の地図・§5 全ページ共通の骨格）と ★**`RACE_NOTICE_HANDOFF.md`**（★常設レース表示）、★それと このプロジェクトのカード（`components/*`）

## 2. 画面とソースの対応（★どのファイルが何を描いているか）

★共通の部品: `apps/web/src/components/uma/uma-parts.tsx`（Backdrop・TopBar・BigButton・EpCapsule・NoticeBar）／`apps/web/src/components/uma/uma-theme.css`（トークン）

| 画面 | URL | ソース |
|---|---|---|
| TOP | `/` | `apps/web/src/components/uma/uma-top.tsx` |
| ダッシュボード | `/home` | `apps/web/src/app/home/page.tsx` |
| マイページ | `/mypage` | `apps/web/src/app/mypage/page.tsx` |
| 育成（調教） | `/train` | `apps/web/src/app/train/page.tsx` |
| 投票 | `/vote` | `apps/web/src/app/vote/page.tsx` |
| オッズ（1 レース） | `/odds/<id>` | `apps/web/src/components/uma/uma-odds-view.tsx` |
| 出走登録 | `/entry` | `apps/web/src/app/entry/page.tsx` |
| 記録 | `/records` | `apps/web/src/app/records/records-view.tsx` |
| 景品交換 | `/exchange` | `apps/web/src/app/exchange/page.tsx` |
| ポイントを貯める | `/earn` | `apps/web/src/app/earn/page.tsx` |
| 使い方 | `/howto` | `apps/web/src/app/howto/page.tsx` |
| レースを見る（案内） | `/watch-race` | `apps/web/src/app/watch-race/page.tsx` |
| レース（録画・本編） | `/race` | `apps/web/src/app/race/page.tsx`（★描画は `packages/render/src/`） |
| ログイン／登録／初回設定 | `/login` `/signup` `/setup` | `apps/web/src/app/{login,signup,setup}/page.tsx` |
| 配合・命名・最初の 1 頭・引退後の役割 | `/stable/breed` `/stable/name` `/stable/foal` `/stable/roles` | `apps/web/src/app/stable/{breed,name,foal,roles}/page.tsx` |
| 🔴 **旧い世代のまま**（★R-16 の対象） | `/stable` `/stable/<馬>` `/stable/retired` `/stable/market` `/training` `/races/<id>` | `apps/web/src/app/stable/**`・`apps/web/src/components/horse-resume.tsx`・`apps/web/src/app/races/[id]/page.tsx`（★枠は `apps/web/src/components/story-shell.tsx`） |

★**常設レース表示**（`RACE_NOTICE_HANDOFF.md`）:
- 部品: `apps/web/src/components/uma/race-strip.tsx`（★帯・大 150px・極小 22×16px・結果の強調・横向きの全画面）
- ★画面ごとの大きさの表: `apps/web/src/components/uma/race-strip-sizes.ts`（★§3 の表を写した正本）
- ★走行の位置: `apps/web/src/components/uma/race-replay.ts`・`race-camera.ts`

## 3. 開発側が ★資料から外した・★決めたこと（★知っていてほしい）

| # | 資料 | いまの実装 | 決めた人 |
|---|---|---|---|
| 1 | §2 走行の絵 `horse-gallop.webp` | ★side-v8 の 8 コマ | ★オーナー |
| 2 | §4 横にしたら本編エンジン | ★段 A（帯の走行を全画面） | ★レビュー側 |
| 3 | §2「大」の走行 | ★先頭を追う ★60m の窓（★1600m を 1 枚に収めると ★数馬身が 3px で ★全頭が塊になった） | ★開発側（★レビュー側 受理） |
| 4 | 設計案のマイページ見本「自分の馬が 2 着」 | ★**1 着** ＋ 馬番・馬名（★帯は誰の馬かを知らない。★自馬の表示は先の段） | ★開発側（★レビュー側 受理） |
| 5 | §3 に名前の無い画面 | ★判定基準で分けた（★一覧＝大: `/records` `/stable` `/stable/<馬>` `/stable/retired` `/watch-race` ／ ★フォーム＝極小: `/entry` `/stable/market` `/stable/breed` `/stable/name` `/stable/foal` `/stable/roles`） | ★開発側（★レビュー側 是認） |
| 6 | `/watch-race` の「レース演出を観る」 | ★未ログイン → デモ ／ ★ログイン済み＋レース中 → 帯の全画面 ／ ★レースの無い時間 → 「いま走っていません」＋次の発走 | ★レビュー側の暫定（★オーナー未回答） |
| 7 | レースの録画の画面（`/race`） | ★2026-09-27 に ★白・クリームの地から ★濃紺・金の枠に直した（★§5 の骨格・★新しい意匠は作っていない） | ★開発側 |

## 4. お願い

1. ★**画面ごとに ★「資料どおり」／「ずれている（どこが・どう直すか）」を**書いてください。★ソースの行を指してくれると ★そのまま直せます。
2. ★**§3 の 1〜7 のうち ★意図と違うもの**があれば ★教えてください。
3. ★**旧い世代の 6 画面（R-16）**は ★まだ作り直していません。★照合の対象というより ★R-16 のままです。
4. ★**意匠の判断が要る 3 つ**（★開発側では決めません）:
   - ★**芝の背景が無い画面**（★意匠が 4 世代 混ざっている: 芝＋紺／クリーム／紺ベタ／旧アーケード）を ★どれに寄せるか
   - ★**D-058 の整数倍**（★レースの絵を整数倍にすると端に余白が出る。★その余白を何で埋めるか）
   - ★`/stable` の「★馬を迎える」（★馬の売り買い）と「★新しい 1 頭を迎える」（★初回）の ★**語が近い**

★回答は ★このファイルの下に「A:」で、★または `requests/R-18-answer-<日付>.md` で置いてください。★次の同期で拾います。
