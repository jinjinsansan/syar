import { segmentStarts, type Course } from './course.js';
import type { ShotCameraPreset, ShotTarget, ShotView } from './shot-sequence.js';

export type BroadcastV2ShotId =
  | 'start-follow' | 'first-corner-front' | 'second-corner-high'
  | 'backstretch-side' | 'third-corner-rear' | 'fourth-corner-high' | 'fourth-corner-front'
  | 'homestretch-side' | 'finish-line' | 'winner-follow'
  // ★中継台本 v3（アーケード参考映像に合わせた追加ショット）
  | 'side-low' | 'side-close' | 'aerial' | 'side-drive' | 'fourth-corner-wide' | 'front-close'
  | 'start-front' | 'winner-follow-rear'
  // ★直線の正面固定（差してくる馬を奥行きで見せる）
  | 'homestretch-front';

export type BroadcastV2HorseAssetRole = 'side-v6' | 'diag-front-v2' | 'diag-rear-v2' | 'high-diag-v2' | 'winner-v1';

export interface BroadcastV2Shot {
  readonly id: BroadcastV2ShotId;
  readonly view: ShotView;
  readonly target: ShotTarget;
  readonly horseAsset: BroadcastV2HorseAssetRole;
  readonly transitionSec: number;
  readonly camera: ShotCameraPreset;
  /** 馬群が画面に収まらないとき、先頭を画面幅のどこに置くか（0〜1・進行方向側が 1）。既定 0.78 */
  readonly leadFraction?: number;
  /**
   * ★固定カメラ（実際の競馬中継の 4 角: 直線入口の外側から、奥からこちらへ向かってくる馬群を見る）。
   *   現在の区間の終点から `sFromSegmentEnd` 先・内ラチから `w` の位置・高さ `upM` にカメラを置き、注視点だけ追う。
   */
  readonly fixedCamera?: { readonly sFromSegmentEnd: number; readonly w: number; readonly upM: number };
  /**
   * ★**争っている馬を画面に収める**（2026-08-22・オーナー指摘）
   *
   * 【何が起きていたか】
   *   参考に合わせて直線の寄りを 53% にした結果、★**画面に 1〜2 頭しか入らなくなりました。**
   *   ところがエンジンは**差し・追い込みを出しています**（60 レースの実測: 残り 400m で
   *   4 番手以下だった馬が勝つのが **35%**、先頭のまま押し切るのは 43%）。
   *   デモのシード 42 も、勝ち馬 10 番は**追い込み**で、残り 400m は **3 番手・8.1m 差**。
   *   ★**その差し切りが、全部画面の外で起きていました。**
   *   オーナー評「最後の直線で最後 2 頭が走って、ただ前の馬が勝つだけ」。
   *
   * 【どうするか】
   *   画角を**馬群の広がりに合わせて動かします。** 固まっていれば寄り（＝参考と同じ 53%）、
   *   ばらけていれば引いて、争っている馬を全部入れる。
   *   ★実際の中継のカメラマンがやっていることで、参考の 104s が寄りで成立しているのも
   *     **その瞬間に馬群が固まっているから**です。
   *
   * ⚠️ 着順にも位置にも触れません。**画角だけ**です（憲法 3）。
   */
  readonly frameContenders?: {
    /** 先頭からこの距離までを「争っている馬」とみなす（m） */
    readonly withinM: number;
    /** いちばん寄れる画角（＝`camera.fovDeg`）と、いちばん引ける画角 */
    readonly maxFovDeg: number;
  };
}

/**
 * ★横追従は**望遠**で撮る（参考映像 6〜25 秒: 馬＋騎手の高さが画面高の 30〜34%）。
 *   旧 backM 29 / fov 30° では馬が画面高の 16%（116px）で、背景の画質に対して馬だけ粗く小さく見えた。
 *   望遠（fov 12°・44m）にすると px/m ≈ 77 → 馬 ≈ 190px（26%）で、前列と後列の大きさの差は 1.3 倍以内に収まる。
 *   （寄りのカメラで同じ大きさにすると前列/後列が 3 倍違い、参考の「3〜12%」から外れる）
 */
const SIDE_TELE: ShotCameraPreset = { backM: 44, upM: 6, sideM: 9, fovDeg: 12 };
/** ★台本 v3 の横追従: 低く・望遠を強め（馬 ≈35%・アーケード参考映像の 40% に寄せる） */
/**
 * ★勝負所の横追従（`side-drive` 専用）。
 *   fov 9° のとき馬が画面の **35.3%** になり、**胴体が画面端で切れて 6/12 頭しか写りません**でした。
 *   合格の `finish-line`（25.2%）に合わせて 12.2° に。★`SIDE_TELE` は合格済みなので触らないこと。
 */
/**
 * ★寄りの真横（2026-08-22 に 12.2° → 7.6°）
 *
 * 【なぜ変えたか — 参考映像との実測差】
 *   参考（アーケード実機）の真横の寄りは**馬体が画面高の 43〜55%**です（62s / 104s）。
 *   我々は全カットが **21.6〜27.4%** に固まっていました。
 *   ★問題は「一律に小さい」ことではなく、**大きさの幅が無い**ことでした。
 *     参考は 10%（内馬場からの引き 67s/85s）〜55%（直線の寄り 104s）を行き来します。
 *   → 寄りのカットだけを寄せ、引きのカットは第 2 波（世界に物を入れてから）に回します。
 *
 * ⚠️ 画角を狭めると**画面に入る走路の幅**も狭まります。7.6° / 距離 44.9m で
 *    横 11.2m ≒ 馬 4.7 頭分。参考 104s の見え方と同程度です。
 */
const SIDE_LOW: ShotCameraPreset = { backM: 44, upM: 3.5, sideM: 9, fovDeg: 7.6 };
const SIDE_CLOSE: ShotCameraPreset = { backM: 44, upM: 3.2, sideM: 9, fovDeg: 7.5 };

/**
 * ★直線の寄り（参考映像 90〜110s の役割・馬体が画面高の **55%**）
 *
 *   参考は 1 本のレースの中で **10%（内馬場からの引き 67s/85s）〜 55%（直線の寄り 104s）**を
 *   行き来します。我々は全カットが 21.6〜27.4% に固まっていました。
 *   ★足りないのは「大きさ」ではなく「**大きさの幅**」です。
 *
 *   実測（`tools/shot-race-at.mjs`）で 7.6° → 41.3% だったので、
 *   55% には 7.6 × 41.3/55 ≒ **5.7°**。距離 45.0m での視野は縦 4.48m / 横 7.97m
 *   ＝ 走路方向に馬 3.3 頭分。参考 104s（3 頭が読める）と同程度です。
 *
 * ⚠️ ★`leadFraction` を既定の 0.78 のままにすると、先頭の前に 1.75m しか残らず
 *    **半身（1.2m）ぎりぎり**です。0.66 にして前を 2.7m 空けています。
 */
const SIDE_HOMESTRETCH: ShotCameraPreset = { backM: 44, upM: 3.5, sideM: 9, fovDeg: 5.7 };

/**
 * ★カットごとの「馬の大きさ」を揃えました（2026-08-21）
 *
 *   実レース（合成でなく `resolveRace` → 位置モデル → 透視投影）で測ると、
 *   馬の描画高さはカットごとに **140px〜254px（1.8 倍）** も跳ねていました。
 *   ★オーナー評「**カットが切り替わると一気にクオリティが下がる**」の正体はこれです。
 *   絵が悪いのではなく、**同じ絵を毎カット別の倍率で拡大縮小**していました。
 *
 *   基準は**オーナーが合格と言った 2 つ**:
 *     `finish-line`  馬の高さ 181px＝画面の **25.2%**
 *     `start-front`  同 203px＝**28.3%**（ゲート〜8.8 秒。合格）
 *   その間の **26%** に寄せています。★画角だけを変え、カメラの位置は動かしていません
 *   （＝画の性格は変えない）。
 *
 *   ⚠️ 「全頭を画面に入れる」ことは**狙っていません**。隊列は数十 m に伸びるので、
 *      寄りのカットで 12 頭全部を入れると馬が豆粒になります。`target: 'pack'` は
 *      先頭付近を追う指定で、後方が画面外に出るのは意図どおりです。
 *      ★ただし**大きすぎて胴体が画面端で切れる**のは別の話で、上の調整で一緒に収まります。
 *
 *   計測: `npx tsx tools/shot-race-at.mjs --from 9 --to 33 --step 3`
 */
const SHOTS: Readonly<Record<BroadcastV2ShotId, BroadcastV2Shot>> = {
  'start-follow': {
    id: 'start-follow', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35,
    // ★実際のカメラは `broadcastV2StartCamera`（発馬機の絵に合わせた構図 → 望遠横追従へ連続移行）
    camera: SIDE_TELE,
  },
  'first-corner-front': {
    id: 'first-corner-front', view: 'diag-front', target: 'pack', horseAsset: 'diag-front-v2', transitionSec: 0.4,
    camera: { backM: 25, upM: 8.5, sideM: 10, fovDeg: 18.9 },
  },
  'second-corner-high': {
    id: 'second-corner-high', view: 'high-diag', target: 'pack', horseAsset: 'high-diag-v2', transitionSec: 0.4,
    camera: { backM: 31, upM: 15, sideM: 12, fovDeg: 18.5 },
  },
  'backstretch-side': {
    id: 'backstretch-side', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35,
    camera: SIDE_TELE,
  },
  'third-corner-rear': {
    id: 'third-corner-rear', view: 'diag-rear', target: 'pack', horseAsset: 'diag-rear-v2', transitionSec: 0.4,
    // ★透視ワールド用: 地平線（遠景の帯）が画面上部 ≈15% に入る高さ・画角
    // 地平線が画面の約 25% に来る（遠景のスタンド・樹木が見える）
    camera: { backM: 44, upM: 5.5, sideM: 10, fovDeg: 15.8 },
  },
  'fourth-corner-high': {
    id: 'fourth-corner-high', view: 'high-diag', target: 'pack', horseAsset: 'high-diag-v2', transitionSec: 0.4,
    // 地平線が画面の約 20% に来る
    camera: { backM: 40, upM: 6.5, sideM: 13, fovDeg: 15.0 },
  },
  'fourth-corner-front': {
    id: 'fourth-corner-front', view: 'diag-front', target: 'pack', horseAsset: 'diag-front-v2', transitionSec: 0.4,
    // ★実際の競馬中継の 4 角: 直線入口の外側・高さ 9m の固定カメラ。馬群が奥から手前へ向かってくる
    // fovDeg は上限（距離に応じて自動ズーム: `broadcastV2FixedFov`）
    camera: { backM: 42, upM: 7, sideM: 12, fovDeg: 13.6 },
    fixedCamera: { sFromSegmentEnd: 30, w: 27, upM: 7 },
  },
  /**
   * ★**直線の正面固定カメラ**（2026-08-22・オーナー指摘「差してくるのが見えない」）
   *
   * 【なぜ要るか — 実測で分かったこと】
   *   参考（`out/judge/ref-race2.png` 98s を拡大）は、直線を**横 1 カットで見せ続け**、
   *   ★**8 頭以上が 2〜3 馬身（5〜7m）の中に密集**しています。だから 1 つの画に全部入り、
   *   その中で馬が前へ出ていくのが見えます。
   *
   *   ⚠️ ★**我々の隊列はそこまで詰まりません。** 実測（24 レース・中央値）:
   *        ゴール前で上位 8 頭が **27.7m（11.5 馬身）** ← 参考の **4〜5 倍**
   *      横から撮るかぎり、**寄れば差し馬が画面外／入れれば豆粒**の二択にしかなりません。
   *
   * 【★正面から撮ると解ける】
   *   正面（奥から手前へ来る画）なら、**走路方向の広がりが「奥行き」になります。**
   *   20m 後ろの馬は**小さく奥に**写るだけで、画面からは出ません。
   *   ★差してくる馬が、奥から手前へ、他馬の間を縫って上がってくるのがそのまま見えます。
   *   参考も 90〜92s は正面寄りの画です。
   *
   *   カメラは決勝線の少し先・外側に据え、注視点（馬群）だけを追います。
   */
  'homestretch-front': {
    /**
     * ★**追従**の正面カメラです（固定ではありません）。
     *
     * ⚠️ ★最初は決勝線に据えた**固定**カメラにしました。**逆効果でした。**
     *    カメラまで 400m あるので画角が 1.4° まで狭まり、
     *    ★**奥行きが完全に潰れて、11 頭が横一列の切り抜きに見えます**（実測 21 秒）。
     *    「差してくる」は**奥行きの手掛かり**で成立するので、潰したら消えます。
     *    ⚠️ 奥行きの潰れは**距離**で決まります。遠くから望遠で狙う限り直りません。
     *
     * → 馬群の**少し前**を走る追従カメラにします（34m）。
     *   20m 後ろの馬は 54m 先になるので **6 割の大きさ**で写り、
     *   前に出てくるほど**大きくなりながら上がって**きます。それが差し脚の見え方です。
     */
    id: 'homestretch-front', view: 'diag-front', target: 'pack', horseAsset: 'diag-front-v2', transitionSec: 0.4,
    camera: { backM: 32, upM: 5.5, sideM: 9, fovDeg: 18.5 },
    leadFraction: 0.60,
  },
  'homestretch-side': {
    id: 'homestretch-side', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35,
    // ★直線の寄り（参考 104s と同じ役割）。SIDE_TELE 12° では 25.1% しかなかった
    camera: SIDE_HOMESTRETCH,
    leadFraction: 0.66,
    // ★勝負どころ。差してくる馬を画面に入れる（固まれば 5.7° まで寄る）
    frameContenders: { withinM: 12, maxFovDeg: 13 },
  },
  'finish-line': {
    id: 'finish-line', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.3,
    // ★実際のカメラは展開で決まる（`broadcastV2FinishCamera`）: 接戦は引いて全員、単独は寄る。ここは既定値
    camera: SIDE_TELE,
    leadFraction: 0.78,
  },
  'start-front': {
    // ★発走（アーケード参考映像 39〜49s）: 正面の発馬機 → 斜め前から馬群がこちらへ飛び出す。待機中は注視点をゲート付近に固定
    id: 'start-front', view: 'diag-front', target: 'pack', horseAsset: 'diag-front-v2', transitionSec: 0.35,
    camera: { backM: 24, upM: 2.4, sideM: 5, fovDeg: 25.6 },
  },
  'side-low': {
    id: 'side-low', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35, camera: SIDE_LOW,
  },
  'side-close': {
    id: 'side-close', view: 'side', target: 'contenders', horseAsset: 'side-v6', transitionSec: 0.35, camera: SIDE_CLOSE,
  },
  'aerial': {
    // ★高い空撮（向正面〜3角）: 馬群全体とコース形状
    id: 'aerial', view: 'high-diag', target: 'pack', horseAsset: 'high-diag-v2', transitionSec: 0.4,
    /**
     * ★空撮は**カメラの位置を動かしません**（2026-08-21）。他のカットと同じく**画角だけ**を
     *   合わせ、馬を 19.5% → 24% にしています。
     *
     *   ⚠️ ★このカットには**別の問題が残っています（未解決）**。画面が緑一色に見えます。
     *
     *     ★原因は `world-textured.ts` ではありませんでした（2026-08-21 に測り直し）。
     *       カメラまで **64m**・画角 **11.1°** なので、**画面に入る地面はわずか 12.4m**。
     *       走路の幅が 20m なので、★**画面には走路しか入りません。**
     *       内馬場・ラチ・スタンドは**画角の外**にあり、描画側は正しく仕事をしています。
     *       `world-textured.ts` には内外を暗くし走路を明るくする処理が既にありますが、
     *       **走路しか映っていないので効きようがありません。**
     *
     *     ★つまり「空撮」と呼びながら、実際には**上からの望遠**です。
     *       本物の空撮にするには画角 40° 程度が要りますが、そのとき**馬は画面の 5%**になり、
     *       「カットごとに大きさを揃える（26%）」と真っ向からぶつかります。
     *       ★**引きの画にするのか、寄りのままにするのか**は演出の判断なので、
     *         勝手に決めません。オーナーに諮ること。
     *
     *     ★同じ理屈が `second-corner-high` / `fourth-corner-wide` / `fourth-corner-front` にも当たります。
     *     ★横位置の広がり（`LANE_REVEAL_FULL_RUN`）を入れると 12 頭が 8m に散るので、
     *       この画の見え方自体が変わります。**背景の作業はそのあとで評価すること。**
     */
    camera: { backM: 58, upM: 27, sideM: 19, fovDeg: 11.1 },
  },
  'side-drive': {
    id: 'side-drive', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35, camera: SIDE_LOW,
    // ★道中〜勝負所。隊列が伸びたら引いて、詰まったら寄る
    frameContenders: { withinM: 11, maxFovDeg: 13 },
  },
  'fourth-corner-wide': {
    // ★4 角をラチのカーブごと広く（後方・高め）
    id: 'fourth-corner-wide', view: 'high-diag', target: 'pack', horseAsset: 'high-diag-v2', transitionSec: 0.4,
    camera: { backM: 40, upM: 14, sideM: 13, fovDeg: 18.8 },
  },
  'front-close': {
    // ★先頭争いを斜め前・寄りで（先頭の少し前・外側・低い、追従）
    id: 'front-close', view: 'diag-front', target: 'contenders', horseAsset: 'diag-front-v2', transitionSec: 0.35,
    // ★参考 94s に相当。20° では 27.4%。中間の大きさを担う
    camera: { backM: 18, upM: 2.6, sideM: 5, fovDeg: 16 },
  },
  'winner-follow-rear': {
    // ★勝馬（アーケード参考映像 114〜123s）: 後方〜横の寄り、騎手が立ってガッツポーズ
    id: 'winner-follow-rear', view: 'diag-rear', target: 'winner', horseAsset: 'winner-v1', transitionSec: 0.4,
    camera: { backM: 20, upM: 3.6, sideM: 5, fovDeg: 22 },
  },
  'winner-follow': {
    id: 'winner-follow', view: 'side', target: 'winner', horseAsset: 'winner-v1', transitionSec: 0.4,
    // 勝馬は一回り寄る（画面高の約 35%）
    camera: { backM: 34, upM: 5, sideM: 7, fovDeg: 12 },
  },
};

/**
 * ★**中継の見た目を決める定数は、ここ 1 か所に置きます。**
 *
 * ⚠️ ★これらは画面（`apps/web`）と監査道具（`tools/`）の**両方**が読みます。
 *    2 か所に書くと必ず離れ、**オーナーと別の画を測る**ことになります
 *    （R-30。この案件で 3 回起きています）。
 */

/**
 * ★1 完歩の距離（m）。脚のコマ送りの周期。
 *   実馬は 1 完歩 ≈7m（16m/s で 2.3 完歩/秒）。
 */
export const BROADCAST_STRIDE_M = 7;

/**
 * ★被写体ブラーの露光時間（秒・設計 1-2）
 *
 * 【★1/60 → 1/200 に下げました（2026-08-22・オーナー指摘）】
 *   オーナー評「**馬が何重もの線になっている**」「最初から最後まで全て多重」。
 *
 *   拡大して確かめたところ、★**段差（コマ落ち）は出ていませんでした。**
 *   純粋に**量が過大**で、隣り合う馬の尾が互いに重なり、
 *   ★**4 頭が溶けて 1 つの茶色い塊**になっていました
 *   （`out/judge/decide/compare-blur.png` に 5 段階を並べてあります）。
 *
 *   ⚠️ ★**参考をそのまま真似たのが間違いでした。** 参考は実機の CRT をスマホで撮った映像で、
 *      元から像が甘い。我々の素材は**書き込まれた絵**で、オーナーはその**鮮明さ**を見て
 *      8/21 に「合格」と判定しています。同じ量のブラーを掛けると、
 *      **合格した品質そのものを壊します。**
 *
 *   → 尾は**脚と尾髪に出る程度**に留めます。実測（`side-drive`・117px/m）:
 *        1/60  → 29.7px  馬体が溶ける（不合格）
 *        1/120 → 14.8px  馬体が甘くなり始める
 *        **1/200 →  8.9px  脚と尾が流れ、馬体と勝負服は読める** ←採用
 *        1/320 →  5.6px  速さの手掛かりがやや弱い
 *
 *   ★カットごとに手で決めません。**px/m に比例**するので、寄れば伸び、引けば縮みます。
 */
export const MOTION_BLUR_EXPOSURE_SEC = 1 / 200;

/**
 * ★**被写体ブラーは既定で切っています**（2026-08-22・オーナー判定）
 *
 * 【なぜ切ったか】
 *   1/60 → 1/200 に下げてもオーナー評は「**馬、騎手が滲んで見える**」でした。
 *   ★決め手は「**最後（ゴール後の勝馬）だけ正常**」という指摘です。
 *     勝馬追従は速度 0 でブラーが切れるので、★**ブラーが無い状態こそが求める画**でした。
 *
 * 【なぜ我々の絵とは相性が悪いのか — 寸法で説明できます】
 *   ブラーは**馬体の長さ**ではなく**細部の大きさ**と比べなければいけません。
 *     馬 297px のとき  騎手の顔 ≒ 30px ／ 鞍の馬番 ≒ 24px
 *   1/200 でも尾は **8.9px**。顔の 1/3、馬番の 1/3 に相当し、**顔と番号が潰れます**。
 *   細部を残すには 2〜3px 以下（1/600 相当）が要り、そこまで下げると**ほぼ見えません**。
 *
 *   ★参考が強いブラーで成立するのは、**実機の CRT をスマホで撮った映像で元から像が甘い**からです。
 *     我々の素材は書き込まれた絵で、オーナーはその**鮮明さ**を見て 8/21 に合格を出しています。
 *     ★**参考の「見た目」を写すことが、参考の「良さ」を写すことにならない**例でした。
 *
 * ⚠️ 機構は消していません（R-15: 入っているが使われない状態で残す）。
 *    比べたくなったら `tools/shot-race-at.mjs --exposure 200` で出せます。
 */
export const MOTION_BLUR_ENABLED = false;

/**
 * ★被写体ブラーの標本数の**上限**（費用の頭打ち）。
 *   実際の枚数は尾の長さ ÷ `MOTION_BLUR_STEP_PX` で決まるので、引いたカットでは自動的に減ります。
 *   ★上限に当たると間隔が目標より広がり、格子が出ます。**当てないための値**です。
 *
 *   露光 1/200 秒での実測: いちばん寄る `homestretch-side`（154px/m）で尾 **12.3px ＝ 14 枚**。
 *   余裕を残して 24 にしています（露光を戻して試すときも当たらない）。
 */
export const MOTION_BLUR_SAMPLES = 24;

/**
 * ★コーナー専用カット（斜め前・俯瞰・斜め後方）はコーナー**冒頭のこの距離だけ**入れる。
 *   コーナー用の背景は 1 枚絵で、馬の速さで流せない（横構図のようにループ層へ分解できない）。
 *   3 秒程度のカットならパン＋ズームで持つが、14〜20 秒の静止背景は「その場走り」になる（ユーザー指摘）。
 *   残りは横追従（パララックス）に戻し、区間名は HUD が示す。
 */
export const CORNER_CUT_M = 70;

function segmentAtWithStart(course: Course, meters: number): { readonly label: string; readonly start: number } {
  let found = { label: '', start: 0 };
  for (const boundary of segmentStarts(course)) {
    if (boundary.s <= meters) found = { label: boundary.label, start: boundary.s };
  }
  return found;
}

/** コーナー専用カットの進行率（0→1）。カット外は 0 */
export function broadcastV2CutProgress(course: Course, leaderMeters: number, cornerCutM = CORNER_CUT_M): number {
  if (cornerCutM <= 0) return 0;
  const seg = segmentAtWithStart(course, Math.max(0, leaderMeters));
  if (!seg.label.includes('角')) return 0;
  return Math.max(0, Math.min(1, (leaderMeters - seg.start) / cornerCutM));
}

/**
 * @param cornerCutM コーナー専用カットの長さ（m）。0 でカット無し（コーナーも横追従のまま）。
 *   ★方向別 8 コマ（後方・俯瞰）が承認水準に達するまで、Web は 0 で運用する（ユーザー指摘③④）。
 */
/** 現在の区間の始点と終点（m） */
export function broadcastV2SegmentSpan(course: Course, meters: number): { readonly start: number; readonly end: number; readonly label: string } {
  let start = 0, end = course.distance, label = '';
  const starts = segmentStarts(course);
  for (let i = 0; i < starts.length; i += 1) {
    const b = starts[i]!;
    if (b.s <= meters) { start = b.s; label = b.label; end = starts[i + 1]?.s ?? course.distance; }
  }
  return { start, end, label };
}

/**
 * ★中継台本 v3（アーケード参考映像 `docs/race-broadcast-script-reference-20260818.md` §3）。
 *   レース距離に対する先頭の位置の比で区間を割り当てる（1600m での目安を括弧に）。
 *   閃光トランジションは 3角斜め後方 → 勝負所サイドの切替（`broadcastV2FlashAt`）。
 */
/**
 * ★台本の種類。通常 `/race` の既定は `v5`。
 *   `v2` は区間ベースの旧台本（表を持たない分岐）。
 *
 * ⚠️ ★**この下の関数群の既定引数は `v4` のままにしてあります。**
 *    `script` を渡していない既存の測定ツール・テストが数多くあり、
 *    そこまで巻き込むと今回の指示の範囲を超えるためです。
 *    画面の既定は `broadcastV2ScriptFromSearch` が決めます。
 */
export type BroadcastV2Script = 'v2' | 'v3' | 'v4' | 'v5';

/** ★通常 `/race` の既定台本 */
export const DEFAULT_RACE_SCRIPT: BroadcastV2Script = 'v5';
/** ★旧台本へ戻すときの値（`/race?cinematography=v4`） */
export const LEGACY_RACE_SCRIPT: BroadcastV2Script = 'v4';

/**
 * ★**URL から台本を決める。**
 *
 *   - 指定なし  … `v5`（既定）
 *   - `v5`      … `v5`
 *   - `v4`      … 旧 v4（比較・即時切り戻し用）
 *   - 不正値    … `v5`（既定へ戻す）
 *
 * ⚠️ ★**URL だけで決まります。** localStorage・時刻・乱数では切り替えません（憲法4）。
 */
export function broadcastV2ScriptFromSearch(search: string): BroadcastV2Script {
  const v = new URLSearchParams(search).get('cinematography');
  if (v === LEGACY_RACE_SCRIPT) return LEGACY_RACE_SCRIPT;
  return DEFAULT_RACE_SCRIPT;
}

/** ★台本 → ショット表。`v2` は表を持たないので v4 で代用（呼び出し側が使わない） */
function scriptRowsOf(script: BroadcastV2Script): readonly { readonly until: number; readonly id: BroadcastV2ShotId }[] {
  if (script === 'v5') return SCRIPT_V5;
  if (script === 'v3') return SCRIPT_V3;
  return SCRIPT_V4;
}

export const SCRIPT_V3: readonly { readonly until: number; readonly id: BroadcastV2ShotId }[] = [
  { until: 0.0375, id: 'start-front' },         // 〜60m   発走（正面の発馬機 → 斜め前で飛び出す）
  /**
   * ★序盤を真横から撮らない（2026-08-21）
   *
   *   エンジンの `laneAt` は「発走後、どの馬もラチ（w=2.2）を取りにいく」設計で、
   *   **実測すると 残り1350m で 12 頭の横の広がりが 0.85m しかなく、8 頭が同じ横位置に重なります。**
   *   真横から撮ると、同じ大きさの切り抜きが完全に重なり、
   *   ★オーナー評「**競艇のボートみたいな姿**」＝馬の前半分が並んだ帯にしか見えません。
   *
   *   ゴール前が合格なのは、そこでは**横に 11.9m 散っている**からです（同じ素材・同じ真横）。
   *
   *   → **団子の時間帯は斜めから撮る。** 奥行きで前後が分かれ、1 頭ずつが読めます。
   *     `w` はレースの結果の一部（D-065 / D-071）なので**描画側では広げられません**。
   *     広げるならエンジン側の裁定が要ります（未照会）。
   *
   *   ★真横の担当は、隊列が散る後半（`side-drive` 900m / `homestretch-side` 1300m /
   *     `finish-line` 1600m）に残しています。カメラの種類は減らしていません
   *     — v3 で未使用だった 2 つを序盤に起用しています。
   */
  { until: 0.1625, id: 'first-corner-front' },  // 〜260m  斜め前（旧: 低いサイド追従）
  { until: 0.2625, id: 'second-corner-high' },  // 〜420m  斜め上（旧: 寄りサイド）
  { until: 0.375, id: 'aerial' },               // 〜600m  空撮
  { until: 0.4875, id: 'third-corner-rear' },   // 〜780m  3角 斜め後方
  { until: 0.5625, id: 'side-drive' },          // 〜900m  勝負所サイド（閃光で入る）
  { until: 0.625, id: 'fourth-corner-wide' },   // 〜1000m 4角 俯瞰ワイド
  { until: 0.70, id: 'fourth-corner-front' },   // 〜1120m 直線入口 正面固定
  { until: 0.8125, id: 'homestretch-side' },    // 〜1300m 直線サイド
  { until: 0.925, id: 'front-close' },          // 〜1480m 先頭争い 斜め前寄り
  { until: 1.0, id: 'finish-line' },            // 〜1600m ゴール板 横（決勝線・審判塔）
];

/** ★台本 v3 でショットが変わる先頭位置（m）。閃光を出す境目もここから引く */
export function broadcastV2ScriptBoundariesM(
  course: Course, script: BroadcastV2Script = 'v4',
): readonly { readonly meters: number; readonly id: BroadcastV2ShotId }[] {
  return scriptRowsOf(script).map((row) => ({ meters: row.until * course.distance, id: row.id }));
}

/**
 * ★そのカットが**終わる距離**（m）。固定カメラの据え位置に使います。
 *
 * 【なぜ要るか（2026-08-22 の実害）】
 *   固定カメラは `broadcastV2SegmentSpan(course, leaderS).end` を基準に据えていました。
 *   これは**先頭の現在位置が属するコース区間**なので、
 *   ★**カットの途中で馬が区間の境界を跨ぐと、カメラが次の区間の終点へ瞬間移動**します。
 *
 *   実測（4 角正面・注視点 890m→900m）:
 *     画角 **12.82° → 2.80°（−78%）**、馬の画面上の位置が **1 コマで 517px** 跳び、
 *     大きさが **33% 変わる**。★オーナー評「カーブから曲がってくる時が雑、滑らかに走っていない」。
 *
 * → ★**台本のカットの終わり**を基準にします。カットの中では動かないので跳びません。
 */
export function broadcastV2ShotEndM(
  course: Course, shotId: BroadcastV2ShotId, script: BroadcastV2Script = 'v4',
): number | undefined {
  const row = scriptRowsOf(script).find((r) => r.id === shotId);
  return row === undefined ? undefined : row.until * course.distance;
}

/**
 * ★台本 v4 — **オーナー判定（2026-08-21・12 カット全数）で合格した方向だけで構成する**
 *
 * 【判定の結果】`JUDGE_RACE_CUTS_20260821.md`
 *
 *   | 見ている方向 | カット | 結果 |
 *   |---|---|---|
 *   | **前から**（`diag-front`） | 発走 / 1角 / 直線入口 / 先頭争い | ★**4 つとも走り方は合格** |
 *   | **真横**（`side`）         | 勝負所 / 直線 / ゴール          | ゴール合格・他は中間 |
 *   | **後ろ・上から**（`diag-rear` / `high-diag`） | 2角 / 空撮 / 3角 / 4角ワイド / 勝馬後方 | ★**5 つとも不合格。例外なし** |
 *
 * ★**後方・俯瞰は 5 戦 5 敗**でした。素材の粗さではありません
 * （コマ送りのぶれは `diag-front-v3` 0.5% / `diag-rear-v5` 2.0% / `high-diag-v4` 2.2% に対し、
 *  **合格している真横 `side-v7` が 4.2% でいちばん大きい**）。
 * ★**後ろから見ると脚の伸び縮みが見えず、尻の上下だけが残る** — それが
 *   オーナー評「**馬がぴょんぴょんしている**」の正体です。**素材を作り直しても直りません。**
 *
 * ★副次効果: 「芝の外側の黒い背景が雑」（生垣タイルの繰り返し）は俯瞰カット特有で、
 *   そのカットを落とすと**画面に出なくなります。**
 *
 * 【尺】レース本編を **30 秒**にする（オーナー指示 2026-08-21）。
 *   `until` は**距離の比**なので、時間の配分とは一致しません（道中は早送り、勝負所と直線は等倍）。
 *   ★実際の秒数は `npx tsx tools/verify-cut-timing.mjs` で測って合わせること。**目分量で置かない。**
 */
export const SCRIPT_V4: readonly { readonly until: number; readonly id: BroadcastV2ShotId }[] = [
  /**
   * ⚠️ ★`until` は**距離**で、尺は**時間**です。道中は 5.9 倍で早送りするので、
   *    距離を増やしても時間はあまり増えません。実測して合わせた値です
   *    （`npx tsx tools/verify-cut-timing.mjs`）。
   *    最初 0.060 / 0.200 / 0.500 と置いたら**発走が 1.0 秒**しかありませんでした。
   */
  { until: 0.150, id: 'start-front' },          // 〜240m   発走（前から）
  { until: 0.330, id: 'first-corner-front' },   // 〜528m   1角（前から）
  { until: 0.500, id: 'side-drive' },           // 〜800m   道中〜勝負所（真横）
  { until: 0.660, id: 'fourth-corner-front' },  // 〜1056m  直線入口（前から・固定）
  /**
   * ★直線の**主役は正面固定**にしました（2026-08-22・オーナー指摘）。
   *   我々の隊列は上位 8 頭で 27.7m 伸びるので、横からでは差し馬が画面に入りません。
   *   正面なら走路方向の広がりが奥行きになり、**奥から上がってくる**のが見えます。
   */
  { until: 0.940, id: 'homestretch-front' },    // 〜1504m  ★直線ぜんぶ（正面固定・差しが見える）
  { until: 1.0, id: 'finish-line' },            // 〜1600m  ゴール（真横）
];

/**
 * ★**台本 v5 — 通常 `/race` の既定**
 *
 *   参考映像との差として測定で確定した点のうち、★**直線の向きだけ**を旧 v4 から変える。
 *     ① 直線の 18.6 秒を**正面 → 横追従**へ  `homestretch-front` → `homestretch-side`
 *
 *   ⚠️ ★**それ以外は v4 と同じ**です。`until`（カット境界）も動かしていません。
 *      発走・1 角・道中・**第4コーナー**・ゴールは v4 のまま。
 *   ⚠️ ★**分割していません。** 参考映像にも約 19 秒の長い横追従があるので、
 *      **長さは同じまま向きだけ**を変えています。
 *   ⚠️ ★target とカメラ定義は**各ショットが元から持っているもの**をそのまま使います。
 *      接戦判定・自馬追従・先頭馬追従は足していません。
 *
 * 【★第4コーナーを俯瞰にした試みは、オーナー判定で撤回しました（2026-08-25）】
 *
 *   v5 は当初、第4コーナーも `fourth-corner-front` → `fourth-corner-high`（上・後ろから）に
 *   変えていました。★**オーナー評「馬がぴょんぴょんする。絵は良いが走って見えない」。**
 *
 *   ⚠️ ★**これは 2026-08-21 に一度決着していた論点でした**（`JUDGE_RACE_CUTS_20260821.md`・
 *      12 カット全数判定）。**前から**見る 4 カットは全部合格、**後ろ・上から**見る 5 カットは
 *      ★**5 戦 5 敗・例外なし**。`SCRIPT_V4` はその判定に従って後方・俯瞰を落とした台本です。
 *      ★**v5 はその 4 角を俯瞰へ戻していました。** 同じ判定に照らさずに参考映像へ寄せたためです。
 *
 *   ★対処として「その俯瞰だけ見た目の完歩を 9m にする」（走路方向の圧縮 62% → 77%）を
 *     一度入れましたが、オーナー評は「**多少いいが、いずれにしても思い切りぴょんぴょん**」。
 *     ★**完歩の梃子は走路方向の圧縮にしか効かず、胴の上下には効きません。**
 *     素材の実測（`tools/audit-hop-vs-reach.mjs`）: 矩形の下端を地面に置いたときの胴の上下は
 *     `high-diag-v4` が **9.8%** で全素材の最大（`side-v6` 6.5% / `diag-front-v3` 6.0% /
 *     `diag-rear-v2` 4.8%）。**上下が最大の素材に、走路方向の動きが最小の画角**が重なっていました。
 *
 *   → ★**第4コーナーは v4 と同じ `fourth-corner-front`（前から）に戻します。**
 *     完歩 9m は行き場が無くなるので revert しました（記録は
 *     `REPORT_P4_2D_OVERHEAD_STRIDE_FIX_20260825.md` と `..._20260825.md` に残しています）。
 *
 *   ⚠️ ★**ショット定義の変更は、カメラ平滑化状態の引き継ぎにより後続カットの初期構図にも
 *      影響します。** 台本上は変えていない `finish-line` でも、旧 v4 と絵が約 22.6% 変わります
 *      （seed 42 実測）。これは比較動画で確認・承認した挙動です。
 *   ⚠️ ★進行 88〜93% で馬体が右上の順位表の下を通ります（既知の許容事項・今回は直しません）。
 *
 *   ★旧 v4 は消していません。比較・即時切り戻しは `/race?cinematography=v4`。
 *   ★v5 と v4 の違いは、いまは**直線の向きだけ**です。
 */
export const SCRIPT_V5: readonly { readonly until: number; readonly id: BroadcastV2ShotId }[] = [
  { until: 0.150, id: 'start-front' },          // 〜240m   v4 と同じ
  { until: 0.330, id: 'first-corner-front' },   // 〜528m   v4 と同じ
  { until: 0.500, id: 'side-drive' },           // 〜800m   v4 と同じ
  { until: 0.660, id: 'fourth-corner-front' },  // 〜1056m  v4 と同じ（★俯瞰は 2026-08-25 に撤回）
  { until: 0.940, id: 'homestretch-side' },     // 〜1504m  ★横追従へ（v4 は homestretch-front）★v5 唯一の違い
  { until: 1.0, id: 'finish-line' },            // 〜1600m  v4 と同じ
];

/**
 * ★**争っている馬が画面に収まる画角**（度）を返す。
 *
 * @param spanM      先頭から最後尾の「争っている馬」までの距離（m）
 * @param distM      カメラから注視点までの距離（m）
 * @param aspect     画面の横／縦
 * @param minFovDeg  いちばん寄れる画角（ショットの既定値）
 * @param maxFovDeg  いちばん引ける画角
 */
export function broadcastV2ContenderFov(
  spanM: number, distM: number, aspect: number, minFovDeg: number, maxFovDeg: number,
): number {
  if (!(distM > 1) || !(aspect > 0)) return minFovDeg;
  /**
   * ★余白。★1.0 にすると**先頭と最後尾が画面の縁**に来て、抜いた瞬間が切れます。
   *   馬 1 頭ぶん（2.4m）以上の余白が要るので、比で 1.45 としています。
   */
  const needM = Math.max(0, spanM) * 1.45 + 4;
  // 横の視野が needM になる縦画角
  const fovY = 2 * Math.atan(needM / (2 * distM * aspect));
  const deg = (fovY * 180) / Math.PI;
  return Math.max(minFovDeg, Math.min(maxFovDeg, deg));
}

/** 閃光トランジションで入るショット */

/**
 * ★**いま映しているカットが始まった地点**（先頭の位置・m）
 *
 * 【何のためか】
 *   馬の絵は板（ビルボード）なので、向きは**素材の選び分けと左右反転**でしか変わりません。
 *   反転は「馬の進む向きが画面のどちら側を向くか」で決まるため、コーナーを回っている間に
 *   ★**カットの途中で符号が変わり、馬だけが 1 コマで裏返ります。**
 *   実測（seed 42・`fourth-corner-front`・表示 19.20s）: 向きが 141°→180° と変わる途中で反転。
 *   ★オーナー評「**滑らかに曲がっていない。かくかく曲がっている**」。
 *
 *   ⚠️ ★これは**この案件で 3 度目の同じ形**です。①順位が入れ替わると注視点の横位置が 237px 飛ぶ
 *      ②先頭差が境目をまたぐと画角が 1 コマで 13°→6° に跳ぶ ③今回の反転。
 *      いずれも「**カットの途中で真偽が切り替わる**」ことが原因でした。
 *   ★この案件の基準は「**カットの途中で跳ぶのは不具合／カットの境目なら許容**」です。
 *
 * 【どうするか】
 *   反転の判定を**そのカットが始まった地点**で 1 回だけ行い、カット中は変えません。
 *   ここはその「始まった地点」を返します。★台本の表がカット境界を持っているので、
 *   **境界の値をここで作り直さず、表から引きます**（2 か所に持つと必ず離れる・R-30）。
 *
 * @param shotId 指定すると、そのショットのカットの始点を返す（ディゾルブで直前ショットを描くとき用）
 */
export function broadcastV2CutStartMeters(
  course: Course, leaderMeters: number,
  options: { readonly script?: BroadcastV2Script | undefined; readonly shotId?: BroadcastV2ShotId | undefined } = {},
): number {
  const script = options.script ?? 'v4';
  // ★区間ベースの旧台本（v2）は表を持たないので、いまの地点をそのまま返す（＝これまでどおり）
  if (script === 'v2') return leaderMeters;
  const rows = scriptRowsOf(script);
  const distance = Math.max(1, course.distance);
  const frac = Math.max(0, leaderMeters) / distance;
  let prevUntil = 0;
  for (const row of rows) {
    const isTarget = options.shotId === undefined ? frac < row.until : row.id === options.shotId;
    if (isTarget && prevUntil <= frac) return prevUntil * distance;
    if (frac >= row.until) prevUntil = row.until;
    else if (options.shotId !== undefined && row.id === options.shotId) return prevUntil * distance;
  }
  return prevUntil * distance;
}
export const FLASH_INTO: ReadonlySet<BroadcastV2ShotId> = new Set<BroadcastV2ShotId>(['side-drive']);

export function broadcastV2ShotAt(
  course: Course, leaderMeters: number, allFinished = false, cornerCutM = CORNER_CUT_M,
  options: { readonly fourthCornerFront?: boolean | undefined; readonly script?: BroadcastV2Script | undefined; readonly winnerRear?: boolean | undefined } = {},
): BroadcastV2Shot {
  if (allFinished) return options.winnerRear === true ? SHOTS['winner-follow-rear'] : SHOTS['winner-follow'];
  const script = options.script ?? 'v4';
  if (script !== 'v2') {
    const rows = scriptRowsOf(script);
    const frac = Math.max(0, leaderMeters) / Math.max(1, course.distance);
    for (const row of rows) {
      if (frac < row.until) {
        // 4 角の正面固定は正面寄り素材が無いときは俯瞰ワイドで代用
        if (row.id === 'fourth-corner-front' && options.fourthCornerFront === false) return SHOTS['fourth-corner-wide'];
        return SHOTS[row.id];
      }
    }
    return SHOTS['finish-line'];
  }
  const left = course.distance - leaderMeters;
  if (left <= 80) return SHOTS['finish-line'];
  const seg = segmentAtWithStart(course, Math.max(0, leaderMeters));
  const label = seg.label;
  const inCut = cornerCutM > 0 && leaderMeters - seg.start < cornerCutM;
  if (label.includes('1角')) return inCut ? SHOTS['first-corner-front'] : SHOTS['backstretch-side'];
  if (label.includes('2角')) return inCut ? SHOTS['second-corner-high'] : SHOTS['backstretch-side'];
  if (label === '向正面') return SHOTS['backstretch-side'];
  if (label.includes('3角')) return inCut ? SHOTS['third-corner-rear'] : SHOTS['backstretch-side'];
  if (label.includes('4角')) {
    if (!inCut) return SHOTS['homestretch-side'];
    return options.fourthCornerFront === true ? SHOTS['fourth-corner-front'] : SHOTS['fourth-corner-high'];
  }
  if (label === '直線') return SHOTS['homestretch-side'];
  return SHOTS['start-follow'];
}

/** id からショット定義を引く（ディゾルブで直前ショットを描くとき用） */
export function broadcastV2ShotById(id: BroadcastV2ShotId): BroadcastV2Shot {
  return SHOTS[id];
}

/** ★HUD の区間名。ショット選択と**同じ区間定義**から出す（別定義だと「第1コーナー」表示中に向正面ショット、が起きた） */
export function broadcastV2SectionLabel(course: Course, leaderMeters: number, shotId: BroadcastV2ShotId): string {
  if (shotId === 'winner-follow' || shotId === 'winner-follow-rear') return 'レース確定';
  if (shotId === 'finish-line') return 'ゴール前';
  const label = segmentAtWithStart(course, Math.max(0, leaderMeters)).label;
  if (label.includes('1角')) return '第1コーナー';
  if (label.includes('2角')) return '第2コーナー';
  if (label === '向正面') return '向正面';
  if (label.includes('3角')) return '第3コーナー';
  if (label.includes('4角')) return '第4コーナー';
  if (label === '直線') return '最後の直線';
  return 'スタート後';
}

/** 外れた後方馬や単独先頭でカメラが振られない、中央80%の平均注視距離。 */
export function broadcastV2FocusMeters(meters: readonly number[]): number {
  if (meters.length === 0) return 0;
  const sorted = [...meters].sort((a, b) => a - b);
  const trim = sorted.length >= 10 ? 1 : 0;
  const kept = sorted.slice(trim, sorted.length - trim);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/** 全馬群を映すショットでは先頭と最後尾を等距離に置き、単独先頭を切らない。 */
export function broadcastV2RangeCenterMeters(meters: readonly number[]): number {
  if (meters.length === 0) return 0;
  let min = meters[0]!;
  let max = meters[0]!;
  for (const value of meters.slice(1)) { min = Math.min(min, value); max = Math.max(max, value); }
  return (min + max) / 2;
}

/**
 * ★馬群が画面幅より広いとき、先頭を画面内（進行方向側の約 78%）に置く注視距離。
 *   参考映像の横追従は先頭集団を画面いっぱいに映し、後方は画面外に出る（全頭を収めるために引かない）。
 *   馬群が画面に収まるときは従来どおり先頭と最後尾の中点。
 * @param halfFrameM 画面の半幅（m）＝ (画面幅/2) / 注視点の px/m
 */
export function broadcastV2LeadFrameFocusMeters(
  meters: readonly number[], halfFrameM: number, leadFraction = 0.78,
): number {
  if (meters.length === 0) return 0;
  const centre = broadcastV2RangeCenterMeters(meters);
  let min = meters[0]!, max = meters[0]!;
  for (const value of meters) { min = Math.min(min, value); max = Math.max(max, value); }
  void min;
  if (!Number.isFinite(halfFrameM)) return centre;
  // 先頭を画面幅の leadFraction の位置に: 注視点 = 先頭 − 半幅 × (2·leadFraction − 1)
  const lead = max - halfFrameM * (2 * leadFraction - 1);
  /**
   * ★しきい値で切り替えると、馬群が広がった瞬間にカメラが跳ぶ（実測 0.25 秒で 3.5m）。
   *   中点と先頭基準の大きいほうを採る: 馬群が狭いうちは中点、広がるほど先頭基準に自然に移る。
   *
   * ⚠️ ★`Math.max` では**値は連続でも、切り替わる瞬間に増え方（微分）が跳びます。**
   *    実測（`side-drive` 7.17 秒・12 番）: 馬の画面上の移動が
   *    **11.6px → 0.0px** と 1 コマで止まる。★オーナー評「滑らかさがなく、馬が飛ぶ印象」。
   *    → **なめらかな max** にして、境目の手前から少しずつ移します。
   */
  const band = Math.max(1, halfFrameM * 0.06);
  return softMax(centre, lead, band);
}

/**
 * ★世界に固定した物体（決勝線・審判塔）を映すショットでは、背景の流れを馬の真の位置に一致させる重み。
 *   1 = 完全に一致（ゴール前・勝馬追従）、0 = 見た目の速度（時間圧縮を打ち消した実速度）で流してよい。
 *   ゴール前 80m の手前 80m（残り 160→80m）で滑らかに 0→1 にし、流速の段差を作らない。
 */
export function broadcastV2AnchorWeight(course: Course, shotId: BroadcastV2ShotId, focusS: number): number {
  if (shotId === 'finish-line' || shotId === 'winner-follow' || shotId === 'winner-follow-rear') return 1;
  // ★発走: 発馬機（世界固定）が画面にある間（注視点 25m まで）だけ真の速度に一致させ、25→50m でなだらかに
  //   見た目の速度へ（オーナー指摘「ゲート後の走りがせわしない」→ ゴール前直線と同じ実速の周期にする）
  if (shotId === 'start-follow' || shotId === 'start-front') {
    const u = Math.max(0, Math.min(1, (focusS - 25) / 25));
    const startWeight = 1 - u * u * (3 - 2 * u);
    if (startWeight > 0) return startWeight;
  }
  const left = course.distance - focusS;
  const t = Math.max(0, Math.min(1, (160 - left) / 80));
  return t * t * (3 - 2 * t);
}

/**
 * ★発走のカメラ（ゲート待機〜発走直後）。承認済み発馬機プレートの遠近（右端が手前で大きく、左へ奥に受ける）に
 *   合わせて探索した構図: 発馬機の**後方**から前を向く（alongM +30）・低い（3m）・遠い望遠（70m・7°）。
 *   発走後 1.0〜3.5 秒で望遠横追従 `SIDE_TELE` へ連続的に移る（カット無し）。
 */
export const START_CAMERA: ShotCameraPreset = { backM: 70, upM: 3, sideM: 9, fovDeg: 7, alongM: 30 };
export function broadcastV2StartCamera(raceDisplaySec: number): ShotCameraPreset {
  const t = Math.max(0, Math.min(1, (raceDisplaySec - 1.0) / 2.5));
  const k = t * t * (3 - 2 * t);
  const mix = (a: number, b: number): number => a + (b - a) * k;
  return {
    backM: mix(START_CAMERA.backM, SIDE_TELE.backM),
    upM: mix(START_CAMERA.upM, SIDE_TELE.upM),
    sideM: SIDE_TELE.sideM,
    fovDeg: mix(START_CAMERA.fovDeg, SIDE_TELE.fovDeg),
    alongM: mix(START_CAMERA.alongM ?? 0, SIDE_TELE.sideM * 0.25),
  };
}

/**
 * ★発走の注視点: 待機中はゲート付近（`holdS`）に固定し、発走後 `blendSec` で馬群追従へ滑らかに移す（カット無し）。
 *   `holdS`=4m は START_CAMERA で 12 枠が画面 x≈118〜585 に並ぶ距離（発馬機プレートの枠位置と一致）。
 */
export function broadcastV2StartFocus(
  packFocusS: number, raceDisplaySec: number, blendSec = 1.5, holdS = 4,
): number {
  if (raceDisplaySec <= 0) return holdS;
  const t = Math.max(0, Math.min(1, raceDisplaySec / blendSec));
  const k = t * t * (3 - 2 * t);
  return holdS + (Math.max(holdS, packFocusS) - holdS) * k;
}

/**
 * ★発走イージング（描画のみ）。位置モデルは開扉直後から全速なので、
 *   開扉から `rampSec` の間だけ**表示位置を実際より手前に置き**、加速して見せる。
 *   （ユーザー指摘「ロケットスタート」への対処）
 *
 * ⚠️ ★以前は「**距離 × k(t)**」で圧縮していました。2 つの実害がありました（実測）:
 *
 *   ① **見た目の速さが行き過ぎて戻る。** 0 → **25.0 m/s** まで上がり、そこから 18.0 m/s へ落ちる。
 *      実際の馬は加速したあと減速しません。★オーナー評「ゲートの出だし…馬が飛ぶ印象」。
 *      原因は `d/dt(距離 × k) = v·k + 距離·k'` の第 2 項で、**距離が伸びるほど効いてしまう**ため。
 *
 *   ② **着差が縮む。** 全馬に同じ係数を掛けるので差も同じだけ縮み、
 *      実際 5 馬身の差が発走 0.2 秒では **0.66 馬身**にしか見えない。
 *      （旧コメントは「順位・着差の見え方は変わらない」としていたが、**誤り**）
 *
 * → ★**速さを立ち上げる**形にします。表示位置 = 真の距離 − 遅れ（m）。
 *   遅れは「実速で走ったぶん」と「立ち上がりで走ったぶん」の差を積分したもので、
 *   `rampSec` を過ぎたら**一定**になります。
 *   ・見た目の速さは 0 から実速へ**単調に**上がり、行き過ぎません
 *   ・全馬に**同じ距離**を引くので、**着差はそのまま**（掛け算ではなく引き算）
 */
export function broadcastV2StartLagM(raceDisplaySec: number, speedMps: number, rampSec = 1.6): number {
  if (raceDisplaySec <= 0) return 0;
  const t = Math.min(rampSec, raceDisplaySec);
  /**
   * ★立ち上がりの速さは `v · (2u − u²)`（u = t/ramp）。**出だしで加速が最大**の形。
   *
   * ⚠️ ★最初は `smoothstep`（3u²−2u³）にしていました。**微分が 0 から始まる**ので、
   *    0.5 秒たっても実速の **7%** しか出ず、
   *    ★オーナー評「**ゲートの発送がゆっくりになってしまいました　インパクトが悪いです**」。
   *    実際の馬は**ゲートを出た瞬間がいちばん強く蹴ります。**
   *    新しい形は 0.5 秒で **53%**、1.5 秒で 100%。
   *
   * 実速で走った距離 `v·t` との差が遅れ。`2u−u²` の積分は `u² − u³/3`。
   */
  const u = t / rampSec;
  const ranEased = speedMps * rampSec * (u * u - (u * u * u) / 3);
  return speedMps * t - ranEased;
  // ★ramp を過ぎたら遅れは一定（それ以上ずれない）
}

/**
 * ★互換のため残す。**新しい経路では使いません**（上の注記のとおり掛け算では着差が縮む）。
 * @deprecated `broadcastV2StartLagM` を使うこと
 */
export function broadcastV2StartEase(raceDisplaySec: number, rampSec = 3.0): number {
  if (raceDisplaySec <= 0) return 0.12;
  const t = Math.min(1, raceDisplaySec / rampSec);
  const k = t * t * (3 - 2 * t);
  return 0.12 + 0.88 * k;
}

/**
 * ★固定カメラの自動ズーム（TV の望遠）: 注視点までの距離が遠いほど狭い画角。
 *   馬体（2.5m）が画面高の約 22% になる画角を基準に、6°〜上限 fovDeg の範囲。
 */
export function broadcastV2FixedFov(distanceM: number, maxFovDeg: number): number {
  const wantHalfHeightM = 2.5 / 0.22 / 2;               // 画面半分の高さに入れたい実寸（m）
  const fov = 2 * Math.atan(wantHalfHeightM / Math.max(5, distanceM)) * (180 / Math.PI);
  /**
   * ★下限 2.8°（2026-08-21 に 6° から下げた）
   *
   *   下限が 6° のとき、4角正面（唯一の固定カメラ）は**ショットの全区間で下限に頭打ち**し、
   *   馬は画面の **10.6%（先頭 1000m・カメラまで 225m）〜21.1%（1120m・113m）** にしかなりません。
   *   合格済みの `finish-line` は **25.2%** です。
   *   ★オーナー評「**めちゃくちゃいい場面なのに 馬騎手のクオリティが悪い**」——
   *     絵が悪いのではなく、**この上限のせいで半分の大きさでしか描いていません**でした。
   *
   *   ⚠️ 「望遠にすると奥行きが潰れて重なるのでは」は**当たりません**。
   *      奥行きの潰れは**距離**で決まり、画角では変わりません。225m 先の馬群は
   *      画角が何度でも同じだけ潰れています。画角を下げると**大きさだけ**が戻ります。
   *
   *   2.8° は 225m で狙いの 22% にちょうど届く値です（2·atan(5.68/225)=2.89°)。
   *   近づけば式のほうが大きくなるので、下限は自然に効かなくなります。
   */
  /**
   * ★上限・下限は**なめらかに**当てます（2026-08-22）。
   *
   * ⚠️ ★`Math.min` / `Math.max` で角を作ると、**当たった瞬間に伸びが止まり**、
   *    画面上の移動量の増え方が急に変わります。実測（4 角正面 14.53 秒・6 番）:
   *      画角が 13.286° → **上限 13.600° に到達**した次のコマで、
   *      馬の横移動が **11.2px → 23.1px** と倍に。★1 コマで 11.9px の跳び。
   *    ★オーナー評「カーブの曲がり…滑らかさがなく、馬が飛ぶ印象」。
   *
   * ★境目の手前から少しずつ寄せれば、**微分が連続**になり角が消えます。
   */
  /**
   * ★下限を **2.8° → 1.4°** に下げました（2026-08-22）。
   *
   *   直線の正面固定（`homestretch-front`）はカメラまで **400m** に達します。
   *   2.8° のままだと式より下限が勝ち、★**馬が画面の 12.5%** にしかなりません
   *   （実測・先頭 1127m）。これは 2026-08-21 に 6°→2.8° へ下げたときと**同じ形の頭打ち**です。
   *
   *   ⚠️ ★望遠にしても**奥行きは潰れません**（潰れは距離で決まる・上の注記）。
   *      画角を下げて戻るのは**大きさだけ**です。
   *   1.4° は 400m で狙いの 22% に届く値です（2·atan(5.68/400)=1.63°）。
   */
  return softClamp(fov, 1.4, maxFovDeg);
}

/**
 * ★境目に**なめらかに**近づく clamp。
 *   境目の手前 `band`（既定は幅の 15%）から smoothstep で寄せるので、
 *   値そのものも、**増え方（微分）も**途切れません。
 */
/**
 * ★**なめらかな max**。`band` の幅で 2 つの値を混ぜるので、
 *   どちらが大きいかが入れ替わっても**増え方（微分）が途切れません**。
 *   ⚠️ `Math.max` は値こそ連続ですが、切り替わりで微分が跳びます（＝画面では「飛ぶ」）。
 */
export function softMax(a: number, b: number, band: number): number {
  if (!(band > 0)) return Math.max(a, b);
  const u = Math.max(0, Math.min(1, (a - b) / band / 2 + 0.5));
  const w = u * u * (3 - 2 * u);
  return b + (a - b) * w;
}

export function softClamp(x: number, lo: number, hi: number, bandRatio = 0.15): number {
  if (!(hi > lo)) return Math.max(lo, Math.min(hi, x));
  const band = (hi - lo) * bandRatio;
  const smooth = (u: number): number => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
  if (x >= hi) return hi;
  if (x <= lo) return lo;
  if (x > hi - band) return x + (hi - x) * smooth((x - (hi - band)) / band);
  if (x < lo + band) return x + (lo - x) * smooth(((lo + band) - x) / band);
  return x;
}

/** ゴール前のカメラの型: 接戦（引いて並ぶ馬を全員入れる）／単独（寄る） */
export type BroadcastV2FinishStyle = 'contest' | 'solo';

/**
 * ★ゴール前の展開判定（決定論・順位には触れない）。
 *   先頭が残り 80m に達した時点で、2 着以内が 1 馬身以内、または 3 着以内が 2 馬身以内なら接戦。
 * @param metersSorted 先頭から順に並べた位置（m）
 */
export function broadcastV2FinishStyleOf(metersSorted: readonly number[], horseLengthM = 2.4): BroadcastV2FinishStyle {
  const lead = metersSorted[0];
  const second = metersSorted[1];
  const third = metersSorted[2];
  if (lead === undefined || second === undefined) return 'solo';
  if (lead - second <= horseLengthM) return 'contest';
  if (third !== undefined && lead - third <= horseLengthM * 2) return 'contest';
  return 'solo';
}

/**
 * ★直線→ゴール前のカメラを**連続**に変える（カット無し）。重み w=`broadcastV2AnchorWeight`（残り 160→80m で 0→1）。
 *   接戦: 引いて先頭を画面 45% に置き、後続と決勝線を同時に入れる（参考映像のゴール ≈10%）
 *   単独: 寄ったまま、先頭をやや中央寄り 60% にして決勝線を早めに入れる
 *
 * 【★`base` を引数にした理由（2026-08-22 の実害）】
 *   ここは以前 **`SIDE_TELE` を直接**書いていました。`resolveBroadcastV2Scene` は
 *   `homestretch-side` と `finish-line` の**両方**でこの関数を通すので、
 *   ★**その 2 つのショットの `camera:` は読まれません。**
 *
 *   実害: 直線の寄りを作るため `homestretch-side` の preset を
 *   `SIDE_TELE`(12°) → `SIDE_LOW`(7.6°) に変えたのに、**画面は 25.1% のまま**でした。
 *   ★**定義を変えたのに何も起きない**（R-15 の裏返し: 「入っているが使われない」）。
 *   測定器（`tools/shot-race-at.mjs`）が実プリセットを読んでいたので気づけました。
 *
 * → **基準の画角はショット定義から受け取る。** ここが決めてよいのは
 *   「ゴール前でどれだけ引くか」という**差分**だけです。
 */
export function broadcastV2FinishCamera(
  style: BroadcastV2FinishStyle, weight: number, base: ShotCameraPreset = SIDE_TELE, baseLead = 0.78,
): { readonly camera: ShotCameraPreset; readonly leadFraction: number } {
  const w = Math.max(0, Math.min(1, weight));
  const targetFov = style === 'contest' ? 22 : 12;
  const targetLead = style === 'contest' ? 0.45 : 0.6;
  return {
    camera: { ...base, fovDeg: base.fovDeg + (targetFov - base.fovDeg) * w },
    leadFraction: baseLead + (targetLead - baseLead) * w,
  };
}
