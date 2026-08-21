/**
 * ★ツールの分類登録簿（正典 R-24）
 *
 * 【なぜ登録簿にするのか】
 *   最初、書き込み文を機械的に grep して分類しようとしました。**2回外しました**:
 *     1回目 `grep -P` が使えず**全ツールが「読取専用」**と出た（0件は抽出器を疑う）
 *     2回目 `migrate.mjs` を読取専用と判定した — **DDL は .sql 側**にあり、
 *           ツール本体の文字列しか見ていなかった
 *   ★**「何をするツールか」は、ソースの見た目からは決まりません。** 明示します。
 *
 * 【分類】★基準は「**DB の状態を変えるか**」です。ファイル出力の有無ではありません。
 *   readonly       … **DB を変えない**。本番に向けてよい（ファイルを書くものは含みうる）
 *   stateChanging  … 状態を変える。**本番に向けてはならない**（起動時に拒否する）
 *   productionOps  … 本番に向けることが目的の運用ツール。**理由を必ず書く**
 *
 * 【なぜ本番に向けてはならないのか（R-24 の由来）】
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わっていました。
 *   ★ガードが**正しく働くぶん確実に本番ワーカーが起動しなくなり**、しかも
 *     **次の再起動まで顕在化しない**ので、流した本人がその場で気づけません。
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。
 */

/** 読むだけ。本番に向けてよい */
export const READONLY = [
  // ★世界に置く看板（発馬機など）の実寸を確かめる。読むだけ
  //   2026-08-21: 発馬機が実物の 1.65 倍の高さで置かれ、**馬の頭が扉に隠れて脚しか見えない**状態を見逃していた
  'verify-world-billboards.mjs',
  // ★ゲート待機・開扉の瞬間を本番と同じ描画で静止画にする。読むだけ
  'shot-gate.mjs',
  // ★**実レース**の任意の秒数を本番と同じ描画で静止画にする。読むだけ
  //   `audit-broadcast-v2.mjs` は馬の位置が合成データなので、実際の団子具合が映らない
  'shot-race-at.mjs',
  // ★以下は計測用の使い捨て（`_` 始まり）。すべて読むだけ
  'verify-horse-motion.mjs',  // 馬を世界に固定しコマだけ送り、素材由来のぶれを切り分ける
  '_m4.mjs',          // 固定カメラの距離と画角（4角正面が小さすぎた件）
  'sweep-lane-reveal.mjs',    // 横の広がりの帯を掃引する（読むだけ）
  'verify-cut-timing.mjs',    // 台本の各カットが実際に何秒あるかを測る（読むだけ）
  'verify-stride-rate.mjs',   // 画面上で 1 秒に何完歩しているかを測る（読むだけ）
  'verify-v17-time.mjs',      // V-17（走破タイムの分布）を測る（読むだけ）
  '_v17probe.mjs',            // 1 レースずつ走破タイムを照合する（読むだけ）
  '_railprobe.mjs',           // 内ラチへのはみ出し頻度（読むだけ）
  '_railgeo.mjs',             // 馬の接地点とラチの画面上の並び（読むだけ）
  '_railside.mjs',            // カットごとにどちらのラチが手前か（読むだけ）
  '_nearrail.mjs',            // 手前のラチがコース上のどこで入れ替わるか（読むだけ）
  '_overlap.mjs',             // カットごとに馬どうしがどれだけ重なるか（読むだけ）
  '_orderjump.mjs',           // 表示上の順位が 1 コマでどれだけ入れ替わるか（読むだけ）
  '_skinmask.mjs',            // 肌の判定がどの画素を拾うかを色分けして見る（読むだけ）
  '_silksbleed.mjs',          // 勝負服の色替えがどこを塗るかを色分けして見る（読むだけ）
  '_paintedhist.mjs',         // 塗られる画素の色分布（肌が混ざっていないか・読むだけ）
  '_coatbake.mjs',            // 毛色の焼き込みを素材で確かめる（読むだけ）
  'verify-camera-continuity.mjs', // カメラがカットの中で跳んでいないか（読むだけ）
  '_cornermotion.mjs',        // カットごとの画面上の動きの滑らかさ（読むだけ）
  '_camjump.mjs',             // 固定カメラの注視点と画角の連続性（読むだけ）
  '_cuts.mjs',                // 切替が 重ねる／切る／閃光 のどれになるか（読むだけ）
  'slice-narrator.mjs',       // ナレーターのシートを 6 枚に切り、口だけ差し替える（読むだけ）
  '_pickgreen.mjs',           // 生成物 2 枚からクロマ緑のほうを選ぶ（読むだけ）
  '_stride.mjs',              // 送り速さと完歩数の対応を並べる（読むだけ）
  'verify-no-real-faces.mjs', // 人物立ち絵に写真が混ざっていないか（読むだけ）
  '_timefloor.mjs',   // 30 秒が実現できるかの下限計算
  '_timeopts.mjs',    // 30 秒にする案 A/B/C の比較
  '_camjitter.mjs',   // カメラが時間に対して滑らかかを測る
  '_filmstrip.mjs',   // 連続コマを先頭馬の周りだけ拡大して並べる
  '_motion.mjs',      // 録画から馬の上下位置のカクつきを測る
  '_shotsize.mjs',    // カットごとの馬の大きさ
  '_amounttest.mjs', '_edgeguard.mjs', '_presharpen.mjs', '_scaletest.mjs', '_sharpentest.mjs',
  '_strip.mjs', '_webpcost.mjs',
  // ★anon で何が読めるかの全数確認（§8.6 server_seed・§12.4 potential）。select のみ
  'verify-anon-exposure.mjs',
  'a3-converge.mjs',
  // ★読むだけ。ゲージ（余力）が正しい向きを向いているかを見る
  'diag-gauge.mjs',
  // ★読むだけ。映像に抜き差し（追い抜き・先頭交代）があるかを数える
  'diag-overtake.mjs',
  // ★読むだけ。展開の計算を消して、描画コマンドが変わるかを見る（R-16 を逆向きに）
  'diag-tenkai.mjs',
  // ★読むだけ。同じ出走表で乱数だけ変え、レースに不確定さがあるかを見る
  'diag-uncertainty.mjs',
  // ★読むだけ。画面に描かれた情報だけを見るボットで「読めるか」を測る
  'verify-readable.mjs',
  // ★読むだけ。V-16 の①②③④をまとめて判定する
  'verify-v16.mjs',
  // ★読むだけ。V-17（レースがレースに見えるか）を判定する
  'verify-v17.mjs',
  // ★読むだけ。V-18（枠順が結果を決めないこと・距離ロスは実在すること）
  'verify-v18.mjs',
  // ★読むだけ。オッズ計算時と確定時の出走馬を突き合わせて数字を並べる
  'diag-b6.mjs',
  // ★読むだけ。生成時と保存時のレース条件を突き合わせる
  'diag-conditions.mjs',
  // ★読むだけ。本番の馬をそのまま書き出してハーネスに食わせる
  'export-pool.mjs',
  // ★読むだけ。保存済みレースが番組表と一致し、馬場が good 固定でないかを見る
  'verify-conditions-db.mjs',
  // ★読むだけ。本番が作ったオッズと本番が出した着順で払戻率を測る
  'verify-v10-db.mjs',
  // ★読むだけ。道悪のレースで heavy_aptitude が着順に効いているかを見る
  'verify-heavy.mjs',
  // ★読むだけ。PP の発行と吸収を数える。本番の実データでないと意味がない
  'diag-v11.mjs',
  // ★DB に一切接続しない。受け渡しテキストから secrets.staging.env を作るだけ。
  //   ファイルは書くが DB の状態は変えないので、ガードの対象外。
  'import-staging-secrets.mjs',
  'a3-mscale.mjs',
  'a3-predict.mjs',
  'a3-seeds.mjs',
  'check-gate.mjs',
  'mc-sweep.mjs',
  'penalty-sweep.mjs',
  'preseed-distribution.mjs',
  'verify-ability.mjs',
  'verify-build.mjs',
  'verify-repo.mjs',
  'verify-views.mjs',
  'verify-world.mjs',
  // ★読むだけ。判定書の SHA が HEAD かを見る（R-23）
  'verify-acceptance-sha.mjs',
  // ★読むだけ（判定書の SHA を書き換えるが DB は変えない）
  'update-acceptance-sha.mjs',
  'deps-of.mjs',
  // ★走行 8 コマの生成を回す（Codex）。画像とプロンプトを書くだけで DB に触れません
  'gen-pose-set.mjs',
  // ★P4 のアセット系。**DB に一切接続しません**（画像を読み書きするだけ）
  //   分類の基準は「DB の状態を変えるか」なので、ファイルを書いても readonly です
  'bake-sprites.mjs',
  // ★読むだけ。自分で画面を見るための静止画
  'shot.mjs',
  // ★読むだけ。画面上の速さの変化を測る
  'diag-speed.mjs',
  // ★読むだけ。馬群の広がりが画面に収まるかを測る
  // ★読むだけ。距離ロスが着順に与える影響の大きさを見積もる（D-065 手順1）
  'diag-lane-impact.mjs',
  'diag-pack.mjs',
  // ★読むだけ。走破タイムの差がどの要素から来るかを切り分ける
  'diag-finish-spread.mjs',
  // ★読むだけ。シートの本当のコマ位置を数える
  'measure-sheet-blobs.mjs',
  'codex-imagegen.mjs',
  'make-gif.mjs',
  // ★読むだけ。ギャロップが走りとして成立しているかを測る
  'measure-gallop.mjs',
  // ★scene.js をそのまま実行して PNG にするだけ。DB にも台帳にも触れません
  'shot-scene.mjs',
  'diag-screen-overtake.mjs',
  'diag-cuts.mjs',
  // ★読むだけ。w による距離ロスの大きさを見積もる（D-065 の手順①）
  'diag-lane-loss.mjs',
  // ★読むだけ。ゲージの向きを測る（D-072・前回は符号が逆だった）
  'diag-gauge.mjs',
  // ★生アートから カットごとの元スプライトを焼く（契約 §5）。DB にも台帳にも触れません
  'bake-sprite-sizes.mjs',
  // ★斜め俯瞰でレースを動画にする。★絵を動かして自分の目で見るため。DB に触れません
  'render-oblique-video.mjs',
  // ★参考映像を読んで測るだけ。DB に触れません
  'measure-ref2d.mjs',
  // ★コース幾何を読んで数えるだけ（Q-P4-46 手順①）。DB に触れません
  'count-headings.mjs',
  // ★8 コマのシートを切り出し、同時に胴体基準で揃える。画像を読み書きするだけ
  'slice-pose-sheet.mjs',
  // ★走行 8 コマを胴体基準で揃え直す。画像を読み書きするだけ
  'align-pose-set.mjs',
  // ★走行 8 コマ（個別ファイル）の受け入れ判定。画像を読んで測るだけ
  'verify-pose-set.mjs',
  // ★画像を読んで測るだけ（駆歩シートの受け入れ判定）。DB に触れません
  'verify-gallop-sheet.mjs',
  // ★画像を読んで整列し直すだけ。DB に触れません
  'align-gallop-sheet.mjs',
  // ★画像を読んで枠色8行に焼くだけ。DB に触れません
  'bake-oblique-sheet.mjs',
  // ★透視投影の静止画を描くだけ。DB に触れません
  'shot-perspective.mjs',
  // ★読むだけ。斜め俯瞰の試作を静止画で確かめる
  'shot-oblique.mjs',
  // ★読むだけ。3カットを本番のエンジンで描いて大きさを決める
  'shot-cuts.mjs',
  // ★画像を読み書きするだけ。DB に触れません
  'bake-oblique.mjs',
  // ★動画をコマに切って幾何と時間を測るだけ。DB に触れません
  'measure-race-video.mjs',
  'measure-race-still.mjs',
  'measure-silk-budget.mjs',
  'measure-sprite-sheet.mjs',
  'pick-silk-palette.mjs',
  'render-field.mjs',
  'render-race.mjs',
  'world-search.mjs',
  // ★画像・監査成果物だけを読み書きし、DB状態には触れない
  'assemble-directional-frames.mjs',
  'audit-race-broadcast.mjs',
  'audit-race-scenarios.mjs',
  'clean-sprite-sheet-components.mjs',
  // ★Broadcast V2のPNG・測定JSONだけを出力する。DBには接続しない
  'audit-broadcast-v2.mjs',
  // ★画像ファイルのクロマ除去・分割だけを行い、DB状態には触れない
  'remove-chroma-key.mjs',
  'split-horizontal-frames.mjs',
  // ★合格済み背景プレートをループ多層パララックス素材（PNG＋manifest）へ分解するだけ。DBには接続しない
  'split-parallax-layers.mjs',
  // ★読むだけ。Broadcast V2 の動き（背景の流速・馬の大きさ・見た目速度）を全編で数値化する
  'audit-race-motion.mjs',
  // ★画像ファイルを WebP に変換して隣に置くだけ。DBには接続しない
  'build-art-webp.mjs',
];

/**
 * 状態を変える。★`assertNotProduction()` を必ず呼ぶこと。
 *   メタテストが、ここに載っているのに呼んでいないファイルを落とします。
 */
export const STATE_CHANGING = [
  // ★中で状態を変えるツールを流すので、これ自体も状態を変える
  'audit-tools.mjs',
  'fix-purse.mjs',
  // ★staging に発売中のレースを作る（検証ツールの前提を揃える）
  // ★同じレースを2通りの方法で投入して突き合わせる（後片付けあり）
  'diag-insert.mjs',
  'seed-races.mjs',
  // ★staging のレースを確定させる（時間を進める代わり）
  'settle-races.mjs',
  // ★週送りをワーカーの経路で実際に回す（全馬の状態を進める）
  'verify-training-week.mjs',
  // ★出走馬の凍結（0016）の検証。horses を一時的に壊してから確定するので状態を変える
  //   （壊した値は1頭ずつ元に戻し、戻せたことも検査する）
  'verify-entrant-freeze.mjs',
  // ★D-056 の検証。凍結を消してレースを中止させるので状態を変える（元に戻す）
  'verify-unfrozen-cancel.mjs',
  // ★開放率の日次記録（unlock_daily に書く）
  'verify-unlock-daily.mjs',
  // ★V-19 の DB 側（#5/#6/#10/#15）。auth ユーザーと identity 行を作って一意制約と RLS を叩く（後片付けあり）
  'verify-v19-db.mjs',
  // ★staging の馬を実際に育てる（誕生週をずらして週送りを回す）
  'age-horses.mjs',
  // ★合成集団で経済を一巡させる（V-11 の②）
  'verify-v11-synthetic.mjs',
  // ★実際に馬券を買って払戻の機械を検査する
  'verify-v10-bets.mjs',
  'seed-stables.mjs',
  'seed-world.mjs',
  'synthetic-bettor.mjs',
  'verify-a2.mjs',
  // ★B-1: 馬の育成状態を書き換え、horse_week_log を作る
  'verify-b1.mjs',
  // ★G-6: 検証用の口座と台帳を作り、馬の所有者を書き換える
  'verify-g6.mjs',
  'verify-a4.mjs',
  'verify-a5.mjs',
  'verify-a6.mjs',
  'verify-a7.mjs',
  'verify-cancel.mjs',
  'verify-db.mjs',
  'verify-economy.mjs',
  'verify-exchange.mjs',
  'verify-flow.mjs',
  'verify-overdue.mjs',
  'verify-prize.mjs',
];

/** 本番に向けることが目的のもの。★理由を必ず書く（空欄で登録できない） */
export const PRODUCTION_OPS = [
  {
    file: 'migrate.mjs',
    why: '★スキーマ移行そのもの。本番に適用できなければ意味がない。★機械的な検出では「読取専用」に見える（DDL は .sql 側にあり、ツール本体に SQL 文字列が無い）ので、ここに明示しないと静かに誤分類される',
  },
];

/** 全分類を平らにする（メタテスト用） */
export function allClassified() {
  return [...READONLY, ...STATE_CHANGING, ...PRODUCTION_OPS.map((x) => x.file)];
}
