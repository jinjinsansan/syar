/**
 * ★24 パーツを STAR のリグで動かして、走行コマを焼く（★2026-09-06）
 *
 * 【★なぜ道具にするか】
 *   ⚠️ ★ここまで「走り方」を外注で 8 往復しました。★1 往復に 1 日かかります。
 *   ★リグ計算（`@star/render`・検定 27 件）と、★合格済みのパーツ v2 は既に手元にあります。
 *   ★足りないのは**動かし方の数値**だけなので、★**こちらで回して合否を測ります**。
 *   ★1 回の試行が数秒になり、★往復がゼロになります。
 *
 * 【★合否は `tools/measure-gallop.mjs` が決めます】
 *   ★この道具は「良い絵」を作りません。★**明らかに駄目なものを弾く**線を、
 *   ★このプロジェクトは 2026-08 に既に決めています。★合格した素材の実測値:
 *
 *     ★四肢の伸び縮み **53.3%**（合格線 30%）／ ★騎手の前傾 **13.7%**
 *     ★背中のしなり **9.3%** ／ ★胴体・首・騎手の変化 **14.1%**
 *
 * 【★置き方は `/rig-lab/rig` と同じです（★式を 2 つ持たない）】
 *   ★脚 … リグの解（付け根・膝・蹄）へ**絶対配置**。★骨の長さは原画のピボット間距離。
 *   ★体 … 胴体にぶら下げ、★首の子（頭・たてがみ）は首について回る。
 *   ⚠️ ★脚を「原画からの差分」で動かすと ★**脚が二重に開きます**（★原画は既に駈歩の途中）。
 *
 * ★実行:
 *   node tools/bake-deformed-frames.mjs --out tmp/baked --frames 16 \
 *        --stand 0.90 --over 0.35 --lift 1.0 --stride 5.6
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  DEFORMED_GAIT_V0, DEFORMED_HORSE_V0, DEFORMED_LEG_IDS, deformedPoseAt,
} from '@star/render';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const PARTS = arg('parts', 'apps/web/public/rig-lab-assets/parts');
const OUT = arg('out', 'tmp/baked');
const FRAMES = Number(arg('frames', 16));
/**
 * ★立ち高さ。
 * ⚠️ ★0.90 は ★**幾何が成立しません**（★接地とされた蹄が最大 28cm 浮く）。
 *    ★納品パーツの実寸（前脚 1.24m / 後脚 1.08m）では、
 *    ★`worstContactFloatM` が 0 になるのは **0.75〜0.80** です。
 */
const STAND = Number(arg('stand', 0.78));
const OVER = Number(arg('over', 0.35));
const LIFT = Number(arg('lift', 1.0));
const STRIDE = Number(arg('stride', 5.6));
/** ★接地している割合。★0.17 だと立ち高さを 0.75 までしか上げられません */
const DUTY = Number(arg('duty', 0.12));
/** ★デバッグ: パーツごとに別の色で塗る */
const DEBUG_COLOUR = process.argv.includes('--colour');
/**
 * ★**近い側の腿を胴体の後ろへ回す**（★2026-09-06・オーナー評「足が 8 本に見える」）
 *
 * ⚠️ ★パーツは**重なりを 4.27 倍**持っています（★関節が割れないため）。
 *    ★近い側の腿は胴体（z10）より**後**に描かれるので、★大きく回すと
 *    ★**隠れていた重なりが胴の上に板として出ます**。
 * → ★腿だけ胴の前へ出さず、★胴に隠してもらいます。
 */
const THIGH_BEHIND = !process.argv.includes('--thigh-front');
/**
 * ★**脚のパーツを「自分の関節より上」で切る**（★2026-09-06）
 *
 * ⚠️ ★パーツは重なりを **4.27 倍**持っています（★関節が割れないため）。
 *    ★その重なりは「隣の裏に隠れる」前提の材料なので、★大きく回すと
 *    ★**胴の上に板として出ます**（★オーナー評「馬の足が 8 本に見える」）。
 * → ★脚は関節から**下**へ伸びるものなので、★関節より上は描かないことにします。
 *   ★`--keep` は関節の周りに残す余裕（★骨の長さに対する割合）。★0 にすると継ぎ目が割れます。
 */
const KEEP = Number(arg('keep', 0.30));
/**
 * ★**体を 1 枚の剛体にする**（★2026-09-06・オーナー評「まだダブっています」）
 *
 * ⚠️ ★納品パーツは**互いの複製**を大量に持っています（★実測）:
 *    ★`jockeyArmNear` は騎手の頭を **72,780px**、★`mane` は **48,913px**、
 *    ★`neck` は馬の頭を **63,210px** 持っています。
 *    ★静止時は上のパーツが隠しますが、★回すと**顔や頭が二重に出ます**。
 *    ★切り分けで消そうとしましたが、★重なりが深すぎて追いきれませんでした。
 * → ★**胴から上は 1 枚に焼いてしまいます。** ★複製は互いに隠れたまま固定されるので、
 *   ★原理的に二重になりません。★動かすのは**脚 12 パーツだけ**です。
 * ⚠️ ★代わりに首と頭の独立した動きは失われます。★胴の傾きと上下には付いてきます。
 *
 * ⚠️ ★**既定にしません。** ★オーナーが「開発の都合で品質を下げる案」として却下済みです
 *    （★2026-09-06）。★`--rigid-body` を明示したときだけ有効にします。
 * ⚠️ ★2026-09-06、この案が**既定**のままレビュー依頼書を書いたため、
 *    ★レビュー側が「却下済みの経路が既定」と差し戻しました。
 */
const RIGID_BODY = process.argv.includes('--rigid-body');
/** ★原画の 1m が何 px か（★外接矩形 920px = 2.30m の実測） */
const PXM = 400;
/** ★接地線（★原画・納品コマと同じ） */
const GROUND_Y = 1405;
const SIZE = 1920;
const LAYERS = ['coat', 'mane', 'silk', 'cap', 'tack'];

const LEG_PARTS = {
  hindFar: ['hindLegFarUpper', 'hindLegFarLower', 'hindHoofFar'],
  hindNear: ['hindLegNearUpper', 'hindLegNearLower', 'hindHoofNear'],
  foreFar: ['foreLegFarUpper', 'foreLegFarLower', 'foreHoofFar'],
  foreNear: ['foreLegNearUpper', 'foreLegNearLower', 'foreHoofNear'],
};

const LEG_NAMES = new Set(Object.values(LEG_PARTS).flat());

const meta = JSON.parse(readFileSync(path.join(PARTS, 'parts.json'), 'utf8'));
const list = (Array.isArray(meta) ? meta : meta.parts).slice().sort((a, b) => a.z - b.z);
const byName = new Map(list.map((p) => [p.name, p]));
const pivotOf = (n) => byName.get(n)?.pivot ?? [0, 0];

const images = new Map();
for (const p of list) images.set(p.name, await loadImage(path.join(PARTS, `${p.name}.png`)));

/** ★原画のピボットから寸法を測る（★数値を書き写さない） */
const [TX, TY] = pivotOf('torso');
const toM = (x, y) => ({ x: (x - TX) / PXM, y: (TY - y) / PXM });
const legs = {};
for (const leg of DEFORMED_LEG_IDS) {
  const [u, l, h] = LEG_PARTS[leg];
  const U = pivotOf(u); const L = pivotOf(l); const H = pivotOf(h);
  legs[leg] = {
    upperM: Math.hypot(L[0] - U[0], L[1] - U[1]) / PXM,
    lowerM: Math.hypot(H[0] - L[0], H[1] - L[1]) / PXM,
    hip: toM(U[0], U[1]),
    plantBiasM: DEFORMED_HORSE_V0.legs[leg].plantBiasM,
    liftM: DEFORMED_HORSE_V0.legs[leg].liftM * LIFT,
    overreachM: OVER,
  };
}
const neckP = pivotOf('neck'); const headP = pivotOf('head');
const tailP = pivotOf('tail'); const seatP = pivotOf('jockeyTorso');
const jheadP = pivotOf('jockeyHead');
const contract = {
  ...DEFORMED_HORSE_V0,
  totalHeightM: (GROUND_Y - Math.min(...list.map((p) => p.pivot[1]))) / PXM,
  neck: {
    ...DEFORMED_HORSE_V0.neck,
    ...toM(neckP[0], neckP[1]) && {},
    rootX: toM(neckP[0], neckP[1]).x,
    rootY: toM(neckP[0], neckP[1]).y,
    lengthM: Math.hypot(headP[0] - neckP[0], headP[1] - neckP[1]) / PXM,
  },
  tail: { ...DEFORMED_HORSE_V0.tail, rootX: toM(tailP[0], tailP[1]).x, rootY: toM(tailP[0], tailP[1]).y },
  saddle: { x: toM(seatP[0], seatP[1]).x, y: toM(seatP[0], seatP[1]).y },
  jockey: {
    ...DEFORMED_HORSE_V0.jockey,
    torsoHeightM: Math.hypot(jheadP[0] - seatP[0], jheadP[1] - seatP[1]) / PXM,
  },
  legs,
};
const gait = { ...DEFORMED_GAIT_V0, strideM: STRIDE, duty: DUTY };
const ref = deformedPoseAt({ travelM: 0, gate: 1, speedMps: 0, contract, gait, standBend: STAND });

/** ★原画上のピボット [m]（★胴体ピボットが原点・y 上向き） */
const restM = new Map(list.map((p) => [p.name, toM(p.pivot[0], p.pivot[1])]));

/** ★腿を胴の直前へ（★z を 1 つだけ入れ替える） */
const BEHIND = new Set(['hindLegNearUpper', 'foreLegNearUpper']);
const zOf = (p) => (BEHIND.has(p.name) ? 9.5 : p.z);
/** ★脚のパーツ名 → その骨の長さ [px]（★切る位置の基準） */
const LEG_CLIP = new Map();
for (const leg of DEFORMED_LEG_IDS) {
  const [u, l, h] = LEG_PARTS[leg];
  const U = pivotOf(u); const L = pivotOf(l); const H = pivotOf(h);
  LEG_CLIP.set(u, Math.hypot(L[0] - U[0], L[1] - U[1]));
  LEG_CLIP.set(l, Math.hypot(H[0] - L[0], H[1] - L[1]));
  LEG_CLIP.set(h, Math.hypot(H[0] - L[0], H[1] - L[1]) * 0.5);
}

/**
 * ★**体（脚以外）を層ごとに 1 枚へ焼く。** ★静止姿勢のまま固めます。
 *   ★複製は互いに隠れた状態で固定されるので、★回しても出てきません。
 */
const BODY = {};
for (const layer of LAYERS) {
  const parts = list.filter((p) => p.layer === layer && !LEG_NAMES.has(p.name))
    .sort((a, b) => a.z - b.z);
  if (parts.length === 0) { BODY[layer] = null; continue; }
  const c = createCanvas(SIZE, SIZE);
  const g = c.getContext('2d');
  for (const p of parts) g.drawImage(images.get(p.name), 0, 0);
  BODY[layer] = c;
}

mkdirSync(OUT, { recursive: true });

for (let f = 0; f < FRAMES; f += 1) {
  const travel = (f / FRAMES) * gait.strideM;
  const pose = deformedPoseAt({ travelM: travel, gate: 1, speedMps: 16, contract, gait, standBend: STAND });
  const pitch = pose.torso.angleRad;
  const pitch0 = ref.torso.angleRad;
  const toPx = (q) => ({ x: TX + q.x * PXM, y: GROUND_Y - q.y * PXM });
  const torsoAt = toPx({ x: pose.torso.x, y: pose.torso.y });
  const onTorso = (m, extra = 0) => {
    const a = -pitch + extra;
    const dx = m.x * PXM; const dy = -m.y * PXM;
    return { x: torsoAt.x + dx * Math.cos(a) - dy * Math.sin(a), y: torsoAt.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  const extraOf = (name) => {
    /**
     * ⚠️ ★**騎手には追い角を当てません。**
     *    ★承認済み原画の騎手は**既に正しく深く伏せて**おり、前傾は **7.0%**（合格線 6%）あります。
     *    ★そこへリグの騎手角の差分を足したら、★**2.3% まで落ちました**（＝起こしてしまった）。
     *    ★リグの騎手模型は「棒が刺さって見える」と差し戻された頃の名残なので、
     *    ★**絵が既に持っている姿勢を壊さない**方を採ります。
     */
    if (name.startsWith('jockey')) return 0;
    const a = pose.parts[name]; const b = ref.parts[name];
    if (a === undefined || b === undefined) return 0;
    if (name === 'neck' || name === 'mane' || name === 'head') {
      return -((a.angleRad - b.angleRad) - (pitch - pitch0));
    }
    return -(a.angleRad - b.angleRad);
  };

  const place = new Map();
  const angle = new Map();
  for (const leg of DEFORMED_LEG_IDS) {
    const [u, l, h] = LEG_PARTS[leg];
    const L = pose.legs[leg];
    const mu = restM.get(u); const ml = restM.get(l); const mh = restM.get(h);
    const upArt = Math.atan2(ml.y - mu.y, ml.x - mu.x);
    const loArt = Math.atan2(mh.y - ml.y, mh.x - ml.x);
    const upNow = Math.atan2(L.knee.y - L.hip.y, L.knee.x - L.hip.x);
    const loNow = Math.atan2(L.hoof.y - L.knee.y, L.hoof.x - L.knee.x);
    angle.set(u, -(upNow - upArt)); angle.set(l, -(loNow - loArt)); angle.set(h, -(loNow - loArt));
    place.set(u, toPx(L.hip)); place.set(l, toPx(L.knee)); place.set(h, toPx(L.hoof));
  }
  const neckExtra = extraOf('neck');
  const neckM = restM.get('neck');
  for (const p of list) {
    if (place.has(p.name)) continue;
    const m = restM.get(p.name);
    if ((p.name === 'mane' || p.name === 'head') && neckM !== undefined) {
      /**
       * ⚠️ ★**首の根元を、追い角で動かさないこと。**
       *    ★元は `onTorso(neckM, neckExtra)` としており、★追い角があると
       *    ★**首の付け根まで胴体の中心のまわりを回って**いました
       *    （★騎手で直したのと同じ誤り・★レビュー裁定 2026-09-06 §6）。
       * → ★根元は胴に固定（★傾きぶんだけ）、★追い角は**そこから先の回転**に使います。
       */
      const nAt = onTorso(neckM, 0);
      const a = -pitch + neckExtra;
      const dx = (m.x - neckM.x) * PXM; const dy = -(m.y - neckM.y) * PXM;
      place.set(p.name, { x: nAt.x + dx * Math.cos(a) - dy * Math.sin(a), y: nAt.y + dx * Math.sin(a) + dy * Math.cos(a) });
      angle.set(p.name, a + (extraOf(p.name) - neckExtra));
      continue;
    }
    /**
     * ⚠️ ★**追い角を「取り付け位置の回転」に使わないこと。**
     *    ★1 度目はそうしたので、★騎手が胴体ピボットを中心に振り回されて
     *    ★**後ろへずり落ちました**（★測定④の前傾が −0.2% になりました）。
     * → ★位置は胴体に固定（傾きぶんだけ）、★追い角は**そのパーツ自身の回転**へ。
     */
    const extra = extraOf(p.name);
    place.set(p.name, onTorso(m, 0));
    angle.set(p.name, -pitch + extra);
  }

  for (const layer of LAYERS) {
    const c = createCanvas(SIZE, SIZE);
    const g = c.getContext('2d');
    const order = list.slice().sort((a, b) => zOf(a) - zOf(b));
    const drawPart = (p) => {
      const at = place.get(p.name); const an = angle.get(p.name) ?? 0;
      const [px, py] = p.pivot;
      g.save();
      g.translate(at.x, at.y);
      g.rotate(an);
      const bone = LEG_CLIP.get(p.name);
      if (bone !== undefined) { g.beginPath(); g.rect(-9999, -bone * KEEP, 19998, 19998); g.clip(); }
      g.drawImage(images.get(p.name), -px, -py);
      g.restore();
    };
    if (RIGID_BODY) {
      /** ★奥の脚 → ★体（1 枚の剛体）→ ★手前の脚 */
      for (const p of order) if (p.layer === layer && LEG_NAMES.has(p.name) && zOf(p) < 10) drawPart(p);
      const body = BODY[layer];
      if (body !== null) {
        g.save();
        g.translate(torsoAt.x, torsoAt.y);
        g.rotate(-pitch);
        g.drawImage(body, -TX, -TY);
        g.restore();
      }
      for (const p of order) if (p.layer === layer && LEG_NAMES.has(p.name) && zOf(p) >= 10) drawPart(p);
    } else {
      for (const p of order) if (p.layer === layer) drawPart(p);
    }
    writeFileSync(path.join(OUT, `${String(f + 1).padStart(2, '0')}_${layer}.png`), c.toBuffer('image/png'));
  }
}
/**
 * ★**実機へ入れるところまで、この道具の中でやります**（★2026-09-06）
 *
 * ⚠️ ★焼き先 `tmp/baked` と、★Web が読む `/rig-lab-assets/sprites` が別だったため、
 *    ★**焼いたものとブラウザで見たものが同じだと言えませんでした**
 *    （★レビュー裁定 2026-09-06 §6）。★`--install` で 1 本に繋ぎます。
 * ⚠️ ★素材は横長です。★正方に押し込むと**馬が半分の大きさ・半分の解像度**になります
 *    （★2026-09-06 の「道産子」の正体）。★寸法は `sprite.json` に書き出します。
 */
if (process.argv.includes('--install')) {
  const DEST = 'apps/web/public/rig-lab-assets/sprites';
  const OUT_H = 384;
  let left = 1e9; let right = -1; let top = 1e9;
  const probe = createCanvas(SIZE, SIZE);
  const pg = probe.getContext('2d');
  for (let f = 1; f <= FRAMES; f += 1) {
    pg.clearRect(0, 0, SIZE, SIZE);
    for (const l of LAYERS) pg.drawImage(await loadImage(path.join(OUT, `${String(f).padStart(2, '0')}_${l}.png`)), 0, 0);
    const d = pg.getImageData(0, 0, SIZE, SIZE).data;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (d[(y * SIZE + x) * 4 + 3] < 64) continue;
        if (x < left) left = x; if (x > right) right = x; if (y < top) top = y;
      }
    }
  }
  const FEET = 0.920;
  const hc = Math.round((GROUND_Y - top) / FEET) + 40;
  const wc = (right - left) + 60;
  const ty = Math.round(GROUND_Y - FEET * hc);
  const lx = left - 30;
  const outW = Math.round((OUT_H * wc) / hc / 2) * 2;
  mkdirSync(DEST, { recursive: true });
  for (const fn of readdirSync(DEST)) {
    if (fn.endsWith('.png') || fn.endsWith('.json')) rmSync(path.join(DEST, fn));
  }
  for (let f = 1; f <= FRAMES; f += 1) {
    for (const l of LAYERS) {
      const name = `${String(f).padStart(2, '0')}_${l}.png`;
      const im = await loadImage(path.join(OUT, name));
      const c = createCanvas(outW, OUT_H);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, lx, ty, wc, hc, 0, 0, outW, OUT_H);
      writeFileSync(path.join(DEST, name), c.toBuffer('image/png'));
    }
  }
  writeFileSync(path.join(DEST, 'sprite.json'),
    JSON.stringify({ width: outW, height: OUT_H, feet: FEET, frames: FRAMES }, null, 1));
  console.log(`★実機へ入れました → ${DEST}  ${outW}x${OUT_H}・接地線 ${((GROUND_Y - ty) / hc).toFixed(4)}`);
}

console.log(`★${FRAMES} コマ × ${LAYERS.length} 層 → ${OUT}`);
console.log(`   立ち高さ ${STAND} / 宙での伸び ${OVER}m / 蹄の上がり ×${LIFT} / 1 完歩 ${STRIDE}m`);
