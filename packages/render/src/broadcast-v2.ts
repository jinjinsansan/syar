import { segmentStarts, type Course } from './course.js';
import type { ShotCameraPreset, ShotTarget, ShotView } from './shot-sequence.js';

export type BroadcastV2ShotId =
  | 'start-follow' | 'first-corner-front' | 'second-corner-high'
  | 'backstretch-side' | 'third-corner-rear' | 'fourth-corner-high' | 'fourth-corner-front'
  | 'homestretch-side' | 'finish-line' | 'winner-follow'
  // ★中継台本 v3（アーケード参考映像に合わせた追加ショット）
  | 'side-low' | 'side-close' | 'aerial' | 'side-drive' | 'fourth-corner-wide' | 'front-close'
  | 'start-front' | 'winner-follow-rear';

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
   * ★固定カメラ（JRA 中継の 4 角: 直線入口の外側から、奥からこちらへ向かってくる馬群を見る）。
   *   現在の区間の終点から `sFromSegmentEnd` 先・内ラチから `w` の位置・高さ `upM` にカメラを置き、注視点だけ追う。
   */
  readonly fixedCamera?: { readonly sFromSegmentEnd: number; readonly w: number; readonly upM: number };
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
const SIDE_LOW: ShotCameraPreset = { backM: 44, upM: 3.5, sideM: 9, fovDeg: 12.2 };
const SIDE_CLOSE: ShotCameraPreset = { backM: 44, upM: 3.2, sideM: 9, fovDeg: 7.5 };

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
    // ★JRA 中継の 4 角: 直線入口の外側・高さ 9m の固定カメラ。馬群が奥から手前へ向かってくる
    // fovDeg は上限（距離に応じて自動ズーム: `broadcastV2FixedFov`）
    camera: { backM: 42, upM: 7, sideM: 12, fovDeg: 13.6 },
    fixedCamera: { sFromSegmentEnd: 30, w: 27, upM: 7 },
  },
  'homestretch-side': {
    id: 'homestretch-side', view: 'side', target: 'pack', horseAsset: 'side-v6', transitionSec: 0.35,
    camera: SIDE_TELE,
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
  },
  'fourth-corner-wide': {
    // ★4 角をラチのカーブごと広く（後方・高め）
    id: 'fourth-corner-wide', view: 'high-diag', target: 'pack', horseAsset: 'high-diag-v2', transitionSec: 0.4,
    camera: { backM: 40, upM: 14, sideM: 13, fovDeg: 18.8 },
  },
  'front-close': {
    // ★先頭争いを斜め前・寄りで（先頭の少し前・外側・低い、追従）
    id: 'front-close', view: 'diag-front', target: 'contenders', horseAsset: 'diag-front-v2', transitionSec: 0.35,
    camera: { backM: 18, upM: 2.6, sideM: 5, fovDeg: 20 },
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
  course: Course, script: 'v3' | 'v4' = 'v4',
): readonly { readonly meters: number; readonly id: BroadcastV2ShotId }[] {
  const rows = script === 'v4' ? SCRIPT_V4 : SCRIPT_V3;
  return rows.map((row) => ({ meters: row.until * course.distance, id: row.id }));
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
  course: Course, shotId: BroadcastV2ShotId, script: 'v3' | 'v4' = 'v4',
): number | undefined {
  const rows = script === 'v4' ? SCRIPT_V4 : SCRIPT_V3;
  const row = rows.find((r) => r.id === shotId);
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
  { until: 0.800, id: 'homestretch-side' },     // 〜1280m  直線（真横）
  { until: 0.920, id: 'front-close' },          // 〜1472m  先頭争い（前から）
  { until: 1.0, id: 'finish-line' },            // 〜1600m  ゴール（真横）
];

/** 閃光トランジションで入るショット */
export const FLASH_INTO: ReadonlySet<BroadcastV2ShotId> = new Set<BroadcastV2ShotId>(['side-drive']);

export function broadcastV2ShotAt(
  course: Course, leaderMeters: number, allFinished = false, cornerCutM = CORNER_CUT_M,
  options: { readonly fourthCornerFront?: boolean | undefined; readonly script?: 'v2' | 'v3' | 'v4' | undefined; readonly winnerRear?: boolean | undefined } = {},
): BroadcastV2Shot {
  if (allFinished) return options.winnerRear === true ? SHOTS['winner-follow-rear'] : SHOTS['winner-follow'];
  const script = options.script ?? 'v4';
  if (script === 'v3' || script === 'v4') {
    const rows = script === 'v4' ? SCRIPT_V4 : SCRIPT_V3;
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
   *   max(中点, 先頭基準) は連続: 馬群が狭いうちは中点、広がるほど先頭基準に自然に移る。
   */
  return Math.max(centre, lead);
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
 * ★発走イージング（描画のみ）。位置モデルは開扉直後から全速なので、開扉から `rampSec` の間、
 *   各馬の表示位置を「発馬地点からの距離 × k(t)」に圧縮する（k: 0.22 → 1、なめらか）。
 *   全馬に同じ係数を掛けるので順位・着差の見え方は変わらない。脚の周期・背景の流れも同じ位置から
 *   決まるので「止まった状態から走り出して加速」になる（ユーザー指摘「ロケットスタート」）。
 */
export function broadcastV2StartEase(raceDisplaySec: number, rampSec = 3.0): number {
  if (raceDisplaySec <= 0) return 0.12;
  const t = Math.min(1, raceDisplaySec / rampSec);
  // ★立ち上がりは緩く（最初の 1 秒はゲートから数馬身）、その後なめらかに全速へ
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
  return Math.max(2.8, Math.min(maxFovDeg, fov));
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
 *   接戦: fov 12°→22° に引き、先頭を画面 45% に置いて後続と決勝線を同時に入れる（参考映像のゴール ≈10%）
 *   単独: 望遠のまま（27%）、先頭をやや中央寄り 60% にして決勝線を早めに入れる
 */
export function broadcastV2FinishCamera(
  style: BroadcastV2FinishStyle, weight: number,
): { readonly camera: ShotCameraPreset; readonly leadFraction: number } {
  const w = Math.max(0, Math.min(1, weight));
  const targetFov = style === 'contest' ? 22 : 12;
  const targetLead = style === 'contest' ? 0.45 : 0.6;
  return {
    camera: { ...SIDE_TELE, fovDeg: SIDE_TELE.fovDeg + (targetFov - SIDE_TELE.fovDeg) * w },
    leadFraction: 0.78 + (targetLead - 0.78) * w,
  };
}
