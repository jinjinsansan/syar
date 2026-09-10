/**
 * ★**馬の接地と配置**（★2026-09-10・`DEV_INSTRUCTIONS_P4_GAIT_INTEGRATION_REGRESSION_20260910.md`）
 *
 * ★4 頭の検証台（`/rig-lab/sprite`）で成立していた走りが、★桜星賞へ組み込んだ時点で
 * ★変わった。★その原因のうち、★この対で扱うのは 2 つ:
 *
 *   ★**F-G1 コマ別の拡縮** … ★組み込み先は鞍布の検出幅で ★**毎コマ画像全体を拡縮**していた
 *                          （★真横 A で隣接コマ最大 12.18%・斜め前 A で 17.39%）。
 *                          ★検証台はセット共通の倍率 1 つで描いている。
 *   ★**F-G2 接地モデル** … ★検証台は ★**コマごとの蹄の位置**の浮きを `bob` の割合だけ残す。
 *                          ★組み込み先は ★**毎コマ下端を接地**させ、★別の固定表
 *                          ★`[15,20,6,0,0,0,0,22]`（★旧素材のコマ順を仮定）で浮かせていた。
 *
 * 【★この対の位置づけ】
 *   ★配置の式を ★**ページの中から出す**。★ページの中にあると、★検査もプローブも
 *   ★「式を書き写して再現する」ことしかできない（★R-30 — ★測定器が画面と同じものを読む保証がない）。
 *   ★ここに置けば ★画面・検査・監査が ★**同じ関数**を呼ぶ。
 *
 * 【⚠️ ★蹄の位置は ★**新たに測らない**】
 *   ★検証台は α ≥ 64 で下端を測っている。★焼いた素材の目録は ★`nativeBounds`（α < 12 を透明・余白 2px）
 *   ★を既に持っており、★**描画側が接地に使っているのはこちら**である。★実測すると両者の差は
 *   ★真横 v8 の 8 コマで ★3〜4px / 576px（★コマ間のばらつきは最大 1px）にとどまる。
 *   → ★**新しい測り方を足さず、★既にある `nativeBounds` を使う。**
 *     ★同じ量を 2 か所で持つと離れる（★この案件で 5 回）。★`bob = 0` が従来と 1 画素も変わらない
 *     ★という利点もある（★対照が取れる）。
 *
 * ⚠️ ★**適用する素材群は明示する。** ★`mode: 'measured-ground'` を渡した組だけが新しい接地に乗る。
 *    ★旧素材（`'legacy-table'`）は 1 画素も変えない。
 */

import { BROADCAST_STRIDE_M } from './broadcast-v2.js';

/** ★配置の決め方。★`'measured-ground'` … ★素材の実測／★`'legacy-table'` … ★従来（固定表 ＋ コマ別拡縮） */
export type HorsePlacementMode = 'measured-ground' | 'legacy-table';

/**
 * ★**新しい接地に乗せる素材**（★2026-09-10・★指示書 A-3「適用する素材群を明示する」）。
 *
 *   ★4 頭の検証台でオーナーが繰り返し見た ★**デフォルメ馬の整形済み素材**だけ。
 *   ★ここに無い組（★旧素材・★俯瞰 v4・★勝馬など）は ★**1 画素も変えない**。
 *
 * ⚠️ ★鍵は ★**役の名前ではなく素材の名前**（`prefix`）にする。★役 `side-v6` は
 *    ★中身が v6 → v7 → v8 と替わっても名前が変わらないため、★役で判定すると
 *    ★旧素材まで巻き込む。★焼いた素材の目録も原版の読み込みも `prefix` を持っている。
 */
export const MEASURED_GROUND_PREFIXES: readonly string[] = [
  'horse-jockey-side-v8', 'horse-jockey-side-v8b', 'horse-jockey-side-v8c',
  'horse-jockey-diag-front-v4', 'horse-jockey-diag-front-v4b', 'horse-jockey-diag-front-v4c',
  /**
   * ⚠️ ★**検証用の試作**（★2026-09-10・★オーナー評「斜め前だけ足が太過ぎる」）。
   *    ★`horse-jockey-diag-front-v4` の脚だけを横に 63% へ縮めたもの
   *    （★`tmp/make-thin-legs-20260910.mjs` で作り直せます）。
   *    ★**ここに載せるのは配置を現行と同一にするためだけ**です。★載せないと
   *    ★従来の配置に落ち、★「脚の太さ」以外も変わって比べられません。
   * ⚠️ ★`?front=diag-front-v4thin` を渡したときだけ読まれます。★既定では読みません。
   * ⚠️ ★**本番の素材ではありません。** ★描き直しが入ったら、★この行と画像を消すこと。
   */
  'horse-jockey-diag-front-v4thin',
];

/** ★その素材が新しい接地に乗るか。★読めなかった素材（`undefined`）は従来へ倒す（★R-27・狭い側） */
export function placementModeFor(prefix: string | undefined): HorsePlacementMode {
  return prefix !== undefined && MEASURED_GROUND_PREFIXES.includes(prefix)
    ? 'measured-ground' : 'legacy-table';
}

/** ★素材ごとに決まる、★目で合わせた値 */
export interface HorseMaterialCalibration {
  /** ★1 完歩の距離 [m]。★脚のコマ送りの周期 */
  readonly strideM: number;
  /** ★浮きをどれだけ残すか（★0 = 全コマ接地・1 = 絵のまま） */
  readonly bob: number;
}

/**
 * ★**デフォルメ馬（整形済み素材）の較正値**（★2026-09-10）。
 *
 *   ★4 頭の検証台 `/rig-lab/sprite` で ★**オーナーが目で決めた値**である
 *   （★2026-09-08 09:38 の画面: ★16.0m/s・★1 完歩 5.60m・★2.86 完歩/秒・★浮き 30%）。
 *
 * ⚠️ ★**この 2 つは素材の性質であって、世界の性質ではない。**
 *    ★`BROADCAST_STRIDE_M = 7` は「実馬は 1 完歩 ≈7m」から来た ★**前の素材の値**で、
 *    ★検証台の冒頭注記が ★「7m で描くと蹄が滑ります。★素材ごとに測ること」と警告している。
 *    ★桜星賞への当て込みは ★**素材を運んで、この 2 つを運ばなかった**。
 * ⚠️ ★次の素材でも同じことが起きないように、★**値ではなく素材との対応**をここに置く。
 */
export const DEFORMED_HORSE_CALIBRATION: HorseMaterialCalibration = { strideM: 5.6, bob: 0.3 };

/**
 * ★従来素材の較正値（★浮きは「絵のまま」＝ 1）。
 * ⚠️ ★1 完歩は ★**`BROADCAST_STRIDE_M` から引く**。★ここに 7 と書くと同じ量が 2 か所になる。
 */
export const LEGACY_HORSE_CALIBRATION: HorseMaterialCalibration = {
  strideM: BROADCAST_STRIDE_M, bob: 1,
};

/** ★配置の決め方と較正値は ★**同じ鍵**（素材の名前）から引く。★片方だけ替わる状態を作らない */
export function horseCalibrationFor(mode: HorsePlacementMode): HorseMaterialCalibration {
  return mode === 'measured-ground' ? DEFORMED_HORSE_CALIBRATION : LEGACY_HORSE_CALIBRATION;
}

/** ★1 コマぶんの、★配置に要る情報だけ（★画像そのものは持たない＝純粋に計算できる） */
export interface HorsePlacementFrame {
  /** ★切り出した矩形の高さ（★焼いた素材ならアトラスの px・★原版なら原版の px） */
  readonly frameHeightSourcePx: number;
  /** ★基準点の y（★切り出し矩形の中での位置） */
  readonly anchorYSourcePx: number;
  /** ★基準点の幅（★鞍布の検出幅）。★従来のコマ別拡縮だけが読む */
  readonly anchorWidthSourcePx: number;
  /** ★基準点が鞍布か（★胴体重心に落ちたコマは従来も拡縮の対象外だった） */
  readonly anchorIsSaddle: boolean;
  /**
   * ★そのコマの ★**不透明部分の下端**を、★原版の画布の高さに対する比で表したもの。
   * ★焼いた素材なら `(nativeBounds.y + nativeBounds.height) / nativeCanvasHeight`。
   * ★原版なら `(opaqueBounds.y + opaqueBounds.height) / 画像の高さ`。
   */
  readonly lowRatio: number;
}

/** ★組ぜんたいの情報 */
export interface HorsePlacementSet {
  readonly mode: HorsePlacementMode;
  /** ★縮尺の基準高さ。★`'measured-ground'` では ★**コマ別に動かさない** */
  readonly referenceHeight: number;
  /** ★原版の画布の高さを、★このコマ群と同じ単位に直したもの（★焼いた素材なら `nativeCanvasHeight × scale`） */
  readonly canvasHeightSourcePx: number;
  /** ★接地線（★`'measured-ground'` のみ）。★`feetRatioOf` で組から求める */
  readonly feetRatio: number;
  /**
   * ★**この組の浮きの量**（★0 = 全コマ接地・1 = 絵のまま・★`'measured-ground'` のみ）。
   *
   * ⚠️ ★**組ごとに持ちます**（★2026-09-10・★裁定 R1-b）。
   *    ★以前は 1 レースに 1 つの値を描画側へ渡していたため、★真横が新しい素材で
   *    ★斜め前が旧素材のときに、★**旧素材にも 0.3 が当たって**いました。
   *    ★旧素材の従来の浮きは「絵のまま（1）＋固定表」です。
   *    ★位相の連続を理由に揃える必要があるのは ★**1 完歩だけ**で、★浮きは揃える理由がありません。
   * ⚠️ ★画面のつまみ（`horseBob`）は、★この値に ★**掛かる倍率**として働きます。
   */
  readonly bob?: number | undefined;
  /**
   * ★従来の固定表による浮き（★`'legacy-table'` のみ・★素材の画素の単位・★コマ数ぶん）。
   * ★呼ぶ側が `flightLiftFor` で作って渡す。
   */
  readonly legacyFlightLiftSourcePx?: readonly number[] | undefined;
  /** ★従来のコマ別拡縮の分母（★`'legacy-table'` のみ）。★`medianAnchorWidth` で作る */
  readonly legacyMedianAnchorWidth?: number | undefined;
}

/** ★配置の答え。★呼ぶ側はこの 2 つをそのままフレームに載せる */
export interface HorsePlacement {
  /** ★このコマの縮尺の分母 */
  readonly referenceHeight: number;
  /** ★`scaledHorseLift` に渡す量 */
  readonly bodyLiftSourcePx: number;
}

/**
 * ★**接地線**。★その組の中で ★**いちばん低い蹄**の位置（比）。
 *
 *   ★検証台は `FEET = 0.920` という定数を置いていたが、★これは真横 v8 の 8 コマを
 *   ★検証台自身の規則で測った最大値 ★**0.9201** と一致する（★2026-09-10・実測）。
 *   ★つまり ★**定数ではなく素材から出る値**なので、★組ごとに求める。
 *   ★斜め前 v4 は 0.9184 で、★0.920 を当てると 1 コマだけ負の浮きになっていた。
 */
export function feetRatioOf(lowRatios: readonly number[]): number {
  if (lowRatios.length === 0) return 1;
  return Math.max(...lowRatios);
}

/**
 * ★**そのコマが描かれている浮き**（★接地線からの差）を、★素材の画素の単位で返す。
 *   ★`bob = 1` で ★**絵のまま**、★`bob = 0` で ★**全コマ接地**になる量である。
 * ⚠️ ★負にしない（★較正値を手で与えた場合に備える）。
 */
export function groundGapSourcePx(
  feetRatio: number,
  lowRatio: number,
  canvasHeightSourcePx: number,
): number {
  return Math.max(0, feetRatio - lowRatio) * canvasHeightSourcePx;
}

/**
 * ★**従来のコマ別拡縮**（★`'legacy-table'` 専用・★旧素材の振る舞いを 1 画素も変えないために残す）。
 *   ★鞍布幅の中央値との比を ±8% で頭打ちにしていたもの。
 */
export function legacyScaleFix(medianWidth: number, frame: HorsePlacementFrame): number {
  if (!frame.anchorIsSaddle || medianWidth <= 0) return 1;
  return Math.max(0.92, Math.min(1.08, frame.anchorWidthSourcePx / medianWidth));
}

/** ★鞍布幅の中央値（★従来の拡縮の分母）。★鞍布が取れたコマだけで採る */
export function medianAnchorWidth(frames: readonly HorsePlacementFrame[]): number {
  const widths = frames.flatMap((f) => (f.anchorIsSaddle ? [f.anchorWidthSourcePx] : []));
  if (widths.length === 0) return 0;
  const sorted = [...widths].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * ★**1 コマの配置を決める。**
 *
 * 【★式の対応】★描画側（`perspective-draw.ts`）を整理すると
 *   ★`top = 接地点 − 画像高 × 縮尺 − (bodyLift − 足元までの距離) × bob × 縮尺`
 *   ★となり、★基準点（`bodyAnchorSourcePx.y`）は ★**打ち消し合って消える**。
 *   ★実際に効くのは ★**「下端を接地させ、`bodyLift − 足元` のぶんだけ浮かせる」**である。
 *   ★したがって ★`bodyLift = 足元までの距離 + 浮き` の形で渡せば、
 *   ★`bob = 0` で全コマ接地・★`bob = 1` で絵のまま、★という検証台と同じ意味になる。
 *
 * ⚠️ ★`'measured-ground'` では ★**コマ別の拡縮を行わない**（★F-G1）。
 *    ★鞍布の検出幅は「明るい無彩色の画素の外接矩形」であって、
 *    ★剛体の同一部位を追えている保証が無い（★指示書 §3 F-G1）。
 */
export function horseFramePlacement(
  set: HorsePlacementSet,
  frame: HorsePlacementFrame,
  index: number,
): HorsePlacement {
  const feetFromAnchor = frame.frameHeightSourcePx - frame.anchorYSourcePx;
  if (set.mode === 'measured-ground') {
    /**
     * ★**組ごとの浮きをここで掛けます**（★2026-09-10・★裁定 R1-b）。
     *   ★画面のつまみは ★この結果に対する倍率として、★描画側で別に掛かります。
     */
    const bob = set.bob ?? 1;
    return {
      referenceHeight: set.referenceHeight,
      bodyLiftSourcePx: feetFromAnchor
        + groundGapSourcePx(set.feetRatio, frame.lowRatio, set.canvasHeightSourcePx) * bob,
    };
  }
  return {
    referenceHeight: set.referenceHeight * legacyScaleFix(set.legacyMedianAnchorWidth ?? 0, frame),
    bodyLiftSourcePx: feetFromAnchor + (set.legacyFlightLiftSourcePx?.[index] ?? 0),
  };
}

/**
 * ★**検証台の配置式**（★`sprite-client.tsx` の実装をそのまま式にしたもの）。
 *   ★`y = 地面 − 画布高 × FEET + 画布高 × (FEET − low) × (1 − bob)`
 *
 * ★本編の配置と突き合わせるためだけに置く。★描画には使わない。
 * ★返すのは ★**画布の上端**の画面 y。
 */
export function benchCanvasTopY(
  groundY: number,
  canvasHeightOnScreen: number,
  feetRatio: number,
  lowRatio: number,
  bob: number,
): number {
  return groundY - canvasHeightOnScreen * feetRatio
    + canvasHeightOnScreen * (feetRatio - lowRatio) * (1 - bob);
}
