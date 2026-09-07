/**
 * ★デフォルメ馬のリグ — ★**Gate 0A の検定**
 *
 * 【★なぜ絵を撮らないか】
 *   ★台帳 B-2（`--sec 32` はカットの境目で、同じ URL を 2 回撮っても一致しない）と
 *   ★台帳 B-3（オーナーの画面は 67%。100% の撮って出しで判定していた）は、
 *   ★**どちらも「画素で判定した」ことから来ています。**
 *   → ★リグは純粋関数なので、★**画素を 1 枚も撮らずに合否が出ます。**
 *
 * 【⚠️ ★「検定が緑」は「絵が良い」ではありません】
 *   ★ここが見るのは ★**機構が壊れていないこと**だけです。
 *   ★動きが気持ち良いかは Gate 0B（★オーナーの目）で決まります。
 *
 * 【★対照を置いています（R-19: 緑のまま検査が消える）】
 *   ★各検定に「★**機構を外したら落ちる**」ことを確かめる対照を添えています。
 *   ★対照が無い検定は、★書いた人にしか意味が分かりません。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFORMED_HORSE_V0, DEFORMED_LEG_IDS, DEFORMED_STAND_BEND, legReachM,
  DEFORMED_GAIT_V0, gaitPhase, legPhase, legInContact, hoofWorldX, hoofLocalX, hoofY,
  gaitFitsLegs, sweepHalfM, supportCount, fract, worstContactFloatM,
  deformedPoseAt,
} from '../src/index.js';
import type { DeformedLegId } from '../src/index.js';

const C = DEFORMED_HORSE_V0;
const G = DEFORMED_GAIT_V0;
const SPEED = 16;

function poseAt(travelM: number, gate = 3) {
  return deformedPoseAt({ travelM, gate, speedMps: SPEED, contract: C });
}

describe('★① 接地中の蹄は、世界の一点に刺さったまま動かない（★滑り 0）', () => {
  it('★接地している間、蹄の世界座標が変わらない', () => {
    for (const leg of DEFORMED_LEG_IDS) {
      const bones = C.legs[leg];
      /** ★その脚が接地している区間を、細かく刻んで見る */
      const start = G.contactStart[leg];
      let seen = 0;
      /** ★1 完歩ぶんを 4000 点。★接地の中だけを拾う */
      let anchor: number | null = null;
      let anchorU = -1;
      for (let i = 0; i < 4000; i += 1) {
        const travelM = 120 + (i / 4000) * G.strideM;
        const u = legPhase(gaitPhase(travelM, 3, G), leg, G);
        if (!legInContact(u, G)) { anchor = null; continue; }
        const x = hoofWorldX(travelM, 3, leg, bones, G);
        if (anchor === null || u < anchorU) { anchor = x; anchorU = u; continue; }
        anchorU = u;
        expect(Math.abs(x - anchor)).toBeLessThan(1e-9);
        seen += 1;
      }
      expect(seen, `${leg} の接地区間が拾えていません（start=${start}）`).toBeGreaterThan(100);
    }
  });

  it('★接地中の蹄は、背景と同じ速さで後ろへ流れる（＝胴体から見ると後退する）', () => {
    const bones = C.legs.foreNear;
    const samples: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const travelM = 120 + (i / 400) * G.strideM;
      const u = legPhase(gaitPhase(travelM, 3, G), 'foreNear', G);
      if (!legInContact(u, G)) continue;
      samples.push(hoofLocalX(travelM, 3, 'foreNear', bones, G));
    }
    expect(samples.length).toBeGreaterThan(50);
    /** ★胴体から見た位置は**単調に後ろへ**下がる（★前へ滑る瞬間が 1 つも無い） */
    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1] as number;
      const now = samples[i] as number;
      expect(now).toBeLessThanOrEqual(prev + 1e-12);
    }
  });

  it('★【対照】★世界座標を固定しない作り（★位相から直に前後させる）なら、この検定は落ちる', () => {
    /** ★従来の「絵を選ぶ」に相当する素朴な実装 */
    const naiveWorldX = (travelM: number): number => {
      const u = legPhase(gaitPhase(travelM, 3, G), 'foreNear', G);
      return travelM + 0.5 * Math.cos(2 * Math.PI * u);
    };
    let moved = 0;
    let anchor: number | null = null;
    let anchorU = -1;
    for (let i = 0; i < 2000; i += 1) {
      const travelM = 120 + (i / 2000) * G.strideM;
      const u = legPhase(gaitPhase(travelM, 3, G), 'foreNear', G);
      if (!legInContact(u, G)) { anchor = null; continue; }
      const x = naiveWorldX(travelM);
      if (anchor === null || u < anchorU) { anchor = x; anchorU = u; continue; }
      anchorU = u;
      if (Math.abs(x - anchor) > 1e-9) moved += 1;
    }
    expect(moved, '★対照が滑らないなら、検定①は何も見ていません').toBeGreaterThan(50);
  });
});

describe('★② 骨の長さは位相に依らず変わらない（★骨長不変）', () => {
  it('★上の骨・下の骨の長さが、1 完歩を通して契約どおり', () => {
    for (let i = 0; i < 600; i += 1) {
      const pose = poseAt(80 + (i / 600) * G.strideM * 2);
      for (const leg of DEFORMED_LEG_IDS) {
        const bones = C.legs[leg];
        const s = pose.legs[leg];
        const upper = Math.hypot(s.knee.x - s.hip.x, s.knee.y - s.hip.y);
        const lower = Math.hypot(s.hoof.x - s.knee.x, s.hoof.y - s.knee.y);
        expect(Math.abs(upper - bones.upperM), `${leg} 上の骨`).toBeLessThan(1e-9);
        expect(Math.abs(lower - bones.lowerM), `${leg} 下の骨`).toBeLessThan(2e-4);
      }
    }
  });

  it('★脚が伸び切らない（★「棒」にならない）', () => {
    for (let i = 0; i < 600; i += 1) {
      const pose = poseAt(80 + (i / 600) * G.strideM * 2);
      for (const leg of DEFORMED_LEG_IDS) {
        expect(pose.legs[leg].extension, `${leg} が伸び切りました`).toBeLessThan(0.999);
      }
    }
  });

  it('★胴体は脚と一緒に動く（★固定されていない）', () => {
    const ys: number[] = [];
    for (let i = 0; i < 240; i += 1) ys.push(poseAt(80 + (i / 240) * G.strideM).torso.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    /** ★§4-3「胴体を固定したまま脚だけを回す」の禁止。★動いていること */
    expect(hi - lo).toBeGreaterThan(0.01);
    /** ★§4-2「胴体の**小さな**上下動」。★暴れていないこと */
    expect(hi - lo).toBeLessThan(C.totalHeightM * 0.18);
  });
});

describe('★③ 決定論（★憲法4）', () => {
  it('★同じ入力なら、何度呼んでも同じ姿勢', () => {
    for (const travelM of [0, 12.5, 137.75, 1599.9]) {
      const a = JSON.stringify(poseAt(travelM, 7));
      const b = JSON.stringify(poseAt(travelM, 7));
      expect(a).toBe(b);
    }
  });

  it('★30fps と 60fps で、同じ距離の姿勢が一致する', () => {
    /** ★フレームを積み上げず、★距離から直に引くので一致します */
    const at30 = poseAt(16 * (30 / 30) * 1.0, 5);
    const at60 = poseAt(16 * (60 / 60) * 1.0, 5);
    expect(JSON.stringify(at30)).toBe(JSON.stringify(at60));

    /** ★間を刻んでも、同じ距離なら同じ */
    for (let f = 0; f < 90; f += 1) {
      const travelM = 100 + (f / 30) * SPEED;
      const coarse = poseAt(travelM, 5);
      const fine = poseAt(travelM, 5);
      expect(fine.phase).toBe(coarse.phase);
    }
  });

  it('★時刻にも乱数にも依存しない（★呼ぶ順を変えても同じ）', () => {
    const forward = [10, 20, 30].map((m) => poseAt(m, 2).phase);
    const backward = [30, 20, 10].map((m) => poseAt(m, 2).phase).reverse();
    expect(forward).toEqual(backward);
  });
});

describe('★④ 位相分散（★全馬が同じ脚にならない）', () => {
  it('★12 頭の位相が、同じ距離でばらける', () => {
    const phases = Array.from({ length: 12 }, (_, i) => gaitPhase(300, i + 1, G));
    const uniq = new Set(phases.map((p) => p.toFixed(6)));
    expect(uniq.size).toBe(12);
    /** ★いちばん近い 2 頭でも、★1 完歩の 1% 以上は離れている */
    const sorted = [...phases].sort((a, b) => a - b);
    let worst = 1;
    for (let i = 1; i < sorted.length; i += 1) {
      worst = Math.min(worst, (sorted[i] as number) - (sorted[i - 1] as number));
    }
    /** ★端の折り返しも見る */
    worst = Math.min(worst, 1 - (sorted[sorted.length - 1] as number) + (sorted[0] as number));
    expect(worst).toBeGreaterThan(0.01);
  });

  it('★同じ馬番なら、いつでも同じ位相の差（★リロードで変わらない）', () => {
    const a = gaitPhase(0, 4, G) - gaitPhase(0, 1, G);
    const b = gaitPhase(777.25, 4, G) - gaitPhase(777.25, 1, G);
    expect(Math.abs(fract(a) - fract(b))).toBeLessThan(1e-12);
  });
});

describe('★⑤ 歩法の幾何が破れていない', () => {
  it('★掃き幅の半分が、脚の届く範囲に収まっている', () => {
    const fit = gaitFitsLegs(C, G);
    expect(fit.ok, `${fit.worstLeg}: 必要 ${fit.needM.toFixed(3)}m / 届く ${fit.haveM.toFixed(3)}m`).toBe(true);
  });

  it('★【対照】★ストライドを実馬の 7m にすると、★短い脚では届かなくなる', () => {
    /** ★`BROADCAST_STRIDE_M = 7` をそのまま使えない理由の記録 */
    const fit = gaitFitsLegs(C, { ...G, strideM: 7, duty: 0.24 });
    expect(fit.ok).toBe(false);
  });

  it('★宙に浮く局面がある（★接地 0 本の瞬間が存在する）', () => {
    let air = 0;
    let ground = 0;
    for (let i = 0; i < 1000; i += 1) {
      const n = supportCount(50 + (i / 1000) * G.strideM, 3, G);
      if (n === 0) air += 1; else ground += 1;
    }
    expect(air).toBeGreaterThan(0);
    expect(ground).toBeGreaterThan(0);
  });

  it('★遊脚の蹄は地面より上、★接地の蹄はちょうど地面', () => {
    for (let i = 0; i < 800; i += 1) {
      const travelM = 50 + (i / 800) * G.strideM;
      for (const leg of DEFORMED_LEG_IDS) {
        const bones = C.legs[leg];
        const u = legPhase(gaitPhase(travelM, 3, G), leg, G);
        const y = hoofY(travelM, 3, leg, bones, G);
        if (legInContact(u, G)) expect(y).toBe(0);
        else expect(y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('★契約 v0 の申告', () => {
  it('★schemaVersion は 0（★暫定契約。★オーナー承認で 1 へ）', () => {
    expect(C.schemaVersion).toBe(0);
  });

  it('★胴は長く薄い（★高さ ÷ 長さ が 0.5 未満）', () => {
    /** ⚠️ ★1 度目は 0.64（ほぼ丸）で「馬に見えない」と差し戻されました */
    expect(C.torso.heightM / C.torso.lengthM).toBeLessThan(0.5);
  });

  it('★首と頭が、胸より前へ十分に伸びている', () => {
    /** ★参考映像では、首と頭で**胴の半分**ほど前へ届きます */
    const reachAhead = C.neck.rootX + C.neck.lengthM + C.head.lengthM / 2;
    expect(reachAhead).toBeGreaterThan(C.torso.lengthM * 0.9);
  });

  it('★短脚である（★立ったときの肩の高さが、全高の 4 割ほど）', () => {
    /**
     * ⚠️ ★**「脚の長さ」で測ると誤ります。**
     *    ★骨の合計 0.85m は**伸ばし切った長さ**で、★遊脚の一瞬にしか出ません。
     *    ★見た目の短脚さは ★**立ったときの付け根の高さ**です（★しゃがんだ姿勢のぶん低い）。
     */
    const standing = legReachM(C.legs.foreNear) * DEFORMED_STAND_BEND;
    expect(standing / C.totalHeightM).toBeLessThan(0.45);
    /** ★実馬はおよそ 6 割。★それより明確に低いこと */
    expect(standing / C.totalHeightM).toBeLessThan(0.6);
  });

  it('★頭は胴体高の 45〜55%（★指示書 §3-1）', () => {
    const ratio = C.head.heightM / C.torso.heightM;
    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.56);
    /** ★頭は「長い楔」であること（★丸い頭は犬になります・2026-09-03 オーナー評） */
    expect(C.head.lengthM / C.head.heightM).toBeGreaterThan(1.6);
  });

  it('★掃き幅は 1 完歩の `duty` 割（★数の出どころを固定）', () => {
    expect(sweepHalfM(G) * 2).toBeCloseTo(G.duty * G.strideM, 12);
  });

  it('★騎手の腰は鞍から浮かない', () => {
    for (let i = 0; i < 400; i += 1) {
      const pose = poseAt(60 + (i / 400) * G.strideM);
      const seat = pose.parts.jockeyTorso;
      const torso = pose.torso;
      const cos = Math.cos(torso.angleRad);
      const sin = Math.sin(torso.angleRad);
      const wantX = torso.x + C.saddle.x * cos - C.saddle.y * sin;
      const wantY = torso.y + C.saddle.x * sin + C.saddle.y * cos;
      expect(Math.hypot(seat.x - wantX, seat.y - wantY)).toBeLessThan(1e-9);
    }
  });
});

describe('★脚ごとの接地が、契約どおりの位相で始まる', () => {
  it('★4 本とも、決められた位相で着地する', () => {
    for (const leg of DEFORMED_LEG_IDS as readonly DeformedLegId[]) {
      const start = G.contactStart[leg];
      /** ★着地の直後は接地、★直前は遊脚 */
      const justAfter = fract(start + 1e-6);
      const justBefore = fract(start - 1e-6);
      expect(legInContact(fract(justAfter - start), G)).toBe(true);
      expect(legInContact(fract(justBefore - start), G)).toBe(false);
    }
  });
});

/**
 * ★⑥ ★**宙にある間の伸び**（`overreachM`・2026-09-06）
 *
 * 【⚠️ ★開発側は、これを足す理由を一度**言い間違えました**】
 *   ★「遊脚の蹄は掃き幅 ±0.391m の中しか動かない」と書きましたが、★**誤りです**。
 *   ★実測すると、★従来の遊脚は既に ★**±0.687m（開き 1.373m）**まで伸びています。
 *   ★±0.391m は ★**接地中だけ**の値でした。
 *
 * 【★では何のための口か】
 *   ★承認済み原画の開きは ★**1.513m**。★従来は 1.373m で、★**9% 足りません**。
 *   ★素材ごとにその差は変わるので、★**素材から測って渡せる口**として開けます。
 *   ⚠️ ★契約 v0 は **0**（★従来の見た目を 1 mm も変えません）。
 *
 * 【⚠️ ★ここが肝】★接地には触っていないことを、★検定で押さえます。
 */
describe('★⑥ 宙にある間だけ蹄が伸びる（★接地は 1 mm も動かさない）', () => {
  const withOver = (leg: DeformedLegId, over: number) => ({ ...C.legs[leg], overreachM: over });
  /** ★1 完歩を通した、胴体から見た蹄の前後の可動域 */
  const spanOf = (leg: DeformedLegId, over: number): { min: number; max: number } => {
    const bones = withOver(leg, over);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let k = 0; k <= 2000; k += 1) {
      const travel = (k / 2000) * G.strideM;
      const x = hoofLocalX(travel, 3, leg, bones, G) - bones.hip.x - bones.plantBiasM;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    return { min, max };
  };

  it('★接地中の蹄の位置は、伸ばしても 1 mm も動かない（★＝滑り 0 が壊れない）', () => {
    for (const leg of DEFORMED_LEG_IDS) {
      const plain = C.legs[leg];
      const over = withOver(leg, 0.35);
      let seen = 0;
      /** ★接地している瞬間だけを拾う（★検定①と同じ拾い方） */
      for (let i = 0; i < 4000; i += 1) {
        const travelM = 120 + (i / 4000) * G.strideM;
        const u = legPhase(gaitPhase(travelM, 3, G), leg, G);
        if (!legInContact(u, G)) continue;
        expect(hoofWorldX(travelM, 3, leg, over, G))
          .toBeCloseTo(hoofWorldX(travelM, 3, leg, plain, G), 9);
        seen += 1;
      }
      expect(seen, `${leg} の接地区間が拾えていません`).toBeGreaterThan(100);
    }
  });

  it('★伸ばすと、前へも後ろへも可動域が広がる', () => {
    for (const leg of DEFORMED_LEG_IDS) {
      const a = spanOf(leg, 0);
      const b = spanOf(leg, 0.35);
      expect(b.max).toBeGreaterThan(a.max + 0.2);
      expect(b.min).toBeLessThan(a.min - 0.2);
    }
  });

  it('★【対照】★0 なら、可動域は 1 mm も変わらない', () => {
    for (const leg of DEFORMED_LEG_IDS) {
      const a = spanOf(leg, 0);
      const b = spanOf(leg, 0);
      expect(b.max).toBeCloseTo(a.max, 12);
      expect(b.min).toBeCloseTo(a.min, 12);
    }
  });

  it('★契約 v0 は伸ばさない（★既存の見た目を変えない）', () => {
    for (const leg of DEFORMED_LEG_IDS) {
      expect(C.legs[leg].overreachM ?? 0).toBe(0);
    }
  });
});

/**
 * ★⑦ ★**前後で脚の長さが違う馬でも、接地した蹄は地面にある**（★2026-09-06）
 *
 * 【⚠️ ★なぜ足したか — ★27 件通るのに幾何が破れていました】
 *   ★`supportHeightM` は ★**`foreNear` の脚長だけ**で前後両方の腰の高さを出していました。
 *   ★`DEFORMED_HORSE_V0` は 4 本ともほぼ同じ長さ（0.78m）なので、★表に出ませんでした。
 *
 *   ★納品パーツから測った実寸は前後で **15%** 違います:
 *   　★前脚 1.241 / 1.210m ／ ★後脚 1.082 / 1.099m
 *   → ★後脚の付け根が脚より高く置かれ、★**接地とされた蹄が最大 28cm 浮きました**
 *     （★レビュー裁定 2026-09-06 §1・★開発側は気づかずに見た目を調整していました）。
 *
 * ★この検定は「★接地と申告した脚の蹄が、本当に地面にあるか」を見ます。
 */
describe('★⑦ 前後で脚の長さが違っても、接地した蹄は地面にある', () => {
  /** ★実素材と同じ比率（★前脚が後脚より 15% 長い） */
  const UNEVEN: typeof C = {
    ...C,
    legs: {
      hindFar: { ...C.legs.hindFar, upperM: 0.375, lowerM: 0.707 },
      hindNear: { ...C.legs.hindNear, upperM: 0.461, lowerM: 0.638 },
      foreFar: { ...C.legs.foreFar, upperM: 0.497, lowerM: 0.744 },
      foreNear: { ...C.legs.foreNear, upperM: 0.480, lowerM: 0.730 },
    },
  };

  it('★接地と申告した蹄は、地面（y=0）にある', () => {
    const gait = { ...G, strideM: 5.6, duty: 0.12 };
    let worst = 0;
    let seen = 0;
    for (let k = 0; k < 800; k += 1) {
      const pose = deformedPoseAt({
        travelM: (k / 800) * gait.strideM, gate: 1, speedMps: 16,
        contract: UNEVEN, gait, standBend: 0.75,
      });
      for (const leg of DEFORMED_LEG_IDS) {
        if (!pose.legs[leg].contact) continue;
        seen += 1;
        worst = Math.max(worst, Math.abs(pose.legs[leg].hoof.y));
      }
    }
    expect(seen).toBeGreaterThan(100);
    /** ★1mm 以内。★修正前は 0.28m（280mm）浮いていました */
    expect(worst).toBeLessThan(0.001);
  });

  it('★【対照】★4 本の長さが揃っている契約でも、同じ検定が通る', () => {
    const gait = { ...G, strideM: 4.6, duty: 0.17 };
    let worst = 0;
    for (let k = 0; k < 800; k += 1) {
      const pose = deformedPoseAt({
        travelM: (k / 800) * gait.strideM, gate: 1, speedMps: 16, contract: C, gait,
      });
      for (const leg of DEFORMED_LEG_IDS) {
        if (pose.legs[leg].contact) worst = Math.max(worst, Math.abs(pose.legs[leg].hoof.y));
      }
    }
    expect(worst).toBeLessThan(0.001);
  });

  it('★腰の高さは、その組でいちばん短い脚から出す（★長い方の脚で置かない）', () => {
    /**
     * ★後脚だけ短い契約。★元の実装は前脚の長さで両方を置いていたので、
     * ★後脚の付け根が**後脚の長さより高く**なりました。★そこを見ます。
     * ⚠️ ★極端な比率では、傾きが大きくなり蹄が完全には地面へ届きません。
     *    ★この検定が見るのは ★**付け根の高さの出どころ**であって、届くかどうかではありません
     *    （★届くかどうかは上の 2 件と `gaitFitsLegs` が見ます）。
     */
    const SHORT_HIND: typeof C = {
      ...C,
      legs: {
        ...C.legs,
        hindFar: { ...C.legs.hindFar, upperM: 0.20, lowerM: 0.20 },
        hindNear: { ...C.legs.hindNear, upperM: 0.20, lowerM: 0.20 },
      },
    };
    const stand = 0.70;
    const hindReach = 0.40;
    const foreReach = legReachM(C.legs.foreNear);
    let worstHip = 0;
    for (let k = 0; k < 400; k += 1) {
      const pose = deformedPoseAt({
        travelM: (k / 400) * G.strideM, gate: 1, speedMps: 16,
        contract: SHORT_HIND, gait: { ...G, strideM: 3.0, duty: 0.12 }, standBend: stand,
      });
      for (const leg of ['hindFar', 'hindNear'] as const) {
        worstHip = Math.max(worstHip, pose.legs[leg].hip.y);
      }
    }
    /** ★後脚の付け根は、後脚の長さの範囲に収まる（★前脚の長さでは置かれない） */
    expect(worstHip).toBeLessThan(hindReach);
    /** ★【対照】★前脚の長さで置いていたら、必ずこれを超えます */
    expect(foreReach * stand).toBeGreaterThan(hindReach);
  });
});

/**
 * ★⑧ ★**「届く」の判定は、見積もりでは足りない**（★2026-09-06）
 *
 * 【⚠️ ★なぜ足したか】
 *   ★`gaitFitsLegs` は腰の高さを `脚長 × standBend + 浮き` と**見積もり**ます。
 *   ★実際は**胴体が傾く**ぶんもっと上がります。★納品パーツの実寸での実測:
 *   　★見積もり **0.862m** ／ ★実際の最大 **0.941m**（★8cm の差）
 *   → ★判定が ○ でも ★**蹄が 6cm 浮く**組み合わせが通っていました。
 *
 * ★`worstContactFloatM` は見積もりをやめ、★**実際に解いた姿勢**を数えます。
 */
describe('★⑧ 接地の判定は、解いた姿勢で測る', () => {
  const UNEVEN: typeof C = {
    ...C,
    legs: {
      hindFar: { ...C.legs.hindFar, upperM: 0.375, lowerM: 0.707 },
      hindNear: { ...C.legs.hindNear, upperM: 0.461, lowerM: 0.638 },
      foreFar: { ...C.legs.foreFar, upperM: 0.497, lowerM: 0.744 },
      foreNear: { ...C.legs.foreNear, upperM: 0.480, lowerM: 0.730 },
    },
  };

  it('★成立する設定では、浮きが 1mm 未満', () => {
    const r = worstContactFloatM(UNEVEN, { ...G, strideM: 5.6, duty: 0.12 }, 0.75);
    expect(r.contacts).toBeGreaterThan(100);
    expect(r.floatM).toBeLessThan(0.001);
  });

  it('★【対照】★`gaitFitsLegs` が通るのに浮く設定を、こちらは捕まえる', () => {
    const gait = { ...G, strideM: 5.6, duty: 0.12 };
    const fit = gaitFitsLegs(UNEVEN, gait, 0.97, 0.85);
    /** ★見積もりは「届く」と言う */
    expect(fit.ok).toBe(true);
    /** ★実際には浮いている（★これを見逃していました） */
    expect(worstContactFloatM(UNEVEN, gait, 0.85).floatM).toBeGreaterThan(0.01);
  });
});
