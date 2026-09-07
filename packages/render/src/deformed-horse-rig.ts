/**
 * ★デフォルメ馬 — ★**リグ計算**（4 層分離の ★②）
 *
 * 【★この層が答える問い】
 *   ★「★**いま、どの脚が地面に着いていて、その蹄は世界のどこに刺さっているか**」
 *
 * 【⚠️ ★これが無かったので、横滑りが直せませんでした】
 *   ★従来は ★**ポーズ別に起こした絵**を並べており、★脚の位置は絵の中にしかありません。
 *   ★コードは「どの脚が接地しているか」も「蹄がどこに在るか」も持っていません。
 *   → ★**滑りを「調整」する場所が存在しない**のが、横滑りが残った理由の候補です。
 *
 * 【★仕掛け — ★滑りを「見えにくく」ではなく「式で 0 に」する】
 *   ★接地している間、★**蹄の世界座標を動かしません。**
 *   ★画面の位置は「★固定した世界座標 − カメラ」なので、
 *   ★**背景とまったく同じ速さで後ろへ流れます。**
 *   ★速度が変わっても、★時間が圧縮されても崩れません（★式の帰結）。
 *
 * 【★憲法4（決定論）】
 *   ★時刻も乱数も使いません。★**進んだ距離と馬番だけ**で決まります。
 *   ★`Date.now()` / `Math.random()` を呼びません。
 *   ★30fps でも 60fps でも、★同じ距離なら同じ姿勢です。
 */

import type { DeformedHorseContract, DeformedLegBones, DeformedLegId } from './deformed-horse-parts.js';
import {
  DEFORMED_LEG_IDS, DEFORMED_STAND_BEND, DEFORMED_FLIGHT_RISE_M, legReachM,
} from './deformed-horse-parts.js';

/** ★歩法の定義（★1 完歩を 0〜1 として） */
export interface DeformedGait {
  /** ★1 完歩で進む距離 [m] */
  readonly strideM: number;
  /** ★1 本の脚が接地している割合（0〜1）。★`duty × strideM` が掃き幅 */
  readonly duty: number;
  /** ★各脚が接地を始める位相（0〜1） */
  readonly contactStart: Readonly<Record<DeformedLegId, number>>;
}

/**
 * ★**位相の個体差**（★既存式の流用・R-30）。
 *
 *   ★`apps/web/src/app/race/page.tsx` が既に `gate * 2.96`（★ラジアン）を使っています。
 *   ★こちらは完歩を 0〜1 で扱うので、★**同じ値を完歩に直して**使います。
 *   ⚠️ ★新しい定数を選び直していません。★**全馬が同位相にならない**ことだけが要件です（§4-1）。
 */
export const DEFORMED_GATE_PHASE_RAD = 2.96;

/**
 * ★**歩法 v0**
 *
 * 【⚠️ ★この 2 つの数は「目で決める値」です（★Gate 0B）】
 *   ★`strideM` と `duty` は釣り合いの中にあります:
 *
 *   | 動かす向き | ★得るもの | ★失うもの |
 *   |---|---|---|
 *   | ★`strideM` を伸ばす | ★1 秒あたりの完歩が減る（★脚が落ち着く） | ★掃き幅が広がり、★**脚が届かなくなる**（検定⑤）|
 *   | ★`strideM` を詰める | ★短い脚で届く | ★**完歩が速くなり、30fps でコマが足りなくなる** |
 *   | ★`duty` を増やす | ★接地が増え、★浮いている時間が減る | ★掃き幅が広がる（同上）|
 *
 *   ★16m/s のとき `strideM: 6.0` は ★**2.7 完歩/秒 = 11.2 コマ/完歩（30fps）**。
 *   ★参考: 既存の実馬寄りの値は `BROADCAST_STRIDE_M = 7`（★2.3 完歩/秒）。
 *   ⚠️ ★**7 をそのまま使えません** — ★短脚では掃き幅 `0.20 × 7 = 1.4m` の半分 0.70m が
 *      ★脚の届く範囲 0.72m をほぼ使い切り、★接地の端で脚が伸び切ります。
 */
export const DEFORMED_GAIT_V0: DeformedGait = {
  strideM: 4.6,
  duty: 0.17,
  contactStart: {
    hindFar: 0.00,
    hindNear: 0.15,
    foreFar: 0.36,
    foreNear: 0.51,
  },
};

/** ★小数部（★負の数でも 0〜1 に入ること） */
export function fract(v: number): number {
  return v - Math.floor(v);
}

/** ★完歩の位相（0〜1）。★**進んだ距離と馬番だけ**から決まります */
export function gaitPhase(travelM: number, gate: number, gait: DeformedGait = DEFORMED_GAIT_V0): number {
  const perGate = (gate * DEFORMED_GATE_PHASE_RAD) / (Math.PI * 2);
  return fract(travelM / gait.strideM + perGate);
}

/** ★その脚の中での位相（0 = 着地の瞬間） */
export function legPhase(phase: number, leg: DeformedLegId, gait: DeformedGait = DEFORMED_GAIT_V0): number {
  return fract(phase - gait.contactStart[leg]);
}

/** ★接地しているか */
export function legInContact(legU: number, gait: DeformedGait = DEFORMED_GAIT_V0): boolean {
  return legU < gait.duty;
}

/**
 * ★接地の重み（0〜1）。★接地の中央で 1、★端で 0。
 *   ★胴体の高さを ★**接地している脚から**求めるときの配分に使います（③）。
 */
export function legSupportWeight(legU: number, gait: DeformedGait = DEFORMED_GAIT_V0): number {
  if (!legInContact(legU, gait)) return 0;
  return Math.sin(Math.PI * (legU / gait.duty));
}

/** ★遊脚の進み方。★端で速度 0（★着地の瞬間に前へ滑らないため） */
function swingEase(v: number): number {
  return v * v * (3 - 2 * v);
}

/**
 * ★**蹄の世界座標**（★x [m]）。
 *
 *   ★接地中 … ★**定数**（★これが滑り 0 の中身）
 *   ★遊脚中 … ★次の着地点へ、★端で速度 0 の曲線で進む
 *
 * ⚠️ ★`travelM` は**見た目の進行距離**を渡してください（★時間圧縮を打ち消した後の値）。
 *    ★実時計の距離を渡すと、★背景と脚がずれます。
 */
export function hoofWorldX(
  travelM: number,
  gate: number,
  leg: DeformedLegId,
  bones: DeformedLegBones,
  gait: DeformedGait = DEFORMED_GAIT_V0,
): number {
  const u = legPhase(gaitPhase(travelM, gate, gait), leg, gait);
  /**
   * ★着地する位置は ★**付け根の真下 + 掃き幅の半分 + 寄せ**。
   *   ★こうすると接地の間、蹄は付け根の前 `half` から後ろ `half` まで**対称に**掃きます。
   */
  const plantOffset = bones.hip.x + sweepHalfM(gait) + bones.plantBiasM;
  /** ★着地した瞬間の世界座標。★接地中は `travelM − u × stride` が動きません */
  const plant = travelM - u * gait.strideM + plantOffset;
  if (u < gait.duty) return plant;
  const v = (u - gait.duty) / (1 - gait.duty);
  /**
   * ★**宙にある間だけ、掃き幅の外へ伸ばします**（★`overreachM`・2026-09-06）。
   * ⚠️ ★`sin(2πv)` は `v = 0` と `v = 1` で **0** なので、
   *    ★**離地点と着地点は動きません** → ★接地中の滑り 0 は壊れません。
   */
  const over = bones.overreachM ?? 0;
  return plant + gait.strideM * swingEase(v) - over * Math.sin(2 * Math.PI * v);
}

/** ★胴体から見た蹄の前後位置 [m]（★描く側が使うのはこちら） */
export function hoofLocalX(
  travelM: number,
  gate: number,
  leg: DeformedLegId,
  bones: DeformedLegBones,
  gait: DeformedGait = DEFORMED_GAIT_V0,
): number {
  return hoofWorldX(travelM, gate, leg, bones, gait) - travelM;
}

/** ★蹄の高さ [m]。★接地中は 0 */
export function hoofY(
  travelM: number,
  gate: number,
  leg: DeformedLegId,
  bones: DeformedLegBones,
  gait: DeformedGait = DEFORMED_GAIT_V0,
): number {
  const u = legPhase(gaitPhase(travelM, gate, gait), leg, gait);
  if (u < gait.duty) return 0;
  const v = (u - gait.duty) / (1 - gait.duty);
  return bones.liftM * Math.sin(Math.PI * v);
}

/** ★接地している脚の本数（★`measure-gallop.mjs` が実素材で測っている量と同じ） */
export function supportCount(travelM: number, gate: number, gait: DeformedGait = DEFORMED_GAIT_V0): number {
  const phase = gaitPhase(travelM, gate, gait);
  let n = 0;
  for (const leg of DEFORMED_LEG_IDS) {
    if (legInContact(legPhase(phase, leg, gait), gait)) n += 1;
  }
  return n;
}

/** ★掃き幅の半分 [m]。★これが脚の届く範囲を超えたら幾何が破れます */
export function sweepHalfM(gait: DeformedGait = DEFORMED_GAIT_V0): number {
  return (gait.duty * gait.strideM) / 2;
}

/**
 * ★**幾何が成り立っているか**（★検定⑤が呼びます）。
 *
 * 【⚠️ ★最初これを間違えました（★2026-09-03・検定が落ちて分かりました）】
 *   ★当初は ★**水平の距離だけ**を脚の長さと比べていました。★**足りません。**
 *   ★接地中の蹄は地面（y = 0）に在り、★付け根は高さ `h` に在るので、
 *   ★脚が張らねばならないのは ★**斜辺**です:
 *
 *       ★必要な長さ = √( 前後のずれ² + 付け根の高さ² )
 *
 *   ★水平だけで見ていたため、★`hindFar` が脚長の **1.223 倍**を要求する歩法を
 *   ★「合格」と報告していました。★**検定が無ければ、そのまま絵にしていました。**
 *
 * 【★いちばん苦しい瞬間】
 *   ★**接地の端**（前後のずれが最大）で、★**胴体がいちばん高い**とき。
 *   ★接地の端では支えが弱く、胴体は浮いている側の高さに近いので、
 *   ★`浮いているときの高さ` で見ます（★楽な側で判定しない）。
 */
export function gaitFitsLegs(
  contract: DeformedHorseContract,
  gait: DeformedGait = DEFORMED_GAIT_V0,
  margin = 0.97,
  standBend: number = DEFORMED_STAND_BEND,
): {
  readonly ok: boolean; readonly worstLeg: DeformedLegId;
  readonly needM: number; readonly haveM: number; readonly hipHeightM: number;
} {
  const half = sweepHalfM(gait);
  let worstLeg: DeformedLegId = DEFORMED_LEG_IDS[0];
  let worstSlack = Number.POSITIVE_INFINITY;
  let needOut = 0;
  let haveOut = 0;
  let hipOut = 0;
  for (const leg of DEFORMED_LEG_IDS) {
    const bones = contract.legs[leg];
    const reach = legReachM(bones);
    /** ★接地の端での前後のずれ（★掃きは付け根中心に ±half・そこへ寄せが乗る） */
    const dx = half + Math.abs(bones.plantBiasM);
    /** ★いちばん高いときの付け根の高さ（★浮いている側） */
    const hip = reach * standBend + DEFORMED_FLIGHT_RISE_M;
    const need = Math.hypot(dx, hip);
    const have = reach * margin;
    const slack = have - need;
    if (slack < worstSlack) {
      worstSlack = slack;
      worstLeg = leg;
      needOut = need;
      haveOut = have;
      hipOut = hip;
    }
  }
  return { ok: worstSlack >= 0, worstLeg, needM: needOut, haveM: haveOut, hipHeightM: hipOut };
}
