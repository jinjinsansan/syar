/**
 * ★レース観戦（PR4）— **エンジン + コース幾何 + カメラ + スプライト**
 *
 * 【これまでとの違い】
 *   `/watch`  … 1次元の横スクロール（★コーナーが無い）
 *   `/course` … コース幾何だけ（点）
 *   `/camera` … カメラだけ（丸）
 *   ★ここ    … **全部を繋いだもの**
 *
 * 【★守っていること】
 *   ・**着順はエンジンが決めたもの**（開始時に D-059 のゲートを通す）
 *   ・横位置 `w` は**見せているだけ**（★距離ロスは着順に効かせていません・D-065 は裁定待ち）
 *   ・カメラは**見え方だけ**を変える
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches } from '@star/race-engine';
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  ovalCourse, posOf, courseToScreen, segmentAt, cutsFor, cutAt, blendCamera, focusOf,
  HORSE_LENGTH_M, type CameraPose, type CameraState,
} from '@star/render';
import { loadAtlas, type SpriteAtlas } from '../../lib/canvas-renderer';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const VP = { width: 1280, height: 640 };
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const SPRITE_W = 220;
const SPRITE_H = 140;

/** ★脚質ごとの「だいたいの横位置」（内ラチからの距離 m）。**見せているだけ** */
const LANE_BY_STRATEGY: Record<Strategy, number> = { nige: 3, senko: 5, sashi: 8, oikomi: 12 };

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly wOf: (gate: number, s: number) => number;
  readonly pace: 'slow' | 'middle' | 'high';
  readonly result: readonly { place: number; gate: number; margin: string }[];
}

function build(seed: number, ownGate: number, jostle: number): Built {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4]!, condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `r${seed}`, distance: DIST, surface: 'turf' as const,
    trackCondition: 'good' as const, courseShape: 'oval' as const, baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);
  if (!finalOrderMatches(result, boundaries)) throw new Error('映像の着順が確定着順と違います（D-059）');
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    jostle, jostleSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('位置モデルの最終順が着順と違います（D-059）');
  }
  return {
    model,
    warp: timeWarpFor(knotsFor(boundaries, ownGate), DEFAULT_PHASE_RATES),
    /**
     * ★**横位置**（内ラチからの距離 m）。**見せているだけ**。
     *
     * ⚠️ 以前は脚質だけで決めていたので、**発走時に全馬が同じところに重なりました**
     *    （スクリーンショットで団子になっていたのはこれです）。
     * ★実際のゲートは**枠順どおり横一線**に並びます。
     *   → 発走時は枠順で走路いっぱいに広げ、**最初の 300m で脚質の位置へ寄せます**。
     */
    wOf: (g, s2) => {
      const gateW = 1.6 + ((g - 1) / (FIELD - 1)) * 16.8;
      const laneW = LANE_BY_STRATEGY[entrants[g - 1]!.strategy] + ((g * 7) % 5) * 0.9;
      const k = Math.max(0, Math.min(1, s2 / 300));
      const e = k * k * (3 - 2 * k);
      return gateW + (laneW - gateW) * e;
    },
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
  };
}

export default function RacePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasRef = useRef<SpriteAtlas | null>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0);
  const dRef = useRef(0);

  const [seed, setSeed] = useState(42);
  const [ownGate, setOwnGate] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  const course = ovalCourse(DIST);
  const cuts = cutsFor(course);

  useEffect(() => {
    loadAtlas(18)
      .then((a) => { atlasRef.current = a; setReady(true); })
      .catch((e: unknown) => setErr(`スプライトを読み込めません: ${String(e)}`));
  }, []);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate, 0.25)); setErr(null); } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    setClock(0);
  }, [seed, ownGate]);

  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const atlas = atlasRef.current;
    if (cv === null || atlas === null || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = false;

    const sec = built.warp.raceSecAt(d);
    const horses = built.model.at(sec).map((h) => ({ gate: h.gate, s: h.meters, w: built.wOf(h.gate, h.meters) }));
    const lead = Math.max(...horses.map((h) => h.s));
    const metersLeft = DIST - lead;

    const { cut, prev } = cutAt(cuts, metersLeft);
    let state: CameraState = cut.state;
    if (prev !== undefined && cut.blendSec > 0) {
      const into = Math.max(0, (prev.fromMetersLeft - metersLeft) / 16);
      state = blendCamera(prev.state, cut.state, into / cut.blendSec);
    }
    const focusS = focusOf(state.targetMode, horses, ownGate, HORSE_LENGTH_M);
    const c0 = posOf(course, focusS, course.widthM / 2);
    const pose: CameraPose = { state, centre: { x: c0.x, y: c0.y }, heading: c0.heading };

    // ★空と、走路の外の芝
    ctx.fillStyle = '#8fb8cf';
    ctx.fillRect(0, 0, VP.width, VP.height * 0.42);
    ctx.fillStyle = '#3d6438';
    ctx.fillRect(0, VP.height * 0.42, VP.width, VP.height * 0.58);

    const near = 300;
    const clampS = (s: number): number => Math.max(0, Math.min(DIST, s));

    // ★走路の面（内ラチ〜外ラチ）
    ctx.fillStyle = '#4b7a41';
    ctx.beginPath();
    for (let s = focusS - near; s <= focusS + near; s += 6) {
      const p = courseToScreen(course, pose, VP, clampS(s), 0);
      if (s === focusS - near) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    for (let s = focusS + near; s >= focusS - near; s -= 6) {
      const p = courseToScreen(course, pose, VP, clampS(s), course.widthM);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    /**
     * ★**芝の刈り目**（走路を横切る帯）。
     *
     * ⚠️ これが無いと芝が**べた塗り**になり、カメラが馬群を追う以上
     *    **画面の中で動くものが何も無くなります** → 「スローで走っているみたい」。
     * ★速度感は**地面の模様が流れること**で出ます。
     */
    for (let m = Math.floor((focusS - near) / 25) * 25; m <= focusS + near; m += 25) {
      if (m < 0 || m > DIST) continue;
      if (Math.floor(m / 25) % 2 !== 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.beginPath();
      for (let w = 0; w <= course.widthM; w += 4) {
        const p = courseToScreen(course, pose, VP, m, w);
        if (w === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      for (let w = course.widthM; w >= 0; w -= 4) {
        const p = courseToScreen(course, pose, VP, Math.min(DIST, m + 12), w);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    /**
     * ★**外の景観**（走路の外側に、生垣とスタンドを帯で置く）。
     *   ⚠️ 走路と空だけだと、**競馬場に見えません**。
     *   走路の座標系に置くので、**馬と一緒に流れます**（奥行きは速度差で作る・§3）。
     */
    for (const [from, to, col] of [
      [course.widthM + 2, course.widthM + 9, '#2f4a2b'],
      [course.widthM + 9, course.widthM + 22, '#5b6068'],
    ] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let s2 = focusS - near; s2 <= focusS + near; s2 += 8) {
        const p = courseToScreen(course, pose, VP, clampS(s2), from);
        if (s2 === focusS - near) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      for (let s2 = focusS + near; s2 >= focusS - near; s2 -= 8) {
        const p = courseToScreen(course, pose, VP, clampS(s2), to);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    // ★柵の支柱（縦の要素はここだけ）
    for (let m = Math.floor((focusS - near) / 10) * 10; m <= focusS + near; m += 10) {
      if (m < 0 || m > DIST) continue;
      const a = courseToScreen(course, pose, VP, m, course.widthM + 1.5);
      ctx.fillStyle = 'rgba(20,20,18,0.5)';
      ctx.fillRect(a.x - 1, a.y - 14, 2, 14);
    }

    // ★ラチ
    for (const [w, col, lw] of [[0, '#e6e3d6', 3], [course.widthM, '#cfd6c6', 2]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let started = false;
      for (let s = focusS - near; s <= focusS + near; s += 4) {
        const p = courseToScreen(course, pose, VP, clampS(s), w);
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // ★ハロン棒
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (let m = 0; m <= DIST; m += 200) {
      if (Math.abs(m - focusS) > near) continue;
      const a = courseToScreen(course, pose, VP, m, 0);
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(a.x - 1, a.y - 22, 3, 22);
      ctx.fillStyle = '#22201c';
      ctx.fillRect(a.x - 13, a.y - 37, 28, 15);
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(`${DIST - m}`, a.x + 1, a.y - 25);
    }

    // ★決勝線
    if (Math.abs(DIST - focusS) <= near) {
      const a = courseToScreen(course, pose, VP, DIST, 0);
      const b = courseToScreen(course, pose, VP, DIST, course.widthM);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /**
     * ★**奥（上）から手前（下）へ描き、手前ほど大きくします。**
     *   奥行きの手掛かりはこれだけです（線遠近は描き込まない・アートバイブル §3）。
     */
    const drawn = horses
      .map((h) => ({ h, p: courseToScreen(course, pose, VP, h.s, h.w) }))
      .sort((a, b) => a.p.y - b.p.y);
    for (const { h, p } of drawn) {
      const img = atlas.stripOf(h.gate);
      if (img === undefined) continue;
      const depth = 1 + 0.35 * ((p.y - VP.height / 2) / (VP.height / 2));
      const k = Math.max(0.45, depth) * (state.spriteScale === 2 ? 1.35 : 0.8);
      const w = SPRITE_W * k;
      const hh = SPRITE_H * k;
      // ★脚は表示の時計で回す（毎秒 2.3 歩・馬番で位相をずらす）
      /**
       * ★脚の回転。**毎秒 2.3 歩**が実際の駆歩です。
       * ⚠️ ただし**画面が寄っている（spriteScale=2）ときは、遅く見えます**
       *    — 馬が大きく映るぶん、同じ歩数でもゆっくりに見えるためです。
       *    ★実写の中継でも寄ると脚は速く見えるので、寄りでは少し上げます。
       */
      const strideHz = state.spriteScale === 2 ? 2.9 : 2.4;
      const frame = Math.floor(((((d * strideHz + h.gate * 0.37) % 1) + 1) % 1) * 6);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#243a1e';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * 0.17, w * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(img, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, p.x - w / 2, p.y - hh * 0.92, w, hh);
    }

    // ★いま何を見ているか
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(28,26,22,0.72)';
    ctx.fillRect(10, 10, 440, 62);
    ctx.fillStyle = '#f2c14e';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${cut.label}（${segmentAt(course, focusS).label}）`, 22, 36);
    ctx.fillStyle = '#efe9dc';
    ctx.font = '14px sans-serif';
    ctx.fillText(`残り ${metersLeft.toFixed(0)}m　ペース ${built.pace}　${state.targetMode}`, 22, 60);

    // ★着順（ゴール後だけ。レース中に出すと結果を先に見せてしまう）
    if (d >= built.warp.displaySec - 0.01) {
      const bx = VP.width * 0.36;
      ctx.fillStyle = 'rgba(28,26,22,0.85)';
      ctx.fillRect(bx, 90, 330, 24 + 5 * 26);
      ctx.fillStyle = '#f2c14e';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('着 順', bx + 16, 112);
      built.result.slice(0, 5).forEach((e, i) => {
        const y = 138 + i * 26;
        const col = atlas.postColors[e.gate - 1] ?? [200, 200, 200];
        ctx.fillStyle = '#efe9dc';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(`${e.place}`, bx + 18, y);
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.fillRect(bx + 46, y - 14, 22, 19);
        ctx.fillStyle = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140 ? '#f5f5f5' : '#111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${e.gate}`, bx + 57, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(239,233,220,0.75)';
        ctx.font = '14px sans-serif';
        ctx.fillText(e.margin, bx + 84, y);
      });
    }
  }, [built, ownGate, course, cuts]);

  useEffect(() => { render(dRef.current); }, [render, ready]);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - dRef.current * 1000;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      if (d >= built.warp.displaySec) {
        dRef.current = built.warp.displaySec;
        setClock(dRef.current);
        render(dRef.current);
        setPlaying(false);
        return;
      }
      dRef.current = d;
      setClock(d);
      render(d);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, built, render]);

  return (
    <main style={{ background: '#221f1b', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 10px' }}>
        レース（PR4）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          本番と同じエンジン → 境界時刻 → 位置モデル → ★コース幾何 → ★カメラ → Canvas
        </span>
      </h1>
      {err !== null && <p style={{ color: '#e06a4a', fontWeight: 'bold' }}>★{err}</p>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button
          type="button" onClick={() => setPlaying((p) => !p)} disabled={!ready || built === null}
          style={{ padding: '8px 22px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0 }}
        >
          {playing ? '停止' : '発走'}
        </button>
        <button
          type="button" onClick={() => { dRef.current = 0; setClock(0); setPlaying(false); render(0); }}
          style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}
        >
          最初から
        </button>
        <label>シード <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 70 }} /></label>
        <label>
          自馬{' '}
          <select value={ownGate} onChange={(e) => setOwnGate(Number(e.target.value))}>
            {Array.from({ length: FIELD }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g} 番</option>)}
          </select>
        </label>
        {built !== null && <span style={{ fontSize: 13, opacity: 0.8 }}>{clock.toFixed(1)} / {built.warp.displaySec.toFixed(1)} 秒</span>}
      </div>
      <canvas
        ref={canvasRef} width={VP.width} height={VP.height}
        style={{ width: '100%', maxWidth: VP.width, border: '1px solid #4a453d', imageRendering: 'pixelated', background: '#111' }}
      />
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.8 }}>
        ★<b>着順はエンジンが決めたもの</b>です（開始時に D-059 のゲートを通しています）。<br />
        ⚠️ <b>横位置は見せているだけ</b>で、<b>距離ロスは着順に効かせていません</b>（D-065 は Q-P4-29 の裁定待ち）。
      </p>
    </main>
  );
}
