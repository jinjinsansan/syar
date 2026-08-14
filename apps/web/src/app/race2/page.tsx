/**
 * ★レース（コースの座標系で描く）— **最後の一片**
 *
 * 【これまでとの違い】
 *   `/race` … 真横の直線。コーナーは走路の境目を反らせて表現
 *   ★ここ  … **本物の楕円の上**に走路と馬を置く（コーナーで実際に曲がる）
 *
 * 【★守っていること】
 *   ・**描画順**: 空 → スタンド → 生垣 → 走路 → 馬 → **手前のラチ** → UI
 *     ⚠️ 手前のラチが馬より後。崩すと「芝に貼った絵」に戻ります
 *   ・**倍率は 1× と 2× だけ**（D-058）。★連続値で縮小しません
 *   ・**着順はエンジンが決めたもの**（D-059 のゲートを通す）
 *   ・**16進を書かない**。色は `palette.json` から役割名で
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
import { drawRunningOrder, loadAtlas, type SpriteAtlas } from '../../lib/canvas-renderer';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const VP = { width: 1280, height: 720 };
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const SPRITE_W = 220;
const SPRITE_H = 140;
const ASSET_VERSION = '7';
const COURSE = ovalCourse(DIST);
const CUTS = cutsFor(COURSE);

/** ★脚質ごとの横位置（内ラチからの距離 m）。**見せているだけ** */
const LANE: Record<Strategy, number> = { nige: 3, senko: 5, sashi: 8, oikomi: 12 };

type Palette = Record<string, string>;
const FALLBACK: Palette = {
  'sky-2': '#93bad0', 'stand-2': '#4d525a', 'hedge-1': '#34492d', 'fence-1': '#a2a99d',
  'turf-2': '#6a8f52', 'turf-3': '#5a7f45', 'turf-5': '#385428', 'rail-1': '#ddd8c6',
  'paper-0': '#f6f2e7', 'ink-0': '#22201c', 'mark-gold': '#f2c14e',
};

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly wOf: (gate: number, s: number) => number;
  readonly pace: string;
  readonly result: readonly { place: number; gate: number; margin: string }[];
}

function build(seed: number, ownGate: number): Built {
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
    jostle: 0.25, jostleSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('位置モデルの最終順が着順と違います（D-059）');
  }
  return {
    model,
    warp: timeWarpFor(knotsFor(boundaries, ownGate), DEFAULT_PHASE_RATES),
    /** ★発走は枠順で横一線 → 300m かけて脚質の位置へ */
    wOf: (g, s) => {
      const gateW = 1.6 + ((g - 1) / (FIELD - 1)) * 16.8;
      const laneW = LANE[entrants[g - 1]!.strategy] + ((g * 7) % 5) * 0.9;
      const k = Math.max(0, Math.min(1, s / 300));
      return gateW + (laneW - gateW) * (k * k * (3 - 2 * k));
    },
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
  };
}

export default function Race2Page(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasRef = useRef<SpriteAtlas | null>(null);
  const palRef = useRef<Palette>(FALLBACK);
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

  useEffect(() => {
    fetch(`/art/palette.json?v=${ASSET_VERSION}`).then((r) => r.json())
      .then((p: Palette) => { palRef.current = { ...FALLBACK, ...p }; })
      .catch(() => { /* 読めなくても止めない */ });
    loadAtlas(18).then((a) => { atlasRef.current = a; setReady(true); })
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate)); setErr(null); } catch (e) {
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
    const pal = palRef.current;

    const sec = built.warp.raceSecAt(d);
    const at = built.model.at(sec);
    const horses = at.map((h) => ({
      gate: h.gate, s: h.meters, w: built.wOf(h.gate, h.meters), stamina: h.staminaRatio,
    }));
    const sorted = [...horses].sort((a, b) => b.s - a.s);
    const lead = sorted[0]!.s;
    const own = horses.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.s);

    // ★カット表からカメラを決める
    const { cut, prev } = cutAt(CUTS, metersLeft);
    let state: CameraState = cut.state;
    if (prev !== undefined && cut.blendSec > 0) {
      const into = Math.max(0, (prev.fromMetersLeft - metersLeft) / 16);
      state = blendCamera(prev.state, cut.state, into / cut.blendSec);
    }
    /**
     * ★**中継の画作りに寄せる**（オーナー判定）。
     *
     * ⚠️ カット表の `tilt` は 0.45〜0.55（寝かせ）でしたが、そのまま使うと
     *    **走路が真上から見た広大な緑**になり、**馬が小さく**なりました。
     * ★実際の中継は**ほぼ真横**（低い `tilt`）で、**馬が画面を占めます**。
     *   → `tilt` を 0.22 以下に抑え、`zoom` を上げます。
     */
    state = {
      ...state,
      tilt: Math.min(0.20, state.tilt),
      zoom: Math.max(30, state.zoom * 1.7),
      xCompression: Math.min(0.85, state.xCompression),
    };
    const focusS = focusOf(state.targetMode, horses, ownGate, HORSE_LENGTH_M);
    const c0 = posOf(COURSE, focusS, COURSE.widthM / 2);
    const pose: CameraPose = { state, centre: { x: c0.x, y: c0.y }, heading: c0.heading };
    const clampS = (s: number): number => Math.max(0, Math.min(DIST, s));
    const near = 160;

    // ── ① 遠景（横帯。★遠いので曲がりません） ──
    ctx.fillStyle = pal['sky-2']!;
    ctx.fillRect(0, 0, VP.width, 216);
    ctx.fillStyle = pal['stand-2']!;
    ctx.fillRect(0, 216, VP.width, 84);
    for (let y = 219; y < 298; y += 4) {
      for (let x = 2; x < VP.width; x += 5) {
        ctx.fillStyle = ((x * 3 + y * 7) % 11 < 5) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.fillStyle = pal['hedge-1']!;
    ctx.fillRect(0, 300, VP.width, 44);
    ctx.fillStyle = pal['fence-1']!;
    ctx.fillRect(0, 344, VP.width, 10);
    // ★走路の外の芝
    ctx.fillStyle = pal['turf-5']!;
    ctx.fillRect(0, 354, VP.width, VP.height - 354);

    // ── ② 走路の面（★コースの座標系。コーナーで曲がる） ──
    ctx.fillStyle = pal['turf-3']!;
    ctx.beginPath();
    for (let s = focusS - near; s <= focusS + near; s += 6) {
      const p = courseToScreen(COURSE, pose, VP, clampS(s), 0);
      if (s === focusS - near) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    for (let s = focusS + near; s >= focusS - near; s -= 6) {
      const p = courseToScreen(COURSE, pose, VP, clampS(s), COURSE.widthM);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();

    // ★芝の刈り目（走路を横切る帯＝速度感）
    for (let m = Math.floor((focusS - near) / 25) * 25; m <= focusS + near; m += 25) {
      if (m < 0 || m > DIST || Math.floor(m / 25) % 2 !== 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      for (let w = 0; w <= COURSE.widthM; w += 4) {
        const p = courseToScreen(COURSE, pose, VP, m, w);
        if (w === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      for (let w = COURSE.widthM; w >= 0; w -= 4) {
        const p = courseToScreen(COURSE, pose, VP, Math.min(DIST, m + 12), w);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // ★奥のラチ
    ctx.strokeStyle = pal['fence-1']!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let s = focusS - near; s <= focusS + near; s += 4) {
      const p = courseToScreen(COURSE, pose, VP, clampS(s), COURSE.widthM);
      if (s === focusS - near) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // ★ハロン棒・決勝線（走路の面。馬より奥）
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (let m = 0; m <= DIST; m += 200) {
      if (Math.abs(m - focusS) > near) continue;
      const a = courseToScreen(COURSE, pose, VP, m, 0);
      ctx.fillStyle = pal['rail-1']!;
      ctx.fillRect(a.x - 1, a.y - 24, 3, 24);
      ctx.fillStyle = pal['ink-0']!;
      ctx.fillRect(a.x - 14, a.y - 40, 30, 16);
      ctx.fillStyle = pal['mark-gold']!;
      ctx.fillText(`${DIST - m}`, a.x + 1, a.y - 28);
    }
    if (Math.abs(DIST - focusS) <= near) {
      const a = courseToScreen(COURSE, pose, VP, DIST, 0);
      const b = courseToScreen(COURSE, pose, VP, DIST, COURSE.widthM);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /**
     * ── ③ 馬（★奥から手前へ。倍率は 1× と 2× だけ・D-058）──
     */
    const placed = horses
      .map((h) => ({ h, p: courseToScreen(COURSE, pose, VP, h.s, h.w) }))
      .sort((a, b) => a.p.y - b.p.y);
    for (const { h, p } of placed) {
      const img = atlas.stripOf(h.gate);
      if (img === undefined) continue;
      /**
       * ★**先頭集団は 2×**。⚠️ 画面の y で決めていたら、寝かせが浅いと**全馬 1×**になり
       *    馬が小さいままでした。**順位で決めます**（連続値では縮小しません・D-058）。
       */
      const rank = sorted.findIndex((x) => x.gate === h.gate);
      const scale = rank < 5 ? 2 : 1;
      const w = SPRITE_W * scale;
      const hh = SPRITE_H * scale;
      if (p.x + w < 0 || p.x - w > VP.width) continue;
      const frame = Math.floor((((d * 2.4 + h.gate * 0.37) % 1) + 1) % 1 * 6);
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = '#243a1e';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * 0.075, w * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(img, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, p.x - w / 2, p.y - hh * 0.92, w, hh);
    }

    /**
     * ── ④ ★手前のラチ（馬より後に描く＝馬の前に来る）──
     *   ⚠️ ここを馬より先に描くと、馬が芝に貼った絵に見えます。
     */
    {
      const y = Math.round(VP.height * 0.86);
      for (let x = -30; x < VP.width; x += 168) {
        ctx.fillStyle = pal['rail-1']!;
        ctx.fillRect(x, y, 5, 56);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(x + 4, y, 2, 56);
      }
      for (const [dy, bh] of [[0, 9], [28, 7]] as const) {
        ctx.fillStyle = pal['rail-1']!;
        ctx.fillRect(0, y + dy, VP.width, bh);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(0, y + dy + bh, VP.width, 2);
      }
    }

    // ── ⑤ UI（画面の座標系） ──
    const order = sorted.map((h) => h.gate);
    const barW = order.length * 34 + 20;
    ctx.fillStyle = 'rgba(22,20,17,0.55)';
    ctx.fillRect(Math.round((VP.width - barW) / 2), 10, barW, 44);
    drawRunningOrder(ctx, order, atlas.postColors, {
      x: Math.round((VP.width - barW) / 2) + 10, y: 19, size: 26, gap: 8,
    });

    const seg = segmentAt(COURSE, clampS(own === undefined ? lead : own.s));
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(22,20,17,0.7)';
    ctx.fillRect(16, 68, 300, 58);
    ctx.fillStyle = pal['mark-gold']!;
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(`${seg.label}　残り ${metersLeft.toFixed(0)}m`, 28, 92);
    ctx.fillStyle = pal['paper-0']!;
    ctx.font = '14px sans-serif';
    ctx.fillText(`ペース ${built.pace}　スタミナ ${((own?.stamina ?? 1) * 100).toFixed(0)}%`, 28, 114);

    // ★実況帯
    const by = VP.height - 62;
    ctx.fillStyle = pal['paper-0']!;
    ctx.fillRect(20, by, 760, 48);
    ctx.fillStyle = pal['ink-0']!;
    ctx.font = 'bold 24px sans-serif';
    const finished = d >= built.warp.displaySec - 0.01;
    ctx.fillText(
      finished ? `${built.result[0]!.gate}番　ゴールイン`
        : seg.label === '直線' ? `さあ直線　${order[0]}番が先頭`
          : seg.label === '4角' ? '4角をまわった　各馬が動いた'
            : `${seg.label}　${order[0]}番が先頭`,
      38, by + 32,
    );

    // ★着順（ゴール後だけ）
    if (finished) {
      const bx = VP.width * 0.36;
      ctx.fillStyle = 'rgba(22,20,17,0.88)';
      ctx.fillRect(bx, 140, 320, 24 + 5 * 26);
      ctx.fillStyle = pal['mark-gold']!;
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('着 順', bx + 16, 162);
      built.result.slice(0, 5).forEach((e, i) => {
        const y = 188 + i * 26;
        const col = atlas.postColors[e.gate - 1] ?? [200, 200, 200];
        ctx.fillStyle = pal['paper-0']!;
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(`${e.place}`, bx + 18, y);
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.fillRect(bx + 46, y - 14, 22, 19);
        ctx.fillStyle = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140 ? '#f5f5f5' : '#111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${e.gate}`, bx + 57, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(246,242,231,0.75)';
        ctx.font = '14px sans-serif';
        ctx.fillText(e.margin, bx + 84, y);
      });
    }
  }, [built, ownGate]);

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
    <main style={{ background: '#14120f', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        レース（★コースの座標系）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          本物の楕円の上に走路と馬を置いています。コーナーで実際に曲がります
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
        ★<b>走路と馬をコースの座標系で描いています。</b>コーナーで走路が実際に曲がります。<br />
        ★<b>手前のラチは馬より後に描いています</b>（馬の前に来る）。<b>倍率は 1× と 2× だけ</b>（D-058）。<br />
        ★<b>着順はエンジンが決めたもの</b>（開始時に D-059 のゲートを通しています）。
      </p>
    </main>
  );
}
