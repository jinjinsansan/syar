/**
 * ★レース観戦 — **エンジン + コース幾何 + カメラ + デザイン・ハンドオフの絵**
 *
 * 【★守っていること】
 *   ・**着順はエンジンが決めたもの**（開始時に D-059 のゲートを通す）
 *   ・横位置 `w` は**見せているだけ**（★距離ロスは着順に効かせていません・D-065 は裁定待ち）
 *   ・絵は**参照実装**が描きます（16進を持たず `palette.json` から役割名で引く）
 *
 * 【★毛色と逆光は既定で切っています】
 *   どちらも元の素材の階調を殺すためです（オーナー判定）。上のチェックで入れられます。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches } from '@star/race-engine';
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, ovalCourse, segmentAt,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const ASSET_VERSION = '6';

/** ★コース（1角/2角/向正面/3角/4角/直線）。いまどこを走っているかを出すため */
const COURSE = ovalCourse(DIST);

interface StarStill {
  buildAtlas: (sheet: HTMLImageElement, pal: unknown, layers: unknown) => Promise<unknown>;
  drawStill: (ctx: CanvasRenderingContext2D, o: Record<string, unknown>) => void;
  setOptions: (o: { coat: boolean; backlight: boolean }) => void;
}
declare global {
  interface Window { STARStill?: StarStill }
}

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly pace: 'slow' | 'middle' | 'high';
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
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
  };
}

export default function RacePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const artRef = useRef<{ pal: unknown; layers: unknown; atlas: unknown } | null>(null);
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
  const [coat, setCoat] = useState(false);
  const [backlight, setBacklight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      if (window.STARStill === undefined) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = `/art/still-reference.js?v=${ASSET_VERSION}`;
          s.onload = () => res();
          s.onerror = () => rej(new Error('参照実装を読み込めません'));
          document.head.appendChild(s);
        });
      }
      const [pal, layers] = await Promise.all([
        fetch(`/art/palette.json?v=${ASSET_VERSION}`).then((r) => r.json()),
        fetch(`/art/layers.json?v=${ASSET_VERSION}`).then((r) => r.json()),
      ]);
      const sheet = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('スプライトを読み込めません'));
        im.src = `/art/horse-gallop.png?v=${ASSET_VERSION}`;
      });
      const api = window.STARStill;
      if (api === undefined) throw new Error('STARStill がありません');
      api.setOptions({ coat, backlight });
      const atlas = await api.buildAtlas(sheet, pal, layers);
      if (cancelled) return;
      artRef.current = { pal, layers, atlas };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [coat, backlight]);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate)); setErr(null); } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    setClock(0);
  }, [seed, ownGate]);

  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const art = artRef.current;
    const api = window.STARStill;
    if (cv === null || art === null || api === undefined || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;

    const sec = built.warp.raceSecAt(d);
    const at = built.model.at(sec);
    const sorted = [...at].sort((a, b) => b.meters - a.meters);
    const lead = sorted[0]!.meters;
    const own = at.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.meters);

    /**
     * ★**順位から段と横位置を決めます。**
     *   ⚠️ 段は 1×／1×／2× の3つだけ（D-058）。**非整数倍で縮小しません。**
     *   先頭ほど右、後方ほど左。**先頭集団の3頭を手前（2×）**に置きます。
     */
    const horses = sorted.map((h, rank) => {
      const row = rank < 3 ? 2 : rank < 7 ? 1 : 0;
      // ★先頭からの差（m）を画面の x に。手前ほど大きく開く
      const behind = lead - h.meters;
      const pxPerM = row === 2 ? 26 : row === 1 ? 20 : 15;
      const baseX = row === 2 ? 1010 : row === 1 ? 940 : 880;
      return {
        gate: h.gate,
        row,
        x: Math.round(baseX - behind * pxPerM - (rank % 3) * 18),
        frame: Math.floor((((d * 2.4 + h.gate * 0.37) % 1) + 1) % 1 * 6),
        effort: h.staminaRatio,
        own: h.gate === ownGate,
      };
    });

    // ★前の馬との差（順位ではなく変化を出す・裁定 Q-P4-14 ①）
    const myRank = sorted.findIndex((h) => h.gate === ownGate);
    const ahead = myRank > 0 ? sorted[myRank - 1]! : undefined;
    const gapM = ahead === undefined || own === undefined ? 0 : ahead.meters - own.meters;
    const back = built.model.at(Math.max(0, sec - 0.6));
    const ownB = back.find((h) => h.gate === ownGate);
    const aheadB = ahead === undefined ? undefined : back.find((h) => h.gate === ahead.gate);
    const gapB = (ownB === undefined || aheadB === undefined) ? gapM : aheadB.meters - ownB.meters;

    const phase = phaseOf(metersLeft);
    // ★いまコースのどこか（実際の区間名）
    const segment = segmentAt(COURSE, Math.min(DIST, own === undefined ? lead : own.meters)).label;
    const finished = d >= built.warp.displaySec - 0.01;

    api.drawStill(ctx, {
      palette: art.pal, layers: art.layers, atlas: art.atlas,
      /**
       * ★**背景の流れ**。
       * ⚠️ 3.2倍にしていたので、91秒で 5,120px しか流れず（毎秒 56px）、
       *    **止まって見えていました**（オーナー判定「超スロー」）。
       * ★実馬は 16m/s。手前のラチが 1.00 のとき、**毎秒 320px 前後**流れるべきです。
       *   → 1m あたり 20px として 20倍にします。
       */
      parts: {}, scene: 'straight200', scroll: lead * 20,
      horses,
      own: ownGate,
      runningOrder: sorted.map((h) => h.gate),
      gauge: own === undefined ? 1 : own.staminaRatio,
      cue: segment,
      cueActive: phase === 'spurt' || phase === 'straight',
      gap: { m: gapM, mps: (gapB - gapM) / 0.6, toGo: Math.max(0, myRank - 2) },
      pace: built.pace,
      callout: finished
        ? `${built.result[0]!.gate}番　ゴールイン`
        : segment === '直線' ? `さあ直線　${sorted[0]!.gate}番が先頭`
          : segment === '4角' ? '4角をまわった　各馬が動いた'
            : segment === '3角' ? '3角　隊列が動き始めた'
              : `${segment}　${sorted[0]!.gate}番が先頭　残り ${metersLeft.toFixed(0)}m`,
    });
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
        レース
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★本番と同じエンジン → 境界時刻 → 位置モデル → 描画（palette.json / layers.json）
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
        <label title="馬体の色を毛色に置き換える。元の絵の階調が減ります">
          <input type="checkbox" checked={coat} onChange={(e) => setCoat(e.target.checked)} />{' '}毛色
        </label>
        <label title="馬体を暗く落として縁を光らせる。元の絵の階調が減ります">
          <input type="checkbox" checked={backlight} onChange={(e) => setBacklight(e.target.checked)} />{' '}逆光
        </label>
        {built !== null && <span style={{ fontSize: 13, opacity: 0.8 }}>{clock.toFixed(1)} / {built.warp.displaySec.toFixed(1)} 秒</span>}
      </div>
      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'pixelated', background: '#111' }}
      />
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.8 }}>
        ★<b>着順はエンジンが決めたもの</b>です（開始時に D-059 のゲートを通しています）。<br />
        ★<b>段は 1×／1×／2× の3つだけ</b>（D-058）。先頭の3頭が手前（2×）に来ます。<br />
        ⚠️ 横位置は見せているだけで、<b>距離ロスは着順に効かせていません</b>（D-065 は裁定待ち）。
      </p>
    </main>
  );
}
