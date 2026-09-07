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
import { drawParallaxPlate, type ParallaxLayer, type ParallaxPlate } from '@star/render';

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
const RUNNERS = [
  { gate: 1, coat: 'coat-kage-1', silk: 'silk-1', frame: 'frame-3', lane: 0 },
  { gate: 3, coat: 'coat-kuri-0', silk: 'silk-3', frame: 'frame-4', lane: 1 },
  { gate: 5, coat: 'coat-ashi-1', silk: 'silk-12', frame: 'frame-5', lane: 2 },
  { gate: 7, coat: 'coat-ao-1', silk: 'silk-2', frame: 'frame-6', lane: 3 },
] as const;

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
  w: number, h: number, mode: TintMode,
): void {
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  if (mode === 'multiply') {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    return;
  }
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
 *   ★`multiply` … 比較用（★濁ります）
 */
type TintMode = 'coat' | 'silk' | 'multiply';

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
  readonly behind: ParallaxPlate<HTMLImageElement>;
  readonly front: ParallaxPlate<HTMLImageElement>;
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
  const [bob, setBob] = useState(0);
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
  /** ★着色のやり方。★`color` が正・`multiply` は比較用（★濁る） */
  const [tintMode, setTintMode] = useState<TintMode>('coat');
  /** ★1m ごとの目盛り（★滑りを測るための道具。★見た目の判定では切る） */
  const [guides, setGuides] = useState(false);
  const stateRef = useRef({ playing, speedMps, heightRatio, quantise, strideM, bob, guides, count });
  stateRef.current = { playing, speedMps, heightRatio, quantise, strideM, bob, guides, count };
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
    /** ★[馬][コマ][層] の焼いた絵。★馬ごとに色が違うので、★馬ごとに焼きます */
    const baked: Piece[][][] = [];
    let scenery: Scenery | null = null;
    /** ★背景の読み込み状況（★馬と背景は別々に読むので、★先に終わった方が書きます） */
    let bgNote = '背景 読み込み中';
    /** ★素材 1 枚の横 ÷ 縦。★`sprite.json` から読みます（★正方と決めつけない） */
    let aspect = 1;
    const aspectRef = { cur: 1 };
    const cell = { w: CELL_H };

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
      const behind: ParallaxLayer<HTMLImageElement>[] = [];
      const front: ParallaxLayer<HTMLImageElement>[] = [];
      let groundY0 = 0; let groundY1 = 0;
      man.layers.forEach((l, i) => {
        const image = imgs[i]!;
        const entry: ParallaxLayer<HTMLImageElement> = {
          image, width: l.tileWidth, height: image.height,
          plateY0: l.plateY0, plateY1: l.plateY1,
          depthOffsetM: l.depthOffsetM, isGround: groundNames.has(l.name),
        };
        if (groundNames.has(l.name)) {
          /** ★いちばん手前の地面の帯を、★馬が立つ帯とします */
          if (l.plateY1 > groundY1) { groundY0 = l.plateY0; groundY1 = l.plateY1; }
        }
        /**
         * ★**馬より手前に来る層**（★ラチ）だけ、馬の後に描きます。
         *   ★地面ではなく、★馬群（深さ 0）より手前（depthOffsetM < 0）のもの。
         * → ★手前のラチが馬の前を横切ることで、★一気に**中継の絵**になります。
         */
        if (!groundNames.has(l.name) && l.depthOffsetM < 0) front.push(entry);
        else behind.push(entry);
      });
      bgNote = `背景 ${behind.length}+${front.length} 層`;
      scenery = {
        plateWidth: man.plateWidth, plateHeight: man.plateHeight,
        behind: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: behind },
        front: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: front },
        groundY0, groundY1,
      };
    })().catch(() => { setStatus('⚠️ 背景素材を読めませんでした'); });

    /** ★馬（★購入リグを焼いたスプライト）を読む */
    void (async () => {
      const palette: Record<string, string> = await fetch('/art/palette.json')
        .then((r) => r.json()).catch(() => ({}));
      const meta: { width?: number; height?: number } = await fetch(`${SPRITE_DIR}/sprite.json`)
        .then((r) => r.json()).catch(() => ({}));
      aspect = (meta.width ?? 1) / (meta.height ?? 1);
      const CELL_W = Math.round(CELL_H * aspect);
      aspectRef.cur = aspect;
      cell.w = CELL_W;
      const raw: Record<Layer, HTMLImageElement[]> = { coat: [], mane: [], silk: [], cap: [], tack: [] };
      for (let f = 1; f <= SRC_FRAMES; f += 1) {
        for (const l of LAYERS) {
          raw[l].push(await load(`${SPRITE_DIR}/${String(f).padStart(2, '0')}_${l}.png`));
        }
      }
      if (cancelled) return;
      /**
       * ★馬 × コマ × 層 で焼く（★一度だけ）。
       *   ★着色は **馬ごとに 1 枚**のキャンバスへ詰めます（★上の `CELL_PX` の注記）。
       *   ★合成は使い回しの 1 枚（`scratch`）の上で行い、★結果だけを詰め先へ写します
       *   （★詰め先で直接合成すると、★隣のマスまで塗ってしまいます）。
       */
      const scratch = document.createElement('canvas');
      scratch.width = CELL_W; scratch.height = CELL_H;
      const sg = scratch.getContext('2d', { willReadFrequently: true })!;
      /**
       * ⚠️ ★**「色の付いた画素を元の色で描き戻す」1 枚は、もう作りません**（★2026-09-07）
       *    ★素材が無彩色だった頃、★騎手の顔やゴーグルを守るために使っていました。
       *    ★描き戻しは ★**茶色い下地では毛ごと戻ってしまう**ので 9/7 に廃止しましたが、
       *    ★**作る処理だけが残って**いました。★焼く解像度を素材と同じ 576 に上げると、
       *    ★これだけで ★**約 70MB** を空取りします。
       */
      for (const r of RUNNERS) {
        const atlas = document.createElement('canvas');
        /**
         * ★幅は ★**1 列**で足ります。
         * ⚠️ ★層が 4 つあった頃の名残で `CELL_W * 4` を確保していましたが、
         *    ★1 枚絵になった今は ★**列 0 にしか描いていません**（★下の `drawImage(scratch, 0, …)`）。
         *    ★3/4 は空のまま場所だけ取っていました。
         */
        atlas.width = CELL_W;
        atlas.height = CELL_H * SRC_FRAMES;
        const ag = atlas.getContext('2d')!;
        const perFrame: Piece[][] = [];
        for (let f = 0; f < SRC_FRAMES; f += 1) {
          /**
           * ★**素材は 1 枚絵です**（★2026-09-07）
           *
           * ⚠️ ★層に分かれていません。★STAR の 2D 馬はもともと 1 枚絵で、
           *    ★`tools/lib/dress.mjs` が ★**色相で部位を選んで**塗り替えます。
           *    ★`coat` 以外の 4 層は**空**なので、★そこを塗っても何も出ません。
           *    ★実際、そのままだと ★**4 頭とも同じ色**になりました。
           * → ★**同じ 1 枚に、毛色と勝負服を順に当てます。**
           *   ★毛（茶）と勝負服（青）は色相で分かれるので、★互いを侵しません。
           */
          const src = raw.coat[f]!;
          sg.clearRect(0, 0, CELL_W, CELL_H);
          if (tintMode === 'multiply') {
            tintOnto(sg, src, palette[r.coat] ?? '#8a6340', CELL_W, CELL_H, 'multiply');
          } else {
            /** ★① 茶系 → 毛色 */
            tintOnto(sg, src, palette[r.coat] ?? '#8a6340', CELL_W, CELL_H, 'coat');
            /** ★② 青 → 勝負服（★同じ絵の上に続けて当てる） */
            tintInPlace(sg, palette[r.silk] ?? '#2f6fd0', CELL_W, CELL_H, 'silk');
          }
          ag.drawImage(scratch, 0, f * CELL_H);
          const row: Piece[] = [{
            grey: src, atlas, sx: 0, sy: f * CELL_H, isCoat: true,
          }];
          perFrame.push(row);
        }
        baked.push(perFrame);
      }
      setStatus(`${RUNNERS.length} 頭 × ${SRC_FRAMES} コマ（★1 枚絵・色は色相で置き換え）／${bgNote}`);
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
      const horseH = H * fitH * (st.heightRatio / 0.36);
      const size = Math.round(horseH);
      const drawSize = st.quantise ? Math.round(size / 8) * 8 : size;
      /**
       * ★**馬群の px/m**。★馬の描画寸法から出します。
       *   ★こうすると ★**地面と馬が同じ物差しで動く**ので、★背景だけ速い／遅いが起きません。
       */
      const packPxPerM = drawSize / SPAN_M;

      if (scenery !== null) {
        const opts = {
          viewport: { width: W, height: H },
          zoom: PLATE_ZOOM,
          verticalAnchor: PLATE_ANCHOR,
          /** ⚠️ ★**距離**で流すこと。★速度で流すと再現できません（`parallax-plate.ts`） */
          scrollM: travel,
          packPxPerM,
          packDepthM: PACK_DEPTH_M,
          direction: 1 as const,
        };
        drawParallaxPlate(ctx, scenery.behind, opts);
      } else {
        /** ★背景が来るまでの仮の地（★空と芝） */
        ctx.fillStyle = '#9fc6e0'; ctx.fillRect(0, 0, W, H * 0.42);
        ctx.fillStyle = '#6d8b4e'; ctx.fillRect(0, H * 0.42, W, H * 0.58);
      }

      /** ★プレート px → 画面 px（★`drawParallaxPlate` と同じ枠取り） */
      const scale = W / ((scenery?.plateWidth ?? 1672) / PLATE_ZOOM);
      const cropY0 = Math.max(0, (scenery?.plateHeight ?? 941) - H / scale) * PLATE_ANCHOR;
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

      if (baked.length > 0) {
        const shown = Math.min(st.count, RUNNERS.length);
        for (let i = 0; i < shown; i += 1) {
          const r = RUNNERS[i]!;
          const idx = frameIndexFor(travel, r.gate, st.strideM);
          const layers = baked[i]?.[idx];
          if (layers === undefined) continue;
          /**
           * ★奥のレーンほど小さく・上に（★真横から見た馬群の奥行き）。
           * ⚠️ ★1 度目は横も縦も同じ向きに増やしたので ★**階段状に並びました**。
           *    ★奥行きは**縦だけ**に効かせ、★前後の位置は競り合いで散らします。
           */
          const depth = 1 - (shown > 1 ? i / (shown - 1) : 0) * 0.14;
          const s = Math.round(drawSize * depth);
          /** ★横は素材の比から（★正方と決めつけない） */
          const sw = Math.round(s * aspectRef.cur);
          /**
           * ★**地面の帯の中に**並べる（★枠 1 が手前＝下、★枠 6 が奥＝上）。
           *   ★帯は `manifest` の地面の層そのものなので、★**芝の上から外れません**。
           */

          const t2 = shown > 1 ? i / (shown - 1) : 0;
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
          const x = Math.round(shown > 1 ? (room * i) / (shown - 1) : room * 0.5);
          /**
           * ★接地点を合わせる（★画像の上から 0.920 が蹄）。
           * ★そこへ ★**コマごとの上下動**を足します（★宙に浮く局面を戻すため）。
           */
          const dy = s * (FRAME_DY[idx] ?? 0) * st.bob;
          const y = Math.round(groundY - s * FEET + dy);
          /**
           * ★**接地影**。★足元に影が無いと、★馬が地面から浮いて見えます。
           *   ★宙に浮く局面（`dy` が上）では小さく薄くします。
           */
          const lift = Math.max(0, -dy) / Math.max(1, s * 0.07);
          ctx.globalAlpha = 0.26 * (1 - lift * 0.55);
          ctx.fillStyle = '#1d2a17';
          ctx.beginPath();
          ctx.ellipse(x + sw * 0.5, groundY, sw * 0.18 * (1 - lift * 0.2), s * 0.045, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
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
            ctx.drawImage(p.atlas, p.sx, p.sy, cell.w, CELL_H, x, y, sw, s);
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
      }

      /** ★**手前のラチ**は馬の後に描く（★これで馬が走路の中に入ります） */
      if (scenery !== null) {
        drawParallaxPlate(ctx, scenery.front, {
          viewport: { width: W, height: H },
          zoom: PLATE_ZOOM,
          verticalAnchor: PLATE_ANCHOR,
          scrollM: travel,
          packPxPerM,
          packDepthM: PACK_DEPTH_M,
          direction: 1 as const,
        });
      }

      ctx.fillStyle = 'rgba(20,28,34,.75)';
      ctx.fillRect(0, 0, 470, 62);
      ctx.fillStyle = '#eef2f6';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`進行 ${travel.toFixed(1)}m  速さ ${st.speedMps.toFixed(1)}m/s`, 12, 24);
      ctx.font = '12px sans-serif';
      ctx.fillText(`1 完歩 ${st.strideM.toFixed(2)}m → ${(st.speedMps / st.strideM).toFixed(2)} 完歩/秒`, 12, 46);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [tintMode]);

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
          <button type="button" onClick={() => setTintMode((v) => (v === 'multiply' ? 'coat' : 'multiply'))}
            style={{ ...btn, background: tintMode !== 'multiply' ? '#2f6fd0' : '#8e2b20' }}>
            着色: {tintMode !== 'multiply' ? '色相で選ぶ（正）' : '乗算（濁る）'}
          </button>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            速さ {speedMps.toFixed(1)} m/s
            <input type="range" min={4} max={20} step={0.5} value={speedMps}
              onChange={(e) => setSpeedMps(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★1 完歩 {strideM.toFixed(2)} m（★滑らない所を探す）
            <input type="range" min={2.5} max={9} step={0.02} value={strideM}
              onChange={(e) => setStrideM(Number(e.target.value))} style={{ display: 'block', width: 240, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★上下動 {(bob * 100).toFixed(0)}%（★0 = 納品そのまま）
            <input type="range" min={0} max={1.6} step={0.05} value={bob}
              onChange={(e) => setBob(Number(e.target.value))} style={{ display: 'block', width: 200, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            馬の高さ {(heightRatio * 100).toFixed(0)}%
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
