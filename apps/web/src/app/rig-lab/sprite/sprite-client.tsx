/**
 * ★スプライト方式の検証台（★2026-09-05）
 *
 * 【★何を確かめる台か】
 *   ⚠️ ★**絵を作る台ではありません。** ★**発注書に書く数値を実測で決める台**です。
 *   ★別プロジェクト `sevendays` の `RaceRun.tsx` が同じ役割で、そこでの言い方:
 *   　「目的は絵を作ることではなく、★**発注書に書く数値を実測で決めること**」
 *
 * 【★sevendays から持ち込んだ規約】（★`HORSE_VISUAL_SYSTEM.md` / `lib/race-run/draw.ts`）
 *   ★8 コマ × 無彩色の層 × 512px 正方 × 接地線を全コマで統一
 *   ★体は**無彩色**で焼き、★**色はエンジンが乗せる**（12 頭の色違いが 1 組で作れる）
 *   ★コマは**時間ではなく走行距離**から選ぶ（★時間だと速度を変えたとき滑る）
 *   ★位相は馬番から `(馬番 × 0.618) % 1`
 *   ★接地点は画像の上から **0.920**
 *   ★位置は**整数 px**（★サブピクセル移動が「動くと滲む」の正体）
 *
 * 【★背景は STAR の既存素材です（★2026-09-05・オーナー指摘「もっと競馬らしく」）】
 *   ★2D を選んだ理由がまさにこれで — ★**背景・カット割り・HUD が既にある**。
 *   ★`apps/web/public/art/parallax/backstretch-side-v1/`（★9 層・奥行き付き）を、
 *   ★`@star/render` の `drawParallaxPlate` で ★**本番と同じ式**で流します（R-30）。
 *   ⚠️ ★層は**速度ではなく走行距離**で流すこと（★決定論・`parallax-plate.ts` の警告）。
 *
 * 【★この素材の出どころ】
 *   ★購入リグ（$35）を ★**Blender で 8 コマ × 4 層に焼いた**もの
 *   （`tools/blender/race_render.py -- --sprites`）。
 *
 * 【⚠️ ★1 完歩は 7m ではありません】
 *   ★sevendays と STAR は共に `STRIDE_M = 7` を採っていますが、★それは**その素材の値**です。
 *   ★この購入クリップを Blender 上で実測すると:
 *   　★接地中の蹄 **2.437 m/s**（等倍）× 1 完歩 **47 コマ / 30fps** = ★**3.818 m**
 *   ★7m で描くと ★**蹄が滑ります**。★素材ごとに測ること。
 *
 * 【⚠️ ★開発専用】★本番では 404。★購入素材は配信しません。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  drawParallaxPlate, replayPositionModel, ovalCourse, homeStretchMetersOf,
  climaxDisplayPositions, drawStandings, drawHorseNamePlates, drawResultsBoard,
  frameRoleOf,
  type ParallaxLayer, type ParallaxPlate, type PositionModel,
} from '@star/render';
import { resolveRace, replayOf, paceOf, DEFAULT_RACE_BALANCE, laneAt } from '@star/race-engine';
import { raceSetupFromParam } from '@star/scheduler';
import type { Strategy } from '@star/sim-engine';
import POOL from '../../../lib/watch-pool.json';

/**
 * ★コマ数。
 * ⚠️ ★2026-09-06 の 4 拍ギャロップ版から ★**16 コマ**です。
 *    ★8 コマでは 4 拍（前後 4 本が 1 本ずつ着地）と空中期を表現できません。
 *    ★エンジンは**距離からコマを選ぶ**ので、コマ数を変えても他に影響しません。
 */
const SRC_FRAMES = 8;
/**
 * ★素材 1 枚の寸法。
 *
 * ⚠️ ★**正方に押し込んでいたのが、体型が崩れて見えた原因でした**（★2026-09-06）。
 *    ★16 コマの外接矩形は ★**横 1750 × 縦 950（1.85 : 1）**です。
 *    ★これを正方に収めると、★**馬の高さは正方の 53.9% しかありません**。
 *    ★その結果、★「馬の高さ 34%」と表示していても実際は画面の **18.3%** で、
 *    ★同じ設定でも ★**本来の半分強の大きさ**でしか描かれていませんでした。
 *    ★解像度も半分に落ちていました。
 * → ★**長方形のまま扱います。** ★寸法は `sprite.json` から読みます（★書き写さない）。
 */
const SRC_PX = 512;
/**
 * ★**着色を焼く解像度**。
 *
 * ⚠️ ★16 コマにした直後、★**画面が真っ白のまま止まりました**。
 *    ★6 頭 × 16 コマ × 4 層 = ★**384 枚**を 512px で焼くと約 400MB になり、
 *    ★8 コマのときの 2 倍でブラウザが持ちませんでした。
 * → ★描画は最大でも 360px なので、★**256px で焼けば足ります**（★約 100MB）。
 *   ★元の無彩色は 512px のまま使うので、★輪郭は 512px の解像度で出ます。
 */
const BAKE_PX = 256;
/**
 * ★着色済みを詰める 1 マスの大きさ。
 *
 * ⚠️ ★16 コマにした直後、★**画面が「素材を読み込み中…」のまま止まりました**。
 *    ★原因は通信でも計算でもなく、★**キャンバスの枚数**です。
 *    ★6 頭 × 16 コマ × 4 層 = ★**384 枚**を作ると、★ブラウザの上限に当たります
 *    （★8 コマのときは 192 枚で、ぎりぎり通っていました）。
 * → ★**馬ごとに 1 枚の大きなキャンバスへ詰めます**（★6 枚に減ります）。
 *   ★描くときは、そこから該当のマスだけを切り出します。
 */
const SPRITE_DIR = '/rig-lab-assets/sprites';
/**
 * ★着色を焼くマスの高さ。
 *
 * ⚠️ ★192 では ★**元絵の鮮明さを自分で捨てていました**（★2026-09-07・レビュー指摘）。
 *    ★素材は 576px なのに 192px（★1/3）へ縮めて焼き、★1 頭表示では約 448px へ拡大 —
 *    ★顔と輪郭のぼけは ★**素材ではなく表示経路**が原因でした。
 * → ★**素材の高さのまま焼きます**（★縮小も拡大もしない）。
 *
 * ★枚数の心配は要りません。★素材が 1 枚絵になったので、★1 コマ 4 層 → **1 層**になり、
 *   ★詰め先の幅も 1/4 で足ります（★下の `atlas.width`）。★実測でメモリは増えていません。
 */
const CELL_H = 576;
/** ★接地点（★画像の上端から下へ）*/
const FEET = 0.920;
/**
 * ★**コマごとの上下動**（★画像の高さに対する割合。★負が上）
 *
 * ⚠️ ★再納品版は ★**全 8 コマの最下端が 467〜468px（幅 1px）**に揃えられており、
 *    ★**宙に浮く局面が消えています**。★このまま描くと ★**滑って走る**ように見えます。
 *
 * ⚠️ ★**発注書の書き方が悪かったためです。** ★§3 に「接地線を全コマで統一」と書いたので、
 *    ★**全コマの最下端を接地線へ貼り付ける**と読まれました。
 *    ★本来は「★**接地している蹄が来る基準線**」の意味でした。
 *
 * → ★初回納品（★最下端 354〜416px・幅 62px = 画像の 12.1%）が**描いていた上下動**を、
 *   ★ここで戻します。★`sevendays/bake.ts` も同じ考え方で `dy` を持っています（★⑤ 上下ジッター補正）。
 */
const FRAME_DY = [-0.0076, 0.0276, 0.0256, -0.0427, 0.0667, -0.0310, -0.0544, 0.0159] as const;
/**
 * ★正方に収めた実寸 [m]。
 *   ★納品物の馬体長は **約 370px**（★512px 正方のうち）。★馬体長を 2.4m（`HORSE_LENGTH_M`）
 *   ★とみなすと、★正方の一辺は 512/370 × 2.4 ≒ **3.32m**。
 */
const SPAN_M = 3.32;
/**
 * ★1 完歩の距離 [m] の**初期値**。
 *   ★発注書 §5 の指定「★馬体長の約 2.2 倍」＝ 2.4 × 2.2 = **5.28m**。
 * ⚠️ ★これは**見当**です。★画面のスライダーで動かし、★**蹄が滑らない値**を目で決めます
 *    （★この台の目的がそれです）。
 */
const STRIDE_M_DEFAULT = 5.60;

/**
 * ★**芝の明るさの段階**（★2026-09-07・調査 REPORT_P4_RACE_BACKGROUND_STUDY）
 *   ★0 = 納品のまま（★実測 明るさ 0.36〜0.45）
 *   ★1 = 参考映像の水準（★実測 明るさ 0.72〜0.86）
 * ⚠️ ★どれが良いかは ★**オーナーの目で決めます**。★数値では決められません。
 */
const TURF_STEPS = [
  { lift: 0, flat: 0, label: '納品のまま' },
  { lift: 1, flat: 0, label: '明るく' },
  { lift: 1, flat: 1, label: '明るく＋平らに' },
] as const;

/**
 * ★**奥の層を隠す境目**（★2026-09-07・調査 REPORT_P4_RACE_BACKGROUND_STUDY）
 *   ★参考映像は、★走行中の画面に ★**空・スタンド・観客がほとんど写りません**
 *   （★62 コマの実測: ★緑が画面の中央値 65%・★空が 5% を超えるのは 14 コマだけ）。
 * ⚠️ ★層の名前で選びません（★素材を差し替えたら合わなくなる）。★奥行きで選びます。
 *   ★この素材では 木立 160m・スタンド 70m ／ 植込み 30m・ラチ 18/10/-13m・芝 3/-3/-8m。
 */
const FAR_LAYER_M = 60;

/**
 * ★**完成候補**（★2026-09-07・レビュー裁定「オーナーにつまみの最適値を決めさせる前に、
 *   ★開発側で推奨する完成候補を作ってください」）
 *
 * ⚠️ ★つまみを増やすのをやめました。★1 つずつ足していく候補にして、
 *    ★**何が効いたか**が分かる形にします。★オーナーが選ぶのは「どの画面が良いか」だけです。
 */
const LOOKS = [
  { label: '① 納品のまま', turf: 0, far: false, light: false, contact: false, bob: 0.3 },
  { label: '② ＋芝を明るく', turf: 1, far: true, light: false, contact: false, bob: 0.3 },
  { label: '③ ＋光を揃える', turf: 1, far: true, light: true, contact: false, bob: 0.3 },
  { label: '④ ＋接地感', turf: 1, far: true, light: true, contact: true, bob: 0.3 },
] as const;

/**
 * ⚠️ ★**芝を「平らに」してはいけません**（★2026-09-07・オーナー実見）
 *   ★参考映像の芝に草の質感が無かったので、★`flattenTurf` で粒を消しました。
 *   ★オーナー評: ★**「②③④ 全て明るさは上がりますが、ぼやけていて芝の質感がないです」**
 *   → ★候補は ★**明るさだけ**（`turf: 1`）にします。★質感は納品のまま残します。
 *   ★`flattenTurf` は `TURF_STEPS[2]` に残していますが、★候補からは外しています。
 */

/**
 * ★**場の光を馬に当てる**（★2026-09-07）
 *
 * 【★なぜ要るか】
 *   ★芝を明るくしたぶん、★**馬が日陰にいるように見えます**
 *   （★レビュー評「背景の上にキャラクターを置いた印象」）。
 *
 * 【⚠️ ★数値の目標は立てられませんでした（★開発側の測り違い・撤回）】
 *   ★最初「参考映像は 馬 0.53 / 芝 0.73 ＝ 比 1.37 倍」と書きましたが、
 *   ★その箱には ★**騎手の白いズボン**が入っていました。★色（茶）で拾い直すと、
 *   ★今度は ★**ダート（薄茶）**が混ざり 0.71 になります。
 *   → ★圧縮された録画から馬体だけを分けることはできません。
 *     ★**「参考映像と同じ比にした」とは言えません。**★どこが良いかはオーナーの目で決めます。
 *
 * 【★どう当てるか】
 *   ★中間調だけを γ で持ち上げます。★補助光（底上げ）は使いません。
 *   ⚠️ ★最初 γ0.65＋補助光0.14 にしたら、★**黒い輪郭線まで 0.23 に浮いて**
 *      ★馬が灰色にぼやけました（★オーナーに見せる前に実見で気づきました）。
 *   → ★暗い画素（★輪郭線）は触りません。★実測で輪郭は 0.04 のまま、
 *     ★毛は 0.26〜0.32 → ★**0.34〜0.43** に上がります。
 */
const LIGHT_GAMMA = 0.60;
/** ★これより暗い画素は輪郭線とみなし、★持ち上げません */
const LIGHT_KEEP_DARK = 0.16;
function applySceneLight(a: Uint8ClampedArray, w: number, h: number): void {
  for (let k = 0; k < w * h; k += 1) {
    const i = k * 4;
    if (a[i + 3]! < 8) continue;
    const r = a[i]!; const g = a[i + 1]!; const b = a[i + 2]!;
    const mx = Math.max(r, g, b) / 255;
    if (mx === 0 || mx < LIGHT_KEEP_DARK) continue;
    const lit = Math.min(1, Math.pow(mx, LIGHT_GAMMA));
    /** ★明るさだけ上げ、★色味の比は保ちます（★陰影と立体が壊れません） */
    const f = lit / mx;
    a[i] = Math.round(Math.min(255, r * f));
    a[i + 1] = Math.round(Math.min(255, g * f));
    a[i + 2] = Math.round(Math.min(255, b * f));
  }
}


/** ★背景素材の置き場（★既存・本番の `/race` と同じもの） */
const PARALLAX_DIR = '/art/parallax/backstretch-side-v1';
/**
 * ★プレートの枠取り。★`broadcast-v2-scene.ts` の既定値をそのまま使います（R-30・数値を作らない）。
 */
const PLATE_ZOOM = 1.12;
const PLATE_ANCHOR = 0.48;
/**
 * ★注視点（馬群）の深さ [m]。
 *   ★`shot-sequence.ts` の `side-pack`（★横からの馬群ショット）の
 *   ★カメラ位置 backM 34 / upM 10 / sideM 12 から √(34²+10²+12²) ≒ **37.4m**。
 * ⚠️ ★ここで新しい数を作っていません。★既存のショット定義から引いています。
 */
const PACK_DEPTH_M = 37.4;

type Layer = 'coat' | 'mane' | 'silk' | 'cap' | 'tack';
/** ★描く順（★先が奥）。★`tack`（蹄・鞍・肌）は色を変えないので最後 */
const LAYERS: readonly Layer[] = ['coat', 'mane', 'silk', 'cap', 'tack'];

/** ★色は `palette.json` が唯一の出どころ（★16 進をここに書かない）*/
/**
 * ★見比べ用の 4 頭（★2026-09-06・オーナー指示「4 頭くらいにして色を全部完成させて」）
 *
 * ⚠️ ★6 頭だと重なって 1 頭ずつ見えませんでした。★毛色・勝負服・帽子（枠色）が
 *    ★はっきり違う 4 組を `palette.json` から選んでいます（★16 進をここに書かない）。
 */
/**
 * ★**本物のレースを走らせる**（★2026-09-08）
 *
 * 【★なぜ検証台でやるか】
 *   ★等間隔の 4 頭では ★**「競馬の映像として魅力的か」を判断できません**
 *   （★レビュー裁定 2026-09-07）。★競り合い・前後の重なり・カメラの追従が要ります。
 *   ★本番 `/race` に入れるには ★**4 視点ぶんの素材（96 回の生成）**が要るので、
 *   ★先に ★**生成ゼロで中身だけ**を繋いで、★投資する前に確かめます。
 *
 * 【★新しく作らないこと】
 *   ★隊列・前後関係・競り合いは ★**既にある層をそのまま呼びます**:
 *     ★`replayPositionModel`（★脚質から道中を作る・走破タイムから作らない）
 *     ★`climaxDisplayPositions`（★最後の直線の攻防。★着順は 1 ビットも変えない）
 *   ⚠️ ★ここで位置を作り直さないこと。★作ると本番と別物になります。
 *
 * 【★決定論】★シードは固定です（★憲法4・`Math.random()` を呼びません）。
 */
const RACE_SEED = 42;
const RACE_SETUP = raceSetupFromParam(null).setup;
const RACE_DIST = RACE_SETUP.distanceM;
const RACE_FIELD = 12;
const RACE_STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];

interface RaceRow {
  readonly gate: number; readonly place: number;
  readonly timeSec: number; readonly margin: string;
}
function buildRace(): {
  model: PositionModel; straightM: number;
  finishPos: Map<number, number>; result: readonly RaceRow[];
} {
  const start = (RACE_SEED * 13) % Math.max(1, POOL.length - RACE_FIELD);
  const entrants = POOL.slice(start, start + RACE_FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: RACE_STRATS[(i + RACE_SEED) % 4]!, condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `rig-lab-${RACE_SEED}`, distance: RACE_DIST, surface: 'turf' as const,
    course: RACE_SETUP.spec, trackCondition: 'good' as const,
    courseShape: 'oval' as const, baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed: RACE_SEED, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);
  const course = ovalCourse(RACE_DIST, { ...RACE_SETUP.spec, turn: RACE_SETUP.turn });
  const straightM = homeStretchMetersOf(course);
  const model = replayPositionModel({
    distanceMeter: RACE_DIST, spurtMetersLeft: 800, straightMetersLeft: straightM, boundaries,
    strategyOf: (g) => entrants[g - 1]!.strategy,
    laneOf: (gate, metersLeft) => laneAt(gate, entrants.length, metersLeft, RACE_DIST, RACE_SEED,
      RACE_SETUP.spec.widthM, undefined, RACE_SETUP.spec),
    pace,
    formationSeed: RACE_SEED * 2654435761,
  });
  /** ★確定着順（★`climaxDisplayPositions` が要ります。★見た目の順位ではありません） */
  const finishPos = new Map<number, number>();
  result.order.forEach((e, i) => { finishPos.set(Number(e.horseId), i + 1); });
  /**
   * ★**着順・走破タイム・着差はエンジンのものを読むだけ**（★2026-09-08）。
   * ⚠️ ★最初は「レース全体の秒数」を全馬に渡し、★着順も馬番順にしていました。
   *    → ★着順ボードが ★**全馬 1:42.5・全馬 0.0 馬身差**という嘘の表になりました。
   *    ★エンジンは `timeSec` と `marginLabel`（★前の馬との差）を持っています。
   */
  const rows: RaceRow[] = result.order.map((e, i) => ({
    gate: Number(e.horseId), place: i + 1,
    timeSec: e.timeSec, margin: e.marginLabel === '' ? '—' : e.marginLabel,
  }));
  return { model, straightM, finishPos, result: rows };
}

/**
 * ★**真横だけで組んだカット割り**（★2026-09-08）
 *
 * 【★なぜ真横だけか】
 *   ★本番の台本 `SCRIPT_V6` は ★**真横 53% ＋ 斜め前 47%**。★斜め前の素材はまだ無く、
 *   ★作るには ★**4 視点 × 3 タイプ = 96 回の生成**が要ります。
 *   → ★**投資する前に「カットが変わると競馬らしくなるか」を確かめます。**
 *
 * 【★数値は発明しません — ★`broadcast-v2.ts` の実測をそのまま使います】
 *   ★同ファイル :203 の記録:
 *     ★「★カットが切り替わると一気にクオリティが下がる」の正体は
 *       ★**同じ絵を毎カット別の倍率で拡大縮小**していたこと（★140〜254px・1.8 倍）
 *     ★参考映像は 1 レースの中で ★**10%（引き）〜 55%（直線の寄り）**を行き来する
 *     ★STAR は全カットが 21.6〜27.4% に固まっていた
 *     → ★**足りないのは「大きさ」ではなく「大きさの幅」**
 *   ★合格と言われた 2 つ: ★`finish-line` 25.2% ／ ★`start-front` 28.3%
 *   ★直線の寄り（`SIDE_HOMESTRETCH`）は ★**55%**
 *
 * 【★切り替えの位置】★`SCRIPT_V6` の距離比をそのまま使います（★時間でも乱数でもない）。
 *
 * ⚠️ ★コーナーは作れません。★この検証台の背景は ★**直線の視差板**で、
 *    ★走路の曲がりを描けません。★コーナーは本番 `/race` の透視描画の仕事です。
 */
const SIDE_CUTS: readonly {
  readonly until: number; readonly label: string;
  /** ★馬の高さ（★画面高に対する割合）。★`broadcast-v2.ts` の実測値 */
  readonly horseH: number;
  /** ★先頭馬を画面のどこに置くか（0=左端 1=右端）。★`leadFraction` と同じ考え */
  readonly lead: number;
  /** ★競り合っている所を見るか（★`focusContest`） */
  readonly contest: boolean;
  /**
   * ★**どの視点の素材を使うか**（★2026-09-08）。
   *   ★`SCRIPT_V6` のショット名にそのまま合わせています:
   *     ★`start-front` / `first-corner-front` / `fourth-corner-front` / `homestretch-front` → 斜め前
   *     ★`side-drive` / `straight-contest` / `finish-line` → 真横
   *   ★実測（★`broadcast-v2.ts` :1688）: ★台本 v6 が 50 鞍で使うのは
   *   ★**真横 53% ＋ 斜め前 47%** の 2 つだけです。
   */
  readonly view: 'side' | 'front';
}[] = [
  { until: 0.0625, label: '発走（正面）', horseH: 0.283, lead: 0.55, contest: false, view: 'front' },
  { until: 0.330, label: '1 角（正面）', horseH: 0.200, lead: 0.60, contest: false, view: 'front' },
  { until: 0.540, label: '勝負所（横追従）', horseH: 0.260, lead: 0.66, contest: false, view: 'side' },
  { until: 0.604, label: '4 角（正面）', horseH: 0.210, lead: 0.60, contest: false, view: 'front' },
  { until: 0.750, label: '直線へ（横追従）', horseH: 0.260, lead: 0.66, contest: false, view: 'side' },
  { until: 0.820, label: 'せめぎ合い', horseH: 0.550, lead: 0.66, contest: true, view: 'side' },
  { until: 0.870, label: '差し・追い込み（正面）', horseH: 0.300, lead: 0.66, contest: true, view: 'front' },
  { until: 0.940, label: 'せめぎ合い', horseH: 0.550, lead: 0.66, contest: true, view: 'side' },
  { until: 1.0, label: 'ゴール板', horseH: 0.252, lead: 0.78, contest: false, view: 'side' },
];

/** ★カットの切り替えにかける秒数（★`broadcast-v2` の `transitionSec` と同じ 0.35 秒） */
const CUT_FADE_SEC = 0.35;

/**
 * ⚠️ ★**この台では引きすぎないこと**（★2026-09-08・オーナー実見
 *    ★「離れたカメラワークはミニチュアにしか見えない」）。
 *
 *   ★参考映像の引きは 10% でも「競馬場」に見えます。★コーナー・ダート・ラチが
 *   ★**奥行きを作っている**からです。★この検証台の背景は ★**直線の視差板 1 枚**で
 *   ★奥行きがないため、★引くと「小さい馬」にしか見えません。
 *   → ★13% / 15% → ★**20% / 21%** に上げました。
 *   ★本番 `/race` は透視描画なので、★そちらでは 10% まで引けるはずです。
 */

function sideCutAt(progress: number): { cut: typeof SIDE_CUTS[number]; index: number } {
  for (let i = 0; i < SIDE_CUTS.length; i += 1) {
    if (progress <= SIDE_CUTS[i]!.until) return { cut: SIDE_CUTS[i]!, index: i };
  }
  const last = SIDE_CUTS.length - 1;
  return { cut: SIDE_CUTS[last]!, index: last };
}

/**
 * ★**レースに出る 12 頭の見た目**（★2026-09-08）
 *   ★個体タイプ 3 種 × 毛色 × 勝負服を、★馬番から決めます（★決定論・乱数を使いません）。
 *   ⚠️ ★毛色は「実質 3 群」なので、★同じ群が隣り合わないよう間を空けて配ります。
 */
/**
 * ★**馬名**（★2026-09-08）
 * ⚠️ ★実在の競走馬名を使いません（★憲法1）。★色と気性の言葉から組み立てます。
 */
const RACE_NAMES = [
  'アカツキノホシ', 'シラユキヒメ', 'クロガネオー', 'ミドリノカゼ',
  'コハクノユメ', 'ソラトビマル', 'ハヤテノオト', 'ツキノシズク',
  'コガネイナズマ', 'ユキワリソウ', 'アオイホノオ', 'ハルカゼボーイ',
] as const;

const RACE_COATS = ['coat-kage-1', 'coat-kuri-0', 'coat-ashi-1', 'coat-ao-1'] as const;
const RACE_TYPES = ['a', 'b', 'c'] as const;
const RACE_RUNNERS = Array.from({ length: RACE_FIELD }, (_, i) => ({
  gate: i + 1,
  coat: RACE_COATS[i % RACE_COATS.length]!,
  silk: `silk-${(i % 18) + 1}`,
  frame: `frame-${(i % 8) + 1}`,
  lane: i,
  type: RACE_TYPES[i % RACE_TYPES.length]!,
  name: RACE_NAMES[i] ?? `${i + 1} 番`,
}));

const RUNNERS = [
  { gate: 1, coat: 'coat-kage-1', silk: 'silk-1', frame: 'frame-3', lane: 0, type: 'a', name: RACE_NAMES[0]! },
  { gate: 3, coat: 'coat-kuri-0', silk: 'silk-3', frame: 'frame-4', lane: 1, type: 'b', name: RACE_NAMES[1]! },
  { gate: 5, coat: 'coat-ashi-1', silk: 'silk-12', frame: 'frame-5', lane: 2, type: 'c', name: RACE_NAMES[2]! },
  { gate: 7, coat: 'coat-ao-1', silk: 'silk-2', frame: 'frame-6', lane: 3, type: 'a', name: RACE_NAMES[3]! },
] as const;

/**
 * ★**個体タイプの素材**（★2026-09-08）
 *   ★育成・繁殖のゲームなので、★馬の見た目に個性が要ります。
 *   ★実測: ★毛色 20 色は ★**実質 3 群**（★鹿毛↔栗毛 31・★黒鹿毛↔青毛 20）。
 *   → ★個性は ★**体つきと白い印**で作り、★1 タイプ = 8 コマ 1 セットにしています。
 *   ★見分けられるかは `tools/measure-look-distinctness.mjs` で測ります
 *   （★下限 30.5% ／ ★A↔B 34.4%・A↔C 36.1%・B↔C 42.7%）。
 */
const TYPE_DIR = (t: string): string => `/rig-lab-assets/types/${t}`;

/**
 * ★無彩色の層に色を乗せる。
 *
 * 【⚠️ ★`multiply` は間違いでした（★2026-09-05・オーナー実見）】
 *   ★納品された馬は ★**明るい銀色**です。★そこへ濃い鹿毛を乗算すると
 *   ★**暗く濁り、輪郭線も体に沈みます**。★実際「元の絵と全然違う」となりました。
 *   ★`sevendays/bake.ts` も同じ警告を残しています —
 *   ★「独自の hue 合成で着色していた時期があり、★**濁った色**が出た」。
 *
 * → ★`color`（★色相と彩度だけを移し、★**明るさは元のまま**）を使います。
 *   ★これは HSL で「H と S を差し替え、L を残す」のと同じで、★**陰影と輪郭が壊れません**。
 *   ★暗い毛色（黒鹿毛など）は、★そのあと弱く乗算して沈めます。
 */
/**
 * ★**芝を参考映像の明るさへ寄せる**（★2026-09-07・調査 REPORT_P4_RACE_BACKGROUND_STUDY）
 *
 * 【★なぜ要るか — ★実測】
 *   ★参考映像の芝 … ★明るさ 0.72〜0.86 ／ 彩度 0.44〜0.71（★#8cd765 / #7bc963）
 *   ★STAR の芝    … ★明るさ 0.36〜0.45 ／ 彩度 0.69〜0.73（★#4b641b / #445c19）
 *   → ★**明るさが約 2 倍**違います。★デフォルメの馬を乗せると馬だけが浮きます。
 *
 * 【★どの層に当てるか】
 *   ⚠️ ★層の名前をここに書きません（★素材を差し替えたら合わなくなる）。
 *      ★`manifest.json` の `dirtLayers`（★ダートに差し替えられる層＝地面）が
 *      ★そのまま芝の層なので、★`isGround` の層だけに当てます。
 *
 * 【★強さ】
 *   ★`t = 0` で納品のまま、★`t = 1` で参考映像の水準。★オーナーが目で決めます。
 */
/**
 * ★**芝の草の粒を消して、刈り込みの帯だけ残す**（★2026-09-07）
 *
 * 【★なぜ要るか】
 *   ★参考映像の芝には ★**草の質感がありません**（★62 コマ目視）。
 *   ★幅の広い刈り込みの帯が緩く 2〜3 本走るだけです。
 *   ★STAR の芝は写真調の草地なので、★明るくすると ★**粒が余計に目立ちます**
 *   （★オーナー実見「芝の色だけでは難しい」）。
 *
 * 【★どうやるか】
 *   ★一度小さく描いてから戻します。★細かい粒は縮小で消え、★大きな帯は残ります。
 *   ★横は帯に沿うので強く、★縦は帯の境目を残したいので弱く縮めます。
 */
function flattenTurf(src: CanvasImageSource, w: number, h: number, t: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (t <= 0) { g.drawImage(src, 0, 0, w, h); return out; }
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w / (1 + 15 * t)));
  small.height = Math.max(1, Math.round(h / (1 + 3 * t)));
  const sg = small.getContext('2d')!;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, small.width, small.height);
  g.drawImage(small, 0, 0, w, h);
  return out;
}

/**
 * ★**曇天の背景を晴天にする**（★2026-09-07・オーナー実見「なぜか曇というか競馬場が暗い」）
 *
 * 【★なぜ暗いか】
 *   ★背景素材はもともと ★**「芝・良・直線残り200m・逆光」**として描かれています
 *   （★`palette.json` の `$scene`）。★曇りで逆光の場面なので、★空は白く、スタンドは暗い。
 *
 * 【★どう変えるか — ★測って決めました】
 *   ★空は ★**木立の層に 70% 焼き込まれて**います（★実測。★スタンドの層は 1%）。
 *   ★「淡くて明るい画素（彩度 0.18 未満・明るさ 0.55 超）」＝空 なので、
 *   ★そこだけ青のグラデーションへ置き換えます。★雲の明暗は残します。
 *   ★空でない所（★スタンド・木立・植込み）は、★中間調を少し持ち上げます。
 * ⚠️ ★地面（芝）には当てません。★芝は別に扱います。
 */
/**
 * ★晴れのときの芝の持ち上げ量（★0 = 納品のまま、1 = 参考映像の水準）。
 *   ★実測: ★納品 0.33 → ★0.45 で **0.47** → ★1.0 で 0.61。
 */
const SUNNY_TURF_LIFT = 0.45;

const SKY_TOP: readonly [number, number, number] = [0x3f, 0x8f, 0xd8];
const SKY_BOTTOM: readonly [number, number, number] = [0xbf, 0xdd, 0xf2];
function makeSunny(img: HTMLImageElement, withSky: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const w = c.width; const h = c.height;
  /**
   * ★**空は「上端から繋がっている淡い明るい面」だけ**（★2026-09-07）
   *
   * ⚠️ ★最初は「彩度 0.18 未満・明るさ 0.55 超」を全部空としました。
   *    ★実見すると ★**白いラチまで青く**なりました（★同じ条件に当てはまるため）。
   * → ★上端から塗りつぶしで繋がっている所だけを空とします。
   *   ★ラチは空と繋がっていないので侵しません。
   */
  const sky = new Uint8Array(w * h);
  if (withSky) {
    const pale = (k: number): boolean => {
      const i = k * 4;
      if (a[i + 3]! < 8) return false;
      const r = a[i]!; const gg = a[i + 1]!; const b = a[i + 2]!;
      const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b);
      return mx / 255 > 0.55 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.22;
    };
    const stack: number[] = [];
    for (let x = 0; x < w; x += 1) if (pale(x)) { sky[x] = 1; stack.push(x); }
    while (stack.length > 0) {
      const k = stack.pop()!;
      const x = k % w; const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (sky[nk] === 1 || !pale(nk)) continue;
        sky[nk] = 1; stack.push(nk);
      }
    }
  }
  for (let y = 0; y < h; y += 1) {
    const t = h <= 1 ? 0 : y / (h - 1);
    const r0 = SKY_TOP[0] + (SKY_BOTTOM[0] - SKY_TOP[0]) * t;
    const g0 = SKY_TOP[1] + (SKY_BOTTOM[1] - SKY_TOP[1]) * t;
    const b0 = SKY_TOP[2] + (SKY_BOTTOM[2] - SKY_TOP[2]) * t;
    for (let x = 0; x < w; x += 1) {
      const k = y * w + x; const i = k * 4;
      if (a[i + 3]! < 8) continue;
      const r = a[i]!; const gg = a[i + 1]!; const b = a[i + 2]!;
      const mx = Math.max(r, gg, b);
      const v = mx / 255;
      if (sky[k] === 1) {
        /** ★雲の明暗（v）は残したまま青へ */
        const kk = 0.75 + 0.25 * ((v - 0.55) / 0.45);
        a[i] = Math.round(Math.min(255, r0 * kk));
        a[i + 1] = Math.round(Math.min(255, g0 * kk));
        a[i + 2] = Math.round(Math.min(255, b0 * kk));
        continue;
      }
      /** ★空でない所は、★中間調だけ少し持ち上げます（★暗い輪郭は触りません） */
      if (v < 0.10) continue;
      const lit = Math.min(1, Math.pow(v, 0.82));
      const f = lit / v;
      a[i] = Math.round(Math.min(255, r * f));
      a[i + 1] = Math.round(Math.min(255, gg * f));
      a[i + 2] = Math.round(Math.min(255, b * f));
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

function brightenTurf(img: HTMLCanvasElement, t: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  if (t <= 0) return c;
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3]! < 8) continue;
    const r = a[i]! / 255; const gg = a[i + 1]! / 255; const b = a[i + 2]! / 255;
    const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b); const dd = mx - mn;
    if (mx === 0) continue;
    let hue = dd === 0 ? 0
      : mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
    hue *= 60; if (hue < 0) hue += 360;
    const sat = dd / mx;
    /** ★緑でない画素（★ラチの白・土）は触りません */
    if (dd !== 0 && (hue < 60 || hue > 170)) continue;
    const v2 = Math.min(1, mx * (1 + 0.95 * t));
    const s2 = sat * (1 - 0.25 * t);
    const h2 = (hue + 15 * t) % 360;
    /** ★HSV → RGB */
    const cc = v2 * s2; const hh = h2 / 60;
    const xx = cc * (1 - Math.abs((hh % 2) - 1)); const m = v2 - cc;
    let rr = 0; let g2 = 0; let b2 = 0;
    if (hh < 1) { rr = cc; g2 = xx; } else if (hh < 2) { rr = xx; g2 = cc; }
    else if (hh < 3) { g2 = cc; b2 = xx; } else if (hh < 4) { g2 = xx; b2 = cc; }
    else if (hh < 5) { rr = xx; b2 = cc; } else { rr = cc; b2 = xx; }
    a[i] = Math.round((rr + m) * 255);
    a[i + 1] = Math.round((g2 + m) * 255);
    a[i + 2] = Math.round((b2 + m) * 255);
  }
  g.putImageData(d, 0, 0);
  return c;
}

/**
 * ★**どの画素を塗り替えるか**（★毛色 / 勝負服）。★2 か所で使うのでここに 1 つだけ置きます。
 *
 * 【⚠️ ★勝負服の色相を 200〜260 → **176〜268** に広げた理由（★2026-09-07）】
 *   ★レビュー指摘「★帽子と勝負服に水色の塗り残しがある」を実測しました:
 *     ★青系 144,314 画素のうち ★**12.3%（17,715）が条件から漏れて**いました。
 *     ★漏れた画素の ★**色相の平均は 189** — ★下限 200 のすぐ外です。
 *     ★青のハイライトは ★**シアン側（180 前後）へ振れます**。
 *   ⚠️ ★彩度を下げるだけでは駄目でした。★実測で ★**蹄・たてがみ・ブーツ（黒）**まで
 *      ★拾ってしまいます（★黒にわずかな青みがあるため）。★色相を広げ、彩度は 0.28 に留めます。
 */
/**
 * ★**どの画素を塗り替えるか**（★毛色 / 勝負服）。★2 か所で使うのでここに 1 つだけ置きます。
 *
 * 【⚠️ ★勝負服の色相を 200〜260 → **176〜268** に広げた理由（★2026-09-07）】
 *   ★レビュー指摘「★帽子と勝負服に水色の塗り残しがある」を実測しました:
 *     ★青系 144,314 画素のうち ★**12.3%（17,715）が条件から漏れて**いました。
 *     ★漏れた画素の ★**色相の平均は 189** — ★下限 200 のすぐ外です。
 *     ★青のハイライトは ★**シアン側（180 前後）へ振れます**。
 *   ⚠️ ★彩度を下げるだけでは駄目でした。★実測で ★**蹄・たてがみ・ブーツ（黒）**まで
 *      ★拾ってしまいます（★黒にわずかな青みがあるため）。★色相を広げ、彩度は 0.28 に留めます。
 *
 * 【⚠️ ★毛色を「色相の窓」で選ぶのをやめた理由（★2026-09-07）】
 *   ★最初は 8〜48 度でした。★灰毛の馬で ★**橙色の斑**が出たので広げました。
 *   ★ところが実測すると、★塗り残しは次々と窓の外に出てきます:
 *     ★色相 0〜10 に 8,852px（★赤みの陰影）／★340〜360 に 4,552px
 *     ★色相 62〜100 に 1,775px（★黄色寄りの光沢）
 *   ★**窓を足していく追いかけっこ**になり、★どこで終わるか分かりません。
 * → ★**「勝負服でない有彩色はすべて毛」**にします。★下地は
 *   ★毛（茶）・勝負服（青）・無彩色（黒いたてがみ / 白いゼッケン）しかないので、
 *   ★これで漏れが原理的になくなります。
 */
const SILK_KEY = { satMin: 0.28, hueMin: 176, hueMax: 268 } as const;
const COAT_SAT_MIN = 0.18;
function isSilk(hue: number, sat: number): boolean {
  return sat >= SILK_KEY.satMin && hue >= SILK_KEY.hueMin && hue <= SILK_KEY.hueMax;
}
function isKeyed(coat: boolean, hue: number, sat: number): boolean {
  if (!coat) return isSilk(hue, sat);
  return sat >= COAT_SAT_MIN && !isSilk(hue, sat);
}

/**
 * ★**騎手の肌を毛色から守る**（★2026-09-07）
 *
 * 【★色では分けられません】
 *   ★実測: ★騎手の肌 ★色相 29・彩度 0.45 ／ ★馬体の毛 ★色相 30・彩度 0.50。
 *   ★灰毛・黒毛の馬で ★**騎手の顔が灰色・黒**になっていました。
 *
 * 【★大きさでも分けられません】
 *   ★実測: ★コマ 1 の顔は 596px、★毛の光沢の最大も 596px。★同じ大きさです。
 *
 * 【★「塊ごと」でも分けられません】
 *   ★明るい画素は ★**顔からたてがみ・馬の額までひと続きに繋がります**。
 *   ★1 か所でも勝負服に触れると ★**馬の額まで肌として守って**しまいました（★実測）。
 *
 * → ★**勝負服からの距離**で決めます。★騎手の顔は帽子と襟のすぐそば、
 *   ★馬の光沢は離れています。★明るく（0.80 超）かつ ★勝負服から `SKIN_NEAR_PX` 以内の
 *   ★画素だけを守ります。
 */
const SKIN_V_MIN = 0.80;
const SKIN_NEAR_PX = 24;
function skinMask(a: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const silk = new Uint8Array(w * h);
  const bright = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k += 1) {
    const i = k * 4;
    if (a[i + 3]! < 128) continue;
    const r = a[i]!; const g = a[i + 1]!; const b = a[i + 2]!;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const dd = mx - mn;
    if (dd === 0) continue;
    const sat = mx === 0 ? 0 : dd / mx;
    let hue = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    hue *= 60; if (hue < 0) hue += 360;
    if (isSilk(hue, sat)) { silk[k] = 1; continue; }
    if (sat >= COAT_SAT_MIN && mx / 255 > SKIN_V_MIN) bright[k] = 1;
  }
  /**
   * ⚠️ ★**大きな勝負服（帽子と上着）だけ**を基準にします（★2026-09-07）。
   *    ★最初は「青と判定された画素すべて」を基準にしました。★実測すると、
   *    ★**小さな青みの点が 703 個**（★馬の白目、鞍の陰など）散っており、
   *    ★その 24px 以内にある馬体の光沢まで「肌」として守り、
   *    ★黒毛の馬に ★**橙色の斑**が出ていました。
   */
  const MIN_SILK_PART = Math.round(w * h * 0.004);
  const seenSilk = new Uint8Array(w * h);
  const bigSilk = new Uint8Array(w * h);
  for (let k0 = 0; k0 < w * h; k0 += 1) {
    if (silk[k0] === 0 || seenSilk[k0] === 1) continue;
    const stack = [k0]; seenSilk[k0] = 1;
    const cells: number[] = [];
    while (stack.length > 0) {
      const k = stack.pop()!;
      cells.push(k);
      const x = k % w; const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (silk[nk] === 1 && seenSilk[nk] === 0) { seenSilk[nk] = 1; stack.push(nk); }
      }
    }
    if (cells.length >= MIN_SILK_PART) for (const k of cells) bigSilk[k] = 1;
  }
  /** ★勝負服を `SKIN_NEAR_PX` だけ太らせる（★顔と帽子の間には黒い輪郭線があり、直接は接していません） */
  let near = bigSilk;
  for (let step = 0; step < SKIN_NEAR_PX; step += 1) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const k = y * w + x;
        if (near[k] === 1) { next[k] = 1; continue; }
        if ((x > 0 && near[k - 1] === 1) || (x < w - 1 && near[k + 1] === 1)
          || (y > 0 && near[k - w] === 1) || (y < h - 1 && near[k + w] === 1)) next[k] = 1;
      }
    }
    near = next;
  }
  const skin = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k += 1) if (bright[k] === 1 && near[k] === 1) skin[k] = 1;
  return skin;
}

function tintOnto(
  g: CanvasRenderingContext2D, src: HTMLImageElement, colour: string,
  w: number, h: number, mode: 'coat' | 'silk',
): void {
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  /**
   * ★**色相で部位を選び、明るさを保って置き換えます**（★`tools/lib/dress.mjs` と同じ方式）
   *
   * 【⚠️ ★合成では駄目でした】
   *   ★`globalCompositeOperation = 'color'` は ★**画像全体**に効きます。
   *   ★2026-09-06、★それで ★**騎手の顔が青や緑**になりました。
   *   ★`dress.mjs` の冒頭にも同じ失敗が残っています —
   *   ★「私は『元の色に毛色を掛ける』方式にして **3 回壊しました**
   *   　（ゼッケンが胴体に化ける／★**騎手の顔が白くなる**／毛色が効かなくなる）」
   *
   * 【★どう選ぶか】
   *   ★毛色 … ★彩度 0.18 以上・色相 8〜48 度（★茶系）→ ★毛色へ
   *   ★勝負服 … ★彩度 0.35 以上・色相 200〜260 度（★青）→ ★勝負服／枠色へ
   *   ★それ以外（★肌・ゴーグル・頭絡・白いゼッケン・黒いたてがみ）は ★**触りません**。
   */
  const d = g.getImageData(0, 0, w, h);
  const a = d.data;
  const to = hexToRgb(colour);
  const coat = mode === 'coat';
  /** ★塗り替えた画素（★このあとの「囲まれた光沢」を埋めるのに使います） */
  const painted = new Uint8Array(w * h);
  /** ★騎手の肌（★毛色から守る）。★勝負服のときは使いません */
  const skin = coat ? skinMask(a, w, h) : new Uint8Array(w * h);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3]! < 128) continue;
    const r = a[i]!; const gg = a[i + 1]!; const b = a[i + 2]!;
    const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b); const dd = mx - mn;
    const sat = mx === 0 ? 0 : dd / mx;
    if (dd === 0) continue;
    let hue = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
    hue *= 60; if (hue < 0) hue += 360;
    /** ★明るさをそのまま移す（★陰影と立体が壊れません） */
    const v = mx / 255;
    if (!isKeyed(coat, hue, sat)) continue;
    /**
     * ⚠️ ★肌は ★**壁として登録**します（`painted`）。
     *    ★そうしないと、★このあとの `fillEnclosedHighlights` が
     *    ★「毛色に囲まれた塗り残し」として ★**顔を塗り潰します**。
     */
    if (coat && skin[i >> 2] === 1) { painted[i >> 2] = 1; continue; }
    painted[i >> 2] = 1;
    a[i] = Math.round(to[0] * v);
    a[i + 1] = Math.round(to[1] * v);
    a[i + 2] = Math.round(to[2] * v);
  }
  fillEnclosedHighlights(a, painted, w, h, to);
  g.putImageData(d, 0, 0);
}

/**
 * ★**すでに描かれている絵の上に、続けて色を当てます**（★2026-09-07）
 *   ★`tintOnto` は元画像を描き直しますが、★こちらは**今あるものに重ねて**当てます。
 *   ★1 枚絵に「毛色 → 勝負服」と順に当てるために要ります。
 */
function tintInPlace(
  g: CanvasRenderingContext2D, colour: string, w: number, h: number, mode: 'coat' | 'silk',
): void {
  const d = g.getImageData(0, 0, w, h);
  const a = d.data;
  const to = hexToRgb(colour);
  const coat = mode === 'coat';
  /** ★塗り替えた画素（★このあとの「囲まれた光沢」を埋めるのに使います） */
  const painted = new Uint8Array(w * h);
  /** ★騎手の肌（★毛色から守る）。★勝負服のときは使いません */
  const skin = coat ? skinMask(a, w, h) : new Uint8Array(w * h);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3]! < 128) continue;
    const r = a[i]!; const gg = a[i + 1]!; const b = a[i + 2]!;
    const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b); const dd = mx - mn;
    if (dd === 0) continue;
    const sat = mx === 0 ? 0 : dd / mx;
    let hue = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
    hue *= 60; if (hue < 0) hue += 360;
    const v = mx / 255;
    if (!isKeyed(coat, hue, sat)) continue;
    /**
     * ⚠️ ★肌は ★**壁として登録**します（`painted`）。
     *    ★そうしないと、★このあとの `fillEnclosedHighlights` が
     *    ★「毛色に囲まれた塗り残し」として ★**顔を塗り潰します**。
     */
    if (coat && skin[i >> 2] === 1) { painted[i >> 2] = 1; continue; }
    painted[i >> 2] = 1;
    a[i] = Math.round(to[0] * v);
    a[i + 1] = Math.round(to[1] * v);
    a[i + 2] = Math.round(to[2] * v);
  }
  fillEnclosedHighlights(a, painted, w, h, to);
  g.putImageData(d, 0, 0);
}

/**
 * ★**勝負服に囲まれた光沢**を埋める（★2026-09-07）
 *
 * 【★なぜ色相では拾えないか】
 *   ★帽子の頂部の光沢は ★**ほぼ白**です。★白は色相が定まらないので、
 *   ★どんな色相の範囲を置いても拾えません。★実測でも、色相を 176〜268 に広げたあと
 *   ★肩・袖・つばの縁は消えましたが、★**頂部の光沢だけが青のまま残りました**。
 *
 * 【★なぜ「囲まれている」で選ぶのか】
 *   ⚠️ ★彩度を下げて拾おうとすると、★**白いゼッケンと白いズボン**まで塗ります。
 *   ★光沢は ★**四方すべてが勝負服**です。★ゼッケンやズボンは外側（★毛・鞍・背景）に
 *   ★繋がっているので、★囲まれ判定なら侵しません。
 *   ★同じ手を `tools/repair-delivered-sprites.mjs` の `clearEnclosedPlate` でも使っています。
 */
function fillEnclosedHighlights(
  a: Uint8ClampedArray, painted: Uint8Array, w: number, h: number, to: readonly [number, number, number],
): void {
  /**
   * ★**暗い画素は壁**として扱います。
   * ⚠️ ★最初は「勝負服だけを壁」にしました。★実測では ★**光沢が消えませんでした** —
   *    ★光沢のまわりには帽子の内側の線（★暗い輪郭）があり、★そこから顔・たてがみへ
   *    ★繋がってしまうためです。
   */
  const V_WALL = 0.45;
  /** ★壁の 6 割以上が勝負服の塊だけ埋めます（★白いズボン・白いゼッケンは壁がほぼ勝負服ではありません） */
  const SILK_WALL_MIN = 0.6;
  const dark = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k += 1) {
    if (a[k * 4 + 3]! < 128) continue;
    if (Math.max(a[k * 4]!, a[k * 4 + 1]!, a[k * 4 + 2]!) / 255 < V_WALL) dark[k] = 1;
  }
  const seen = new Uint8Array(w * h);
  /**
   * ★大きすぎる塊は光沢ではありません。
   * ⚠️ ★最初 1%（★約 5,500px）と置いたら、★**騎手の顔ごと塗り潰しました**（★実測）。
   *    ★顔は約 2,000px、★毛の光沢は最大 542px でした。
   * → ★**0.1%** にします。★面積比なので、★焼く解像度を変えても関係は変わりません。
   */
  const MAX = Math.round(w * h * 0.001);
  for (let k0 = 0; k0 < w * h; k0 += 1) {
    if (seen[k0] === 1 || painted[k0] === 1 || dark[k0] === 1) continue;
    if (a[k0 * 4 + 3]! < 128) { seen[k0] = 1; continue; }
    const stack = [k0]; seen[k0] = 1;
    const cells: number[] = [];
    let wallSilk = 0; let wallOther = 0; let open = false;
    while (stack.length > 0) {
      const k = stack.pop()!;
      cells.push(k);
      const x = k % w; const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx; const ny = y + dy;
        /** ★画像の端に触れたら「外に繋がっている」＝光沢ではない */
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { open = true; continue; }
        const nk = ny * w + nx;
        if (painted[nk] === 1) { wallSilk += 1; continue; }
        if (dark[nk] === 1) { wallOther += 1; continue; }
        if (a[nk * 4 + 3]! < 128) { open = true; wallOther += 1; continue; }
        if (seen[nk] === 1) continue;
        seen[nk] = 1; stack.push(nk);
      }
      if (cells.length > MAX) { open = true; break; }
    }
    /** ★途中で止めた場合も、残りは見た扱いにする（★同じ塊を二度調べない） */
    while (stack.length > 0) seen[stack.pop()!] = 1;
    const wall = wallSilk + wallOther;
    if (open || wall === 0 || wallSilk / wall < SILK_WALL_MIN) continue;
    for (const k of cells) {
      const i = k * 4;
      const v = Math.max(a[i]!, a[i + 1]!, a[i + 2]!) / 255;
      a[i] = Math.round(to[0] * v);
      a[i + 1] = Math.round(to[1] * v);
      a[i + 2] = Math.round(to[2] * v);
    }
  }
}

/** ★16 進 → RGB */
function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return [200, 200, 200];
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * ★着色のやり方。
 *   ★`coat` … 茶系（毛）を毛色へ　★`silk` … 青（勝負服）を勝負服／枠色へ
 *
 * ⚠️ ★かつて `multiply`（乗算）を「比較用」として切り替えられるようにしていました。
 *    ★**外しました**（★2026-09-07・オーナー実見「着色を押すと馬の色がおかしくなっています」）。
 *    ★押すと必ず濁る作りで、★警告も無く品質を下げるボタンでした。
 *    ★なぜ乗算が間違いかは上の `tintOnto` の注記に残してあります。★UI には戻さないこと。
 */

/**
 * ★1 頭ぶんの 1 層。
 *
 * 【⚠️ ★なぜ「無彩色」と「着色済み」を両方持つのか — ★色の濃さを毎コマ焼き直さないため】
 *   ★色の強さをスライダーで動かすたびに 6 頭 × 8 コマ × 4 層 = **192 枚の 512px** を
 *   ★焼き直すと、★**触るたびに画面が止まります**。
 *   → ★焼くのは一度だけ。★**描くときに無彩色の上へ着色済みを薄く重ねて**濃さを決めます。
 */
interface Piece {
  /** ★無彩色のまま（★`tack` はこれだけ） */
  readonly grey: HTMLImageElement;
  /**
   * ★**色が付いている画素だけ**を抜いた 1 枚（★馬によらないので全馬で共有）。
   *
   * ⚠️ ★着色対象の 4 層に、★**固定色の画素が混ざっています**（★実測 1.5〜8.3%）:
   *    ★騎手の顔と肌、★ゴーグルの金、★頭絡の茶。★`jockeyHead` は `cap` 層なので、
   *    ★そのまま染めると ★**顔が帽子と同じ色になります**（★青い顔・緑の顔になりました）。
   * → ★染めたあとに、★**色の付いていた画素だけ元の色で描き戻します**。
   */
  /** ★着色済みを詰めた 1 枚（★馬ごと）。★`tack` は色を変えないので `null` */
  readonly atlas: HTMLCanvasElement | null;
  /** ★その中でのマスの左上 */
  readonly sx: number;
  readonly sy: number;
  /** ★毛の層か（★毛だけ濃さを落とす。★勝負服と帽子は競馬の作法どおり鮮やかなまま） */
  readonly isCoat: boolean;
}

/** ★16 進の明るさ（0〜1） */
function luminanceOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return 0.5;
  const v = parseInt(m[1]!, 16);
  const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** ★コマ番号は**走行距離**から。★時間で回すと速度を変えたとき滑ります */
function frameIndexFor(travelM: number, gate: number, strideM: number): number {
  const phase = (gate * 0.618) % 1;
  const cyc = (((travelM / strideM + phase) % 1) + 1) % 1;
  return Math.floor(cyc * SRC_FRAMES) % SRC_FRAMES;
}

/** ★`manifest.json` の 1 層（★既存素材が持っている形。★ここで作った形ではありません） */
interface ManifestLayer {
  readonly name: string;
  readonly file: string;
  readonly plateY0: number;
  readonly plateY1: number;
  readonly tileWidth: number;
  readonly depthOffsetM: number;
}
interface Manifest {
  readonly plateWidth: number;
  readonly plateHeight: number;
  readonly layers: readonly ManifestLayer[];
  /** ★芝→ダートの差し替え表。★**鍵がそのまま「地面の層」の一覧**です */
  readonly dirtLayers?: Readonly<Record<string, string>>;
}

/** ★背景一式（★奥＝馬群より後ろ／手前＝馬群より前） */
interface Scenery {
  readonly plateWidth: number;
  readonly plateHeight: number;
  readonly behind: ParallaxPlate<CanvasImageSource>;
  /** ★奥の層（★空・スタンド）を外したもの。★参考映像の走行中の構成 */
  readonly behindNear: ParallaxPlate<CanvasImageSource>;
  readonly front: ParallaxPlate<CanvasImageSource>;
  /** ★馬が立つ帯（★プレート px）。★地面の層のいちばん手前から取る */
  readonly groundY0: number;
  readonly groundY1: number;
}

export default function SpriteClient(): React.ReactElement {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('素材を読み込み中…');
  const [playing, setPlaying] = useState(true);
  const [speedMps, setSpeedMps] = useState(16);
  /** ★画面に占める馬の高さ（★指示書 §5 は通常カット 18〜24%）*/
  /**
   * ★素材 1 枚の高さが画面に占める割合。
   * ⚠️ ★素材を長方形にしたので、★**馬は素材の 88.7%**（正方のときは 53.9%）です。
   *    ★0.24 で馬は画面の約 21% ＝ 指示書 §5「通常カット 18〜24%」の真ん中。
   */
  const [heightRatio, setHeightRatio] = useState(0.36);
  const [quantise, setQuantise] = useState(true);
  /**
   * ★何頭出すか（★2026-09-06・オーナー評「これが 4 頭に見えますか？」）
   *
   * ⚠️ ★間隔を「描画幅 × 0.58」で置いたら、★**4 頭が重なって 1 つの塊**になりました。
   * → ★**画面幅を頭数で割って、重ならない位置に置きます。**
   *   ★大きさも頭数に合わせて自動で決めます（★1 頭なら大きく、4 頭なら小さく）。
   */
  const [count, setCount] = useState(4);
  /** ★1 完歩の距離。⚠️ ★**この台で決める値**（蹄が滑らない所を探す）*/
  const [strideM, setStrideM] = useState(STRIDE_M_DEFAULT);
  /** ★上下動の強さ（★0 = 納品そのまま＝平ら・1 = 初回納品が描いていた量）*/
  /**
   * ★上下動の強さ。
   * ⚠️ ★**リグで姿勢をつけた素材（2026-09-06 の 8 コマ）は、絵が自分で上下します**
   *    （★最下端 1233〜1406px）。★そこへ `FRAME_DY` を足すと**二重に跳ねます**。
   *    → ★既定を **0** にしました。★平らな素材に戻したときだけ上げてください。
   */
  const [bob, setBob] = useState(0.3);
  /**
   * ★**毛色の濃さ**（★2026-09-05・オーナー指摘「色がチカチカします」）
   *
   * ⚠️ ★`palette.json` の毛色は ★**彩度 0.69〜0.82**（実測）。★これを全開で乗せると、
   *    ★明るい銀色の素材が ★**絵の具のような色**になり、★6 頭ぶんが目に刺さります。
   * → ★実際の競馬では ★**毛は低彩度（鹿毛・栗毛・芦毛）・勝負服だけが鮮やか**です。
   *   ★ここは**毛だけ**薄め、★勝負服と帽子（枠色）は鮮やかなまま残します。
   */
  /**
   * ⚠️ ★「毛色の濃さ」スライダーは ★**外しました**（★2026-09-07）。
   *    ★1 枚絵になったあと、★これは ★**キャラクター全体の透明度**として効いていました
   *    （★85% で馬と騎手が透け、★奥のラチが透けて見えていました）。
   *    ★毛色の濃さは `palette.json` の色そのもので決めます。
   */
  /** ★1m ごとの目盛り（★滑りを測るための道具。★見た目の判定では切る） */
  const [guides, setGuides] = useState(false);
  /** ★完成候補（★`LOOKS` の添字）。★つまみではなく候補で選びます */
  const [look, setLook] = useState(0);
  /**
   * ★見せ方（★2026-09-08）
   *   ★`line` … ★並べて見る（★素材の検品用）
   *   ★`race` … ★**本物のレース**（★12 頭・★エンジンが決めた位置・★競り合いつき）
   */
  const [mode, setMode] = useState<'line' | 'race'>('line');
  /**
   * ★天気（★2026-09-07・オーナー実見「なぜか曇というか競馬場が暗い」）
   *   ★背景素材はもともと「逆光・薄曇り」として描かれています。
   */
  const [sunny, setSunny] = useState(false);
  const stateRef = useRef({ playing, speedMps, heightRatio, quantise, strideM, bob, guides, count, look, sunny, mode });
  stateRef.current = { playing, speedMps, heightRatio, quantise, strideM, bob, guides, count, look, sunny, mode };
  const travelRef = useRef(0);

  const reset = useCallback(() => { travelRef.current = 0; }, []);

  useEffect(() => {
    const canvas = hostRef.current;
    if (canvas === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;
    /** ⚠️ ★512px を一気に縮めると滲みます（★sevendays の実測） */
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let cancelled = false;
    let raf = 0;
    /**
     * ★**カットの繋ぎ**（★2026-09-08・オーナー実見「カメラワークの切り替わりは唐突」）
     *
     *   ⚠️ ★私が繋ぎを実装していませんでした。★`broadcast-v2` は
     *      ★`transitionSec`（★同系統の view なら 0.35 秒のディゾルブ）を持っています。
     *   → ★切り替わる直前の画を控えておき、★0.35 秒かけて重ねて消します。
     */
    const prevShot = document.createElement('canvas');
    let prevAtSec = -99;
    let prevCutIndex = -1;
    /** ★[馬][コマ][層] の焼いた絵。★馬ごとに色が違うので、★馬ごとに焼きます */
    /** ★頭ごとの焼き上がり。★個体タイプが違うと、★縦横比も蹄の位置も違います */
    /**
     * ★頭ごとの焼き上がり。★**視点ごとに 1 組**持ちます（★2026-09-08）。
     *   ★台本 v6 が使うのは ★真横 53% ＋ 斜め前 47% の 2 つだけ（★`broadcast-v2.ts` :1688）。
     */
    type Baked = { pieces: Piece[][]; aspect: number; cellW: number; cellH: number; lowRatio: number[] };
    const baked: { side: Baked; front: Baked }[] = [];
    /**
     * ★**本物のレース**（★シード固定・★1 回だけ組み立てます）。
     *   ★エンジンが着順と位置を決め、★`replayPositionModel` が道中を作り、
     *   ★`climaxDisplayPositions` が最後の直線の攻防を乗せます。
     * ⚠️ ★ここで位置を作り直しません（★作ると本番と別物になります）。
     */
    let race: ReturnType<typeof buildRace> | null = null;
    try {
      race = buildRace();
    } catch (e) {
      /**
       * ⚠️ ★**レースの組み立てで転んでも、検証台ごと止めないこと**（★2026-09-08）。
       *    ★最初これを `try` で囲まなかったため、★例外で効果全体が止まり、
       *    ★素材の読み込みまで動かず「★素材を読み込み中…」のまま固まりました。
       */
      setStatus(`⚠️ レースを組み立てられません: ${String(e)}`);
    }
    /** ★芝の明るさ段階ごとの背景一式（★`TURF_STEPS` と同じ並び） */
    let sceneries: Scenery[] | null = null;
    /** ★HUD も同じ色を使います（★色を 2 か所で持たない） */
    const paletteRef: { cur: Record<string, string> } = { cur: {} };
    /** ★背景の読み込み状況（★馬と背景は別々に読むので、★先に終わった方が書きます） */
    let bgNote = '背景 読み込み中';
    /** ★素材 1 枚の横 ÷ 縦。★`sprite.json` から読みます（★正方と決めつけない） */
    let aspect = 1;

    const load = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

    /** ★背景（★既存素材）を読む */
    void (async () => {
      const man = await fetch(`${PARALLAX_DIR}/manifest.json`).then((r) => r.json() as Promise<Manifest>);
      const imgs = await Promise.all(man.layers.map((l) => load(`${PARALLAX_DIR}/${l.file}`)));
      if (cancelled) return;
      /**
       * ★**地面の層は manifest が知っています**（`dirtLayers` の鍵＝ダートに差し替える層）。
       * ⚠️ ★層の名前をここに書かないこと（★素材を差し替えたら合わなくなります・`parallax-plate.ts`）。
       */
      const groundNames = new Set(Object.keys(man.dirtLayers ?? {}));
      /**
       * ★**芝の明るさの段階ごとに、背景一式を先に作っておきます**（★2026-09-07）。
       *   ★スライダーを動かすたびに焼き直すと重いので、★段階ぶんだけ用意して切り替えます。
       *   ★焼き直すのは地面の層だけで、★他の層は同じ画像を使い回します。
       */
      /** ★晴天版の層（★地面以外を 1 度だけ焼いて、★段階ぶんで使い回します） */
      const sunnyOf = new Map<number, HTMLCanvasElement>();
      /** ★いちばん奥の層の奥行き（★そこにだけ空が焼き込まれています・実測で 70%） */
      const horizonM = Math.max(...man.layers.map((l) => l.depthOffsetM));
      const built: Scenery[] = [];
      for (const sunny of [false, true]) for (const step of TURF_STEPS) {
       built.push((() => {
        const behind: ParallaxLayer<CanvasImageSource>[] = [];
        const front: ParallaxLayer<CanvasImageSource>[] = [];
        /** ★空・スタンドなど、★参考映像では走行中に写らない奥の層 */
        const far = new Set<ParallaxLayer<CanvasImageSource>>();
        let groundY0 = 0; let groundY1 = 0;
        man.layers.forEach((l, i) => {
          const src = imgs[i]!;
          const ground = groundNames.has(l.name);
          let image: CanvasImageSource;
          if (ground) {
            /**
             * ★**晴れなら芝も明るくします**（★2026-09-07・オーナー実見
             *   ★「納品のまま＆芝をもう少しトーンを明るくできないですか？」）
             *   ⚠️ ★つまみは増やしません。★空だけ晴れて芝が曇天のままだと、
             *      ★同じ場所に見えません。★天気に連動させます。
             *   ★候補が既にそれ以上明るくしているときは、★そちらを優先します。
             */
            const lift = sunny ? Math.max(step.lift, SUNNY_TURF_LIFT) : step.lift;
            image = brightenTurf(flattenTurf(src, src.width, src.height, step.flat), lift);
          } else if (sunny) {
            let cached = sunnyOf.get(i);
            if (cached === undefined) {
              /** ★空を持つのはいちばん奥の層だけ（★名前ではなく奥行きで選びます） */
              cached = makeSunny(src, l.depthOffsetM >= horizonM);
              sunnyOf.set(i, cached);
            }
            image = cached;
          } else {
            image = src;
          }
          const entry: ParallaxLayer<CanvasImageSource> = {
            image,
            width: l.tileWidth, height: src.height,
            plateY0: l.plateY0, plateY1: l.plateY1,
            depthOffsetM: l.depthOffsetM, isGround: ground,
          };
          /** ★いちばん手前の地面の帯を、★馬が立つ帯とします */
          if (ground && l.plateY1 > groundY1) { groundY0 = l.plateY0; groundY1 = l.plateY1; }
          /**
           * ★**馬より手前に来る層**（★ラチ）だけ、馬の後に描きます。
           *   ★地面ではなく、★馬群（深さ 0）より手前（depthOffsetM < 0）のもの。
           * → ★手前のラチが馬の前を横切ることで、★一気に**中継の絵**になります。
           */
          if (!ground && l.depthOffsetM < 0) front.push(entry);
          else behind.push(entry);
          if (!ground && l.depthOffsetM >= FAR_LAYER_M) far.add(entry);
        });
        return {
          plateWidth: man.plateWidth, plateHeight: man.plateHeight,
          behind: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: behind },
          behindNear: {
            plateWidth: man.plateWidth,
            plateHeight: man.plateHeight,
            layers: behind.filter((e) => !far.has(e)),
          },
          front: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: front },
          groundY0, groundY1,
        };
       })());
      }
      sceneries = built;
      bgNote = `背景 ${built[0]!.behind.layers.length}+${built[0]!.front.layers.length} 層（★奥を隠すと ${built[0]!.behindNear.layers.length}+${built[0]!.front.layers.length}）`;
    })().catch(() => { setStatus('⚠️ 背景素材を読めませんでした'); });

    /** ★馬（★自前生成した個体タイプの素材）を読む */
    void (async () => {
      const palette: Record<string, string> = await fetch('/art/palette.json')
        .then((r) => r.json()).catch(() => ({}));
      paletteRef.cur = palette;
      /**
       * ★**頭ごとに個体タイプの素材を読みます**（★2026-09-08）。
       *   ★同じタイプが複数いるので、★タイプ単位で 1 度だけ読み込みます。
       */
      const loadedTypes = new Map<string, {
        raw: HTMLImageElement[]; aspect: number; cellW: number; lowRatio: number[];
      }>();
      const probe = document.createElement('canvas');
      const pg = probe.getContext('2d', { willReadFrequently: true })!;
      /**
       * ★**レースのときは 12 頭ぶん焼きます**（★2026-09-08）。
       * ⚠️ ★576px のまま 12 枚焼くと ★**1 枚 17.5MB × 12 = 210MB** になり、
       *    ★16 コマにした日と同じでブラウザが持ちません。★レース時は 288px にします
       *    （★12 頭なら画面での馬は小さいので、★これで足ります）。
       */
      const runners = mode === 'race' ? RACE_RUNNERS : (RUNNERS as readonly typeof RACE_RUNNERS[number][]);
      /**
       * ⚠️ ★**焼き直しに数秒かかることを画面に出します**（★2026-09-08・実測 約 8 秒）。
       *    ★出さないと、★押しても古い頭数のままに見えます。
       */
      setStatus(`★${runners.length} 頭ぶんを焼いています…（数秒）`);
      const cellH = mode === 'race' ? Math.round(CELL_H / 2) : CELL_H;
      const wanted: string[] = [];
      for (const r of runners) { wanted.push(r.type, `${r.type}-front`); }
      for (const t of new Set(wanted)) {
        const dir = TYPE_DIR(t);
        const meta: { width?: number; height?: number } = await fetch(`${dir}/sprite.json`)
          .then((r) => r.json()).catch(() => ({}));
        const asp = (meta.width ?? 1) / (meta.height ?? 1);
        const cw = Math.round(cellH * asp);
        const raw: HTMLImageElement[] = [];
        for (let f = 1; f <= SRC_FRAMES; f += 1) {
          raw.push(await load(`${dir}/${String(f).padStart(2, '0')}_coat.png`));
        }
        if (cancelled) return;
        /**
         * ★**コマごとの蹄の位置を素材から測ります**（★画像の上からの比）。
         *   ★これが無いと、★どのコマも同じ高さに置かれ、★浮いたコマが浮いたままになります。
         * ⚠️ ★個体タイプごとに違うので、★タイプ単位で測ります。
         */
        const lows: number[] = [];
        for (let f = 0; f < SRC_FRAMES; f += 1) {
          const img = raw[f]!;
          probe.width = img.width; probe.height = img.height;
          pg.clearRect(0, 0, probe.width, probe.height);
          pg.drawImage(img, 0, 0);
          const d = pg.getImageData(0, 0, probe.width, probe.height).data;
          let low = probe.height - 1;
          for (let y = probe.height - 1; y >= 0; y -= 1) {
            let hit = false;
            for (let x = 0; x < probe.width; x += 1) if ((d[(y * probe.width + x) * 4 + 3] ?? 0) >= 64) { hit = true; break; }
            if (hit) { low = y; break; }
          }
          lows.push(low / probe.height);
        }
        loadedTypes.set(t, { raw, aspect: asp, cellW: cw, lowRatio: lows });
      }
      if (cancelled) return;

      const scratch = document.createElement('canvas');
      const sg = scratch.getContext('2d', { willReadFrequently: true })!;
      const bakeOne = (r: typeof runners[number], key: string): Baked => {
        const src = loadedTypes.get(key)!;
        const CELL_W = src.cellW;
        scratch.width = CELL_W; scratch.height = cellH;
        const atlas = document.createElement('canvas');
        /**
         * ★幅は ★**1 列**で足ります。
         * ⚠️ ★層が 4 つあった頃の名残で `CELL_W * 4` を確保していましたが、
         *    ★1 枚絵になった今は ★**列 0 にしか描いていません**。
         */
        atlas.width = CELL_W;
        atlas.height = cellH * SRC_FRAMES;
        const ag = atlas.getContext('2d')!;
        const perFrame: Piece[][] = [];
        for (let f = 0; f < SRC_FRAMES; f += 1) {
          /**
           * ★**素材は 1 枚絵です**（★2026-09-07）
           *   ★`tools/lib/dress.mjs` と同じく、★色相で部位を選んで塗り替えます。
           */
          const img = src.raw[f]!;
          sg.clearRect(0, 0, CELL_W, cellH);
          /** ★① 茶系 → 毛色 */
          tintOnto(sg, img, palette[r.coat] ?? '#8a6340', CELL_W, cellH, 'coat');
          /** ★② 青 → 勝負服（★同じ絵の上に続けて当てる） */
          tintInPlace(sg, palette[r.silk] ?? '#2f6fd0', CELL_W, cellH, 'silk');
          /** ★③ 場の光（★候補が要求したときだけ） */
          if (LOOKS[look]?.light === true) {
            const lit = sg.getImageData(0, 0, CELL_W, cellH);
            applySceneLight(lit.data, CELL_W, cellH);
            sg.putImageData(lit, 0, 0);
          }
          ag.drawImage(scratch, 0, f * cellH);
          perFrame.push([{ grey: img, atlas, sx: 0, sy: f * cellH, isCoat: true }]);
        }
        return { pieces: perFrame, aspect: src.aspect, cellW: CELL_W, cellH, lowRatio: src.lowRatio };
      };
      for (const r of runners) {
        baked.push({ side: bakeOne(r, r.type), front: bakeOne(r, `${r.type}-front`) });
      }
      setStatus(`${runners.length} 頭 × ${SRC_FRAMES} コマ（★1 枚絵・色は色相で置き換え）／${bgNote}`);
    })().catch((e) => { setStatus(`⚠️ 素材を読めませんでした: ${String(e)}`); });

    let last = performance.now();
    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const W = canvas.width;
      const H = canvas.height;
      if (st.playing) travelRef.current += st.speedMps * dt;
      const travel = travelRef.current;

      /**
       * ★大きさは頭数から決めます（★重ならない範囲でいちばん大きく）。
       *   ★スライダーはその上での微調整です。
       */
      const fitH = ({ 1: 0.62, 2: 0.42, 3: 0.32, 4: 0.26 })[Math.min(st.count, 4)] ?? 0.26;
      /**
       * ★**レースの進み具合**（0〜1）。★カットの切り替えは ★`SCRIPT_V6` と同じく
       * ★**先頭馬の走破距離**だけで決まります（★時間でも乱数でもない）。
       */
      const raceSecNow = race === null ? 0
        : Math.min(race.model.raceSec, travelRef.current / Math.max(1, stateRef.current.speedMps));
      const leadNow = race === null ? 0
        : race.model.at(raceSecNow).reduce((m, h) => (h.meters > m ? h.meters : m), 0);
      const raceProgress = race === null ? 0 : leadNow / race.model.distanceMeter;

      /**
       * ★**カットが馬の大きさを決めます**（★2026-09-08）
       *   ⚠️ ★`broadcast-v2.ts` :203 の記録 —
       *      ★「カットが切り替わると一気にクオリティが下がる」の正体は
       *      ★**毎カット別の倍率で拡大縮小**していたこと。★だから ★倍率は
       *      ★**カットの表が 1 か所で持ちます**（★つまみと二重に持たない）。
       *   ★レースでないときは、これまでどおり「馬の高さ」つまみです。
       */
      const cutNow = st.mode === 'race' && race !== null
        ? sideCutAt(Math.min(1, raceProgress)) : null;
      /**
       * ⚠️ ★**つまみを殺さないこと**（★2026-09-08・オーナー実見
       *    ★「馬の大きさのつまみが効かないので、ミニチュアみたいになっています」）。
       *    ★カットに大きさを持たせたとき、★つまみを無効にしてしまいました。
       * → ★カットは ★**大きさの「幅」**を、★つまみは ★**全体の倍率**を受け持ちます。
       *   ★つまみ 36% が等倍で、★上げれば全カットが一緒に大きくなります。
       */
      const heightRatio = cutNow === null
        ? st.heightRatio
        : cutNow.cut.horseH * (st.heightRatio / 0.36);
      const horseH = H * fitH * (heightRatio / 0.36);
      const size = Math.round(horseH);
      const drawSize = st.quantise ? Math.round(size / 8) * 8 : size;
      /**
       * ★**馬群の px/m**。★馬の描画寸法から出します。
       *   ★こうすると ★**地面と馬が同じ物差しで動く**ので、★背景だけ速い／遅いが起きません。
       */
      const packPxPerM = drawSize / SPAN_M;
      /** ★芝の明るさ（★オーナーが目で決める）。★段階ぶんの背景を先に作ってあります */
      const chosen = LOOKS[st.look] ?? LOOKS[0]!;
      const sceneIdx = (st.sunny ? TURF_STEPS.length : 0) + chosen.turf;
      const scenery = sceneries === null ? null
        : (sceneries[Math.min(sceneries.length - 1, Math.max(0, sceneIdx))] ?? null);

      /**
       * ⚠️ ★**毎コマ消すこと**（★2026-09-07・オーナー実見「芝は何も変わってない」）
       *    ★これまで一度も消していませんでした。★背景の層が画面全体を覆っていたので
       *    ★動いていましたが、★層を 1 つでも外すと ★**前のコマの絵がそのまま残ります**。
       *    ★実際、★「奥の層を隠す」を押しても ★**画面が変わりませんでした**
       *    （★層は 8 → 6 に減っていたのに、★消えた場所に前のコマが残っていた）。
       */
      ctx.fillStyle = '#c9d6dc';
      ctx.fillRect(0, 0, W, H);

      /**
       * ★**奥を隠すときは、カメラを走路へ寄せます**（★2026-09-07）
       *   ★参考映像は、★空いた場所を残さず ★**芝で画面を埋めます**
       *   （★62 コマの実測: ★緑が画面の中央値 65%）。
       *   ★層を消しただけだと、★消えた場所に空の帯が残ります。
       */
      /**
       * ⚠️ ★**寄せすぎるとぼやけます**（★2026-09-07・オーナー実見）
       *   ★プレートは 1672px 幅で、★画面は 1150px。★拡大率 = W ÷ (1672 ÷ zoom)。
       *     ★zoom 1.12（そのまま）… ★0.77 倍（★縮小なのでぼやけません）
       *     ★zoom 1.90（最初の案）… ★**1.31 倍＝引き伸ばし**。★これがぼやけの一因でした
       *     ★zoom 1.40           … ★0.96 倍（★引き伸ばさない上限）
       *   → ★**1.40 を上限**にします。★これ以上寄せたいなら、★素材を大きく作り直すこと。
       */
      const plateZoom = chosen.far ? 1.40 : PLATE_ZOOM;
      const plateAnchor = chosen.far ? 0.80 : PLATE_ANCHOR;

      if (scenery !== null) {
        const opts = {
          viewport: { width: W, height: H },
          zoom: plateZoom,
          verticalAnchor: plateAnchor,
          /** ⚠️ ★**距離**で流すこと。★速度で流すと再現できません（`parallax-plate.ts`） */
          scrollM: travel,
          packPxPerM,
          packDepthM: PACK_DEPTH_M,
          direction: 1 as const,
        };
        drawParallaxPlate(ctx, chosen.far ? scenery.behindNear : scenery.behind, opts);
      } else {
        /** ★背景が来るまでの仮の地（★空と芝） */
        ctx.fillStyle = '#9fc6e0'; ctx.fillRect(0, 0, W, H * 0.42);
        ctx.fillStyle = '#6d8b4e'; ctx.fillRect(0, H * 0.42, W, H * 0.58);
      }

      /** ★プレート px → 画面 px（★`drawParallaxPlate` と同じ枠取り） */
      const scale = W / ((scenery?.plateWidth ?? 1672) / plateZoom);
      const cropY0 = Math.max(0, (scenery?.plateHeight ?? 941) - H / scale) * plateAnchor;
      const plateToScreenY = (py: number): number => (py - cropY0) * scale;
      /** ★馬が立つ帯（★地面の層の中に収める） */
      const bandY0 = scenery?.groundY0 ?? 672;
      const bandY1 = scenery?.groundY1 ?? 762;

      if (st.guides) {
        /** ★1m ごとの縦線（★流れて速さが読める・★滑りも見える） */
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = 1;
        for (let m = Math.floor(travel - 14); m < travel + 14; m += 1) {
          const x = Math.round(W / 2 + (m - travel) * packPxPerM);
          if (x < -10 || x > W + 10) continue;
          ctx.beginPath();
          ctx.moveTo(x, plateToScreenY(bandY0)); ctx.lineTo(x, plateToScreenY(bandY1));
          ctx.stroke();
        }
      }

      /**
       * ★**レースのときは、エンジンが決めた位置で描きます**（★2026-09-08）
       *
       * ⚠️ ★ここで位置を作り直しません。★`replayPositionModel`（★脚質から道中を作る）と
       *    ★`climaxDisplayPositions`（★最後の直線の攻防・★着順は 1 ビットも変えない）を
       *    ★そのまま呼びます。★作り直すと本番と別物になります。
       *
       * ★`travel` は「カメラが走路のどこを見ているか [m]」として使います。
       *   ★背景も同じ値で流すので、★馬と地面が同じ物差しで動きます。
       */
      const run = race;
      const racing = st.mode === 'race' && run !== null;
      const raceSec = racing ? Math.min(run!.model.raceSec, travel / Math.max(1, st.speedMps)) : 0;
      const atRaw = racing ? run!.model.at(raceSec) : [];
      /** ★最後の直線の攻防（★着順は 1 ビットも変わりません） */
      const climax = racing
        ? climaxDisplayPositions(
          atRaw.map((h) => ({ gate: h.gate, s: h.meters, finishPosition: run!.finishPos.get(h.gate) ?? 99 })),
          { seed: RACE_SEED, distanceM: run!.model.distanceMeter },
        )
        : [];
      const at = racing
        ? atRaw.map((h, k) => ({ ...h, shownM: climax[k]?.s ?? h.meters }))
        : [];
      /** ★カメラは先頭馬の少し後ろ（★先頭が画面の右寄りに来るように） */
      const leadM = racing ? Math.max(...at.map((h) => h.shownM)) : 0;
      /**
       * ★カメラの位置。★`lead` は「先頭馬を画面のどこに置くか」で、
       * ★`broadcast-v2` の `leadFraction` と同じ考えです。
       * ★せめぎ合いのカットでは、★**競っている所**（上位 2 頭の中点）を中央に置きます。
       */
      const cut = cutNow?.cut ?? SIDE_CUTS[0]!;
      const sorted = racing ? [...at].sort((a, b) => b.shownM - a.shownM) : [];
      const focusM = cut.contest && sorted.length >= 2
        ? (sorted[0]!.shownM + sorted[1]!.shownM) / 2
        : leadM;
      const camM = racing ? focusM - (W * cut.lead) / packPxPerM : 0;
      /**
       * ★**正面のカットは、馬群を画面の中央に置きます**（★2026-09-08）
       *
       * ⚠️ ★横位置を「内ラチからの距離」だけで決めたら、★序盤は全馬が内ラチ寄りなので
       *    ★**馬群が画面の左端に寄りました**。★カメラは走路の中心ではなく
       *    ★**馬群を追う**ので、★その中心を画面中央に合わせます。
       */
      const laneMid = racing && at.length > 0
        ? at.reduce((m, h) => m + Math.min(1, Math.max(0, (h.w ?? 0) / RACE_SETUP.spec.widthM)), 0) / at.length
        : 0.5;
      if (baked.length > 0) {

        /**
         * ★**描く順**。★正面のカットでは ★**先頭（奥）から**描き、★後ろの馬を上に重ねます。
         *   ★そうしないと、★奥の馬が手前の馬を隠します。
         */
        if (racing && cut.view === 'front') at.sort((a, b) => b.shownM - a.shownM);
        const shown = racing ? at.length : Math.min(st.count, RUNNERS.length);
        /** ★このコマで描いた馬の位置（★裁定 R4 の比較用・★読むだけ） */
        const benchDiag: {
          lane: number; type: string; gate: number; frame: number;
          x: number; y: number; w: number; h: number; groundY: number; travelM: number;
        }[] = [];
        for (let i = 0; i < shown; i += 1) {
          const r = racing ? RACE_RUNNERS[at[i]!.gate - 1]! : RUNNERS[i]!;
          const idx = racing
            ? frameIndexFor(at[i]!.shownM, r.gate, st.strideM)
            : frameIndexFor(travel, r.gate, st.strideM);
          /** ★カットが決めた視点の素材を使います（★真横／斜め前） */
          const pair = baked[i];
          const set = pair === undefined ? undefined
            : (racing && cut.view === 'front' ? pair.front : pair.side);
          const layers = set?.pieces[idx];
          if (set === undefined || layers === undefined) continue;
          /**
           * ★奥のレーンほど小さく・上に（★真横から見た馬群の奥行き）。
           * ⚠️ ★1 度目は横も縦も同じ向きに増やしたので ★**階段状に並びました**。
           *    ★奥行きは**縦だけ**に効かせ、★前後の位置は競り合いで散らします。
           */
          /**
           * ★奥のレーンほど小さく。★レースでは ★**エンジンが引いた横位置**（内ラチからの距離）
           * ★を使います（★D-071 のとおり、★描画層で引き直しません）。
           */
          const laneT = racing
            ? Math.min(1, Math.max(0, (at[i]!.w ?? 0) / RACE_SETUP.spec.widthM))
            : (shown > 1 ? i / (shown - 1) : 0);
          /**
           * ★**正面のカットでは、前後を「奥行き」で見せます**（★2026-09-08）
           *
           * ⚠️ ★真横の並べ方（★走行距離を横位置にする）を正面でも使うと、
           *    ★**正面を向いた馬が横一列に並ぶ**という、★あり得ない絵になります。
           * → ★正面では ★**前の馬ほど小さく・上に**します。
           *   ★横位置は ★内ラチからの距離（`w`）で決めます。
           */
          const aheadM = racing ? Math.max(0, leadM - at[i]!.shownM) : 0;
          /** ★先頭から 40m 後ろで 0.62 倍。★それ以上は頭打ち */
          const frontDepth = racing && cut.view === 'front'
            ? Math.max(0.62, 1 - Math.min(1, aheadM / 40) * 0.38)
            : 1;
          const depth = (1 - (1 - laneT) * 0.14) * frontDepth;
          const s = Math.round(drawSize * depth);
          /** ★横は素材の比から（★正方と決めつけない） */
          const sw = Math.round(s * set.aspect);
          /**
           * ★**地面の帯の中に**並べる（★枠 1 が手前＝下、★枠 6 が奥＝上）。
           *   ★帯は `manifest` の地面の層そのものなので、★**芝の上から外れません**。
           */

          /**
           * ★縦。★正面では ★**前の馬ほど上**（★奥にいる＝地平線に近い）。
           *   ★真横では ★内ラチ側ほど上（★奥行き）。
           */
          const t2 = racing
            ? (cut.view === 'front'
              ? Math.min(1, Math.max(0, 1 - Math.min(1, aheadM / 40)))
              : 1 - laneT)
            : (shown > 1 ? i / (shown - 1) : 0);
          const groundY = plateToScreenY(bandY1 - 8 - t2 * (bandY1 - bandY0 - 16));
          /**
           * ★前後に散らす（★競り合い）。
           * ⚠️ ★以前は 6 頭が同じ所に重なって ★**1 頭にしか見えませんでした**。
           *    ★枠ごとに基準の位置を離し、★その上で少しだけ競らせます。
           */
          /**
           * ★**重ならない位置に置く。**
           *   ★画面幅から描画幅を引いた残りを、★頭数 −1 で等分します。
           * ⚠️ ★「描画幅 × 0.58」で置いていたときは、★4 頭が重なって塊になりました。
           */
          const room = Math.max(0, W - sw);
          const x = racing
            ? (cut.view === 'front'
              /** ★正面: 横は ★内ラチからの距離だけで決めます（★走路の幅を画面幅に写す） */
              ? Math.round(W * (0.5 + (laneT - laneMid) * 1.5) - sw * 0.5)
              : Math.round((at[i]!.shownM - camM) * packPxPerM - sw * 0.5))
            : Math.round(shown > 1 ? (room * i) / (shown - 1) : room * 0.5);
          /** ★画面の外は描きません（★12 頭ぶん無駄に焼かない） */
          if (racing && (x + sw < -40 || x > W + 40)) continue;
          /**
           * ★**接地**（★2026-09-07・オーナー実見「馬の足は地面についていません」）
           *
           * 【★何が起きていたか — ★実測】
           *   ★接地線 `FEET`（0.920）は ★**全 8 コマの中でいちばん低い蹄**の位置です。
           *   ★そのため ★**8 コマ中 6 コマが浮きます**:
           *     ★コマ6 0.920（接地）／コマ2 0.912／コマ4・7 0.891／コマ3 0.884
           *     ★コマ1 0.872／★コマ5・8 0.852 ← ★馬の高さ 450px なら **31px** 浮く
           *
           * 【★どう直すか】
           *   ★コマごとの蹄の位置は ★**素材から測れます**（`lowRatio`）。
           *   ⚠️ ★かつての `FRAME_DY` は納品素材の頃の**固定表**で、★いまの素材と合いません。
           *   ★浮きを `st.bob` の割合だけ残し、★残りは押し下げて接地させます。
           *     ★`bob = 0` … ★全コマ接地　★`bob = 1` … ★描かれたまま（★浮いたまま）
           */
          const gap = FEET - (set.lowRatio[idx] ?? FEET);
          const dy = s * gap * (1 - st.bob);
          const y = Math.round(groundY - s * FEET + dy);
          /**
           * ★**接地影**。★足元に影が無いと、★馬が地面から浮いて見えます。
           *   ★宙に浮く局面では小さく薄くします。★浮きは実測値から出します。
           */
          const lift = Math.min(1, (gap * st.bob) / 0.05);
          if (!chosen.contact) {
            ctx.globalAlpha = 0.26 * (1 - lift * 0.55);
            ctx.fillStyle = '#1d2a17';
            ctx.beginPath();
            ctx.ellipse(x + sw * 0.5, groundY, sw * 0.18 * (1 - lift * 0.2), s * 0.045, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            /**
             * ★**影を 2 枚に分けます**（★2026-09-07・レビュー裁定「足元に重さを出す」）
             *   ★① 体の下の柔らかい影 … ★大きく薄い。★浮くと**広がって薄く**なります
             *   ★② 接地した蹄の直下   … ★小さく濃い。★浮くと**消えます**
             * ⚠️ ★1 枚だけだと、★浮いても接地しても同じ影で、★重さが出ませんでした。
             */
            const cx = x + sw * 0.5;
            const soft = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, sw * (0.20 + lift * 0.10));
            soft.addColorStop(0, `rgba(20,32,14,${(0.22 * (1 - lift * 0.45)).toFixed(3)})`);
            soft.addColorStop(1, 'rgba(20,32,14,0)');
            ctx.fillStyle = soft;
            ctx.save();
            ctx.translate(cx, groundY);
            ctx.scale(1, 0.24);
            ctx.beginPath();
            ctx.arc(0, 0, sw * (0.20 + lift * 0.10), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            /** ★接地している局面だけ、★蹄の下に濃い小さな影 */
            const hard = Math.max(0, 1 - lift * 1.6);
            if (hard > 0.02) {
              ctx.globalAlpha = 0.42 * hard;
              ctx.fillStyle = '#131d0e';
              ctx.beginPath();
              ctx.ellipse(cx + sw * 0.10, groundY, sw * 0.075, s * 0.020, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.ellipse(cx - sw * 0.16, groundY, sw * 0.065, s * 0.017, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
          /**
           * ★**描いた場所を控えます**（★2026-09-10・★裁定 R4 の比較用）。
           *   ★本編の `__raceDiag` と同じ、★**読むだけの窓**です。★描画は 1 画素も変えません。
           *   ★これが無いと、★比較する道具が ★**台の置き方の式を書き写す**ことになります（★R-30）。
           */
          benchDiag.push({
            lane: r.lane, type: r.type, gate: r.gate, frame: idx,
            x, y, w: sw, h: s, groundY, travelM: travel,
          });
          for (const p of layers) {
            /**
             * ⚠️ ★着色済みだけを描きます。
             *    ★元絵を下に敷くと、★着色の半透明な縁から**下地の茶**が透けます。
             */
            if (p.atlas === null) { ctx.drawImage(p.grey, x, y, sw, s); continue; }
            /**
             * ⚠️ ★**ここで透明度を下げてはいけません**（★2026-09-07・レビュー指摘）
             *    ★層に分かれていた頃、★この行は「★毛の層だけ濃さを落とす」でした。
             *    ★素材を ★**1 枚絵**にしたとき、★`isCoat` が ★**馬と騎手の全部**を指すようになり、
             *    ★「毛色の濃さ 85%」が ★**キャラクター全体の透明度 85%**に化けていました。
             *    ★奥のラチが騎手や首を透けて横切り、★実体が薄く見えていました。
             * → ★**常に不透明で描きます。** ★毛色の濃さは、塗るときの色そのもので決めます。
             */
            ctx.drawImage(p.atlas, p.sx, p.sy, set.cellW, set.cellH, x, y, sw, s);
            /**
             * ⚠️ ★**ここで元の色を描き戻してはいけません**（★2026-09-07）
             *    ★かつて素材が**無彩色**だったとき、★着色対象の層に混ざっていた固定色
             *    （★騎手の顔・頭絡・ゴーグルの金）を守るために描き戻していました。
             *    ★いまの素材は ★**茶色い下地**なので、★毛そのものが「色付き」と判定され、
             *    ★**着色を全部塗り潰していました**（★4 頭とも同じ色になった正体）。
             * → ★守りは着色側でやります（★色相で部位を選ぶので、肌や頭絡には当たりません）。
             */
          }
        }
        /** ★このコマで描いた馬の位置を外へ（★裁定 R4 の比較用・★読むだけ） */
        (globalThis as { __benchDiag?: unknown }).__benchDiag = benchDiag;
      }

      /** ★**手前のラチ**は馬の後に描く（★これで馬が走路の中に入ります） */
      if (scenery !== null) {
        drawParallaxPlate(ctx, scenery.front, {
          viewport: { width: W, height: H },
          zoom: plateZoom,
          verticalAnchor: plateAnchor,
          scrollM: travel,
          packPxPerM,
          packDepthM: PACK_DEPTH_M,
          direction: 1 as const,
        });
      }

      /**
       * ⚠️ ★**HUD は手前のラチより後に描くこと**（★2026-09-08）。
       *    ★先に描いたら、★**馬名プレート（画面下部）がラチに覆われて**見えませんでした。
       */
      /**
       * ★**中継の体裁**（★2026-09-08・オーナー指示）
       *
       * ⚠️ ★新しく作りません。★`@star/render` に既にあるものを呼ぶだけです:
       *    ★`drawStandings`（順位表）／`drawHorseNamePlates`（馬名）／`drawResultsBoard`（着順）
       * ⚠️ ★順位は ★**画面に描いたのと同じ位置**から出します。★別に計算すると、
       *    ★順位表と絵が食い違います（★本番 page.tsx :2535 にも同じ注記があります）。
       */
      if (racing && at.length > 0) {
        const pal = paletteRef.cur;
        const font: (px: number, bold?: boolean) => string =
          (px, bold) => `${bold === true ? 'bold ' : ''}${px}px sans-serif`;
        const vp = { width: W, height: H };
        const order = [...at].sort((a, b) => b.shownM - a.shownM);
        const leadS = order[0]!.shownM;
        /** ★1 馬身 = 2.4m（★`HORSE_LENGTH_M` と同じ） */
        /**
         * ⚠️ ★**ゴールした馬は同じ位置で止まります**（★2026-09-08・実測）。
         *    ★そのまま差を計算すると、★順位表が ★**全馬 0.0**になり、
         *    ★先頭も入れ替わって見えます。
         * → ★先頭がゴールしたら、★**エンジンの確定着順と着差**に切り替えます。
         */
        const passedPost = leadS >= run!.model.distanceMeter - 0.5;
        const rows = passedPost
          ? run!.result.slice(0, 5).map((r) => ({
            gate: r.gate,
            name: RACE_RUNNERS[r.gate - 1]?.name ?? `${r.gate} 番`,
            lengths: 0,
            timeSec: r.timeSec,
            isOwn: r.gate === 1,
          }))
          : order.map((h) => ({
            gate: h.gate,
            name: RACE_RUNNERS[h.gate - 1]?.name ?? `${h.gate} 番`,
            lengths: (leadS - h.shownM) / 2.4,
            isOwn: h.gate === 1,
          }));
        const finished = raceSecNow >= run!.model.raceSec - 0.01;
        if (!finished) {
          drawStandings(ctx, pal, vp, font, rows, RACE_FIELD, frameRoleOf, { timeSec: raceSecNow });
          drawHorseNamePlates(ctx, pal, font,
            (passedPost ? run!.result.slice(0, 4).map((r) => ({ gate: r.gate })) : order.slice(0, 4))
              .map((h, k) => ({
                gate: h.gate,
                name: RACE_RUNNERS[h.gate - 1]?.name ?? `${h.gate} 番`,
                isOwn: h.gate === 1,
                note: k === 0 ? (passedPost ? '1 着' : '先頭') : undefined,
              })),
            RACE_FIELD, frameRoleOf,
            { viewport: vp, timeSec: raceSecNow, sinceSec: raceSecNow });
        } else {
          /** ★ゴール後の着順ボード。★競馬場名・レース名は架空のものです（★憲法1） */
          drawResultsBoard(ctx, pal, vp, font,
            run!.result.map((r) => ({
              place: r.place,
              gate: r.gate,
              horseName: RACE_RUNNERS[r.gate - 1]?.name ?? `${r.gate} 番`,
              jockeyName: `騎手 ${r.gate}`,
              timeSec: r.timeSec,
              margin: r.margin,
              isOwn: r.gate === 1,
            })),
            RACE_FIELD, frameRoleOf,
            {
              raceName: '検証台デモ', venue: 'スターパーク', raceNo: '11R',
              distanceLabel: `芝${RACE_DIST}m`, winTimeSec: run!.result[0]?.timeSec,
            },
            Math.min(1, (raceSecNow - run!.model.raceSec) / 1.2 + 1), raceSecNow);
        }
      }


      ctx.fillStyle = 'rgba(20,28,34,.75)';
      ctx.fillRect(0, 0, 470, 62);
      ctx.fillStyle = '#eef2f6';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`進行 ${travel.toFixed(1)}m  速さ ${st.speedMps.toFixed(1)}m/s`, 12, 24);
      ctx.font = '12px sans-serif';
      ctx.fillText(`1 完歩 ${st.strideM.toFixed(2)}m → ${(st.speedMps / st.strideM).toFixed(2)} 完歩/秒`, 12, 46);
      /**
       * ★**いまどのカットか**を出します（★2026-09-08）。
       *   ★出さないと「切り替わったのか、たまたま絵が変わったのか」が分かりません。
       */
      if (cutNow !== null) {
        ctx.fillStyle = 'rgba(20,28,34,.75)';
        ctx.fillRect(W - 300, 0, 300, 40);
        ctx.fillStyle = '#ffd479';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(
          `★${cutNow.index + 1}/${SIDE_CUTS.length}  ${cutNow.cut.label}`
          + `  馬 ${(cutNow.cut.horseH * 100).toFixed(0)}%`,
          W - 288, 25,
        );
      }

      /**
       * ★**カットが変わった瞬間に、直前の画を控えます**。
       *   ★次のコマから 0.35 秒かけて上に重ねて消すと、★切り替わりが唐突でなくなります。
       */
      if (cutNow !== null && cutNow.index !== prevCutIndex) {
        if (prevCutIndex >= 0) {
          prevShot.width = W; prevShot.height = H;
          prevShot.getContext('2d')!.drawImage(canvas, 0, 0);
          prevAtSec = now / 1000;
        }
        prevCutIndex = cutNow.index;
      }
      const fadeT = (now / 1000 - prevAtSec) / CUT_FADE_SEC;
      if (fadeT >= 0 && fadeT < 1 && prevShot.width > 0) {
        ctx.globalAlpha = 1 - fadeT;
        ctx.drawImage(prevShot, 0, 0);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    /**
     * ★**撮影用の時計**（★2026-09-10・★裁定 `REVIEW_P4_GAIT_INTEGRATION_REGRESSION_VERDICT_20260910.md` R4）
     *
     *   ★裁定:「★検証用の時計・シークを注入して検証台の**実際の描画**を進める。
     *   ★**製品の運動式を撮影用に作り直さない**」。
     *
     * ★外から与えるのは ★**進行距離だけ**です。★コマの選び方（`frameIndexFor`）も
     * ★接地の式も ★**1 行も変えていません**。★この台は実時間で走るので、
     * ★そのまま撮ると各コマの間隔が一定にならず、★等速の映像になりません
     *（★2026-09-09 に「等速でない映像を等速と報告した」事故があります）。
     *
     * ⚠️ ★停止してから使ってください（★再生中は毎フレーム上書きされます）。
     * ⚠️ ★この台は開発専用です（★本番では 404）。
     */
    const w = globalThis as { __benchSeekM?: ((meters: number) => number) | undefined };
    w.__benchSeekM = (meters: number): number => {
      travelRef.current = Math.max(0, meters);
      return travelRef.current;
    };
    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      w.__benchSeekM = undefined;
    };
  }, [look, mode]);

  return (
    <main style={{ minHeight: '100vh', background: '#12161a', color: '#eef2f6', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>スプライト方式の検証台（★sevendays の形式を STAR へ）</h1>
        <p style={{ margin: '0 0 10px', color: '#9aa8b4', fontSize: 13, lineHeight: 1.8 }}>
          ⚠️ ★<b>絵を作る台ではありません</b>。★<b>発注書に書く数値を実測で決める台</b>です。<br />
          ★馬は<b>このディレクトリの道具で生成した 8 コマの 1 枚絵</b>、★<b>色はブラウザ側で色相を選んで置き換えています</b>。<br />
          ★背景は <b>STAR の既存素材</b>（★9 層の視差背景）を、★<b>本番と同じ式</b>で流しています。
        </p>
        <canvas
          ref={hostRef}
          width={1280}
          height={720}
          style={{
            width: '100%', maxWidth: 'min(1280px, calc(62vh * 16 / 9))', display: 'block', margin: '0 auto',
            border: '1px solid #3d4650', background: '#9fc6e0',
          }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPlaying((v) => !v)} style={btn}>{playing ? '⏸ 停止' : '▶ 再生'}</button>
          <button type="button" onClick={reset} style={btn}>⟲ 最初から</button>
          <button type="button" onClick={() => setQuantise((v) => !v)} style={{ ...btn, background: quantise ? '#2f6fd0' : '#222a31' }}>
            {quantise ? '8px 刻み: 入' : '8px 刻み: 切'}
          </button>
          {[1, 2, 4].map((n) => (
            <button key={n} type="button" onClick={() => setCount(n)}
              style={{ ...btn, minWidth: 46, background: count === n ? '#2f6fd0' : '#222a31' }}>
              {n} 頭
            </button>
          ))}
          <button type="button" onClick={() => setGuides((v) => !v)} style={{ ...btn, background: guides ? '#2f6fd0' : '#222a31' }}>
            {guides ? '1m 目盛り: 入' : '1m 目盛り: 切'}
          </button>
          {/**
            * ★**完成候補**（★2026-09-07・レビュー裁定）
            *   ⚠️ ★つまみで最適値を探させないこと。★1 つずつ足した候補を出し、
            *      ★オーナーは「どの画面が良いか」だけを選びます。
            */}
          <button type="button" onClick={() => setSunny((v) => !v)}
            style={{ ...btn, background: sunny ? '#2f6fd0' : '#8e2b20' }}>
            ★天気: {sunny ? '晴れ' : '納品（曇り・逆光）'}
          </button>
          {/**
            * ★**見せ方の切り替え**（★2026-09-08）
            *   ★`並べて見る` … 素材の検品用（★等間隔・4 頭まで）
            *   ★`レース`     … ★本物のレース（★12 頭・★エンジンが決めた位置・★競り合いつき）
            */}
          {/**
            * ⚠️ ★**ボタンには「いまの状態」ではなく「選ぶもの」を書くこと**（★2026-09-08）。
            *    ★1 つのボタンに現在のモード名を出したら、★オーナーが
            *    ★「★4 頭しかいません」となりました。★表示が `★並べて見る` のとき
            *    ★**それが現在のモード**で、★押すとレースに変わる — ★分かりません。
            * → ★`1 頭 / 2 頭 / 4 頭` と同じく、★**選択肢を並べて選ばれている方を光らせます**。
            */}
          {([['line', '並べて見る'], ['race', 'レース（12 頭）']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ ...btn, background: mode === m ? '#2f6fd0' : '#39424b' }}>
              {label}
            </button>
          ))}
          {LOOKS.map((l, i) => (
            <button key={l.label} type="button" onClick={() => { setLook(i); setBob(l.bob); }}
              style={{ ...btn, background: look === i ? '#2f6fd0' : '#39424b' }}>
              {l.label}
            </button>
          ))}
        </div>
        {/**
          * ⚠️ ★**つまみを消してしまっていました**（★2026-09-07・オーナー実見の直前に発覚）。
          *    ★候補ボタンへ差し替えたとき、★閉じ括弧までまとめて消しており、
          *    ★速さ・1 完歩・浮き・馬の高さが ★**既定値に固定**されていました。
          *    ★候補で決めるのは見た目、★ここは検証のための道具なので残します。
          */}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            速さ {speedMps.toFixed(1)} m/s
            <input type="range" min={4} max={20} step={0.5} value={speedMps}
              onChange={(e) => setSpeedMps(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★1 完歩 {strideM.toFixed(2)} m（★滑らない所を探す）
            <input type="range" min={2.5} max={9} step={0.02} value={strideM}
              onChange={(e) => setStrideM(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★浮き {(bob * 100).toFixed(0)}%（★0 = 全コマ接地・100 = 絵のまま）
            <input type="range" min={0} max={1} step={0.05} value={bob}
              onChange={(e) => setBob(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            {mode === 'race' ? '★全体の倍率' : '馬の高さ'} {(heightRatio * 100).toFixed(0)}%
            {mode === 'race' ? '（★36% が等倍。カットごとの幅はそのまま）' : ''}
            <input type="range" min={0.12} max={0.5} step={0.01} value={heightRatio}
              onChange={(e) => setHeightRatio(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
        </div>
        <p style={{ color: '#d8c88f', fontSize: 13, marginTop: 10 }}>{status}</p>
        <p style={{ color: '#8fa0ad', fontSize: 12.5, lineHeight: 1.9 }}>
          ★<b>1 完歩 = 3.818m</b>（★この素材の実測。⚠️ sevendays と STAR の慣例値 7m ではありません）。<br />
          ★コマは<b>走行距離</b>から選び、★位相は <code>(馬番 × 0.618) % 1</code>、★接地点は画像の上から <b>0.920</b>。<br />
          ★背景も<b>走行距離</b>で流しています（⚠️ 速度で流すと再現できません）。★層ごとの速さは
          <code> packPxPerM × packDepthM / (packDepthM + depthOffsetM)</code>。<br />
          ★「8px 刻み」を切ると、★<b>動いたとき絵が滲む</b>かどうかを見比べられます（★sevendays の実測による対策）。
        </p>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  minHeight: 38, padding: '6px 14px', border: '1px solid #55606b', borderRadius: 6,
  background: '#222a31', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
};
