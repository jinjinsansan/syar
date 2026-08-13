/**
 * ★レース観戦（開発用）— **実際に動くところを見るための画面**
 *
 * 【なぜ作るか】
 *   GIF では「間」も速さも判断できません。**実時間で見ないと決められない**ためです。
 *
 * 【★ここに機構を書きません】（正典 §14.3・§15.2）
 *   レースの確定も位置も局面も、**すべて `packages/` の純粋関数**が出します。
 *   ここがするのは「**時計を進めて描く**」だけです。
 *   ⚠️ ここに「残り800mなら…」を書いた瞬間、アプリ化で書き直しになります。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches,
} from '@star/race-engine';
// ★脚質は `sim-engine` が持つ型（`race-engine` は再輸出していません）
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, sceneAt, cameraFor, finalOrderOf,
  timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
} from '@star/render';
import { drawFrame, loadAtlas, type SpriteAtlas } from '../../lib/canvas-renderer';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const LANES = 3;
const VIEW = { width: 1280, height: 720, trackTop: 340, laneHeight: 105 };
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
  readonly strategyOf: (gate: number) => Strategy;
  readonly pace: 'slow' | 'middle' | 'high';
  readonly order: readonly number[];
  readonly raceSec: number;
}

/** ★レースを1本組む。**乱数はシードから**（憲法4: 直接呼ばない） */
function build(seed: number, ownGate: number, jostle: number, warped: boolean): Built {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1),
    stats: h.stats,
    surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter,
    distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude,
    heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4]!,
    condition: 3,
    fatigue: 20,
    weightKg: 55,
    gate: i + 1,
    age: 4,
    skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `w${seed}`, distance: DIST, surface: 'turf' as const,
    trackCondition: 'good' as const, courseShape: 'oval' as const, baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);

  // ★D-059 のゲート: 映像の着順が確定着順と一致すること
  if (!finalOrderMatches(result, boundaries)) {
    throw new Error('★境界時刻から出る最終順が着順と違います（D-059）');
  }
  const model = replayPositionModel({
    distanceMeter: DIST, spurtMetersLeft: 800, straightMetersLeft: 400, boundaries,
    jostle, jostleSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('★位置モデルの最終順が着順と違います（D-059）');
  }

  // ★時間配分（D-062）。切ると等速になります（比べられるように）
  const rates = warped ? DEFAULT_PHASE_RATES : { cruise: 1, spurt: 1, straight: 1 };
  const warp = timeWarpFor(knotsFor(boundaries, ownGate), rates);

  return {
    model, warp, pace, order: settled, raceSec: model.raceSec,
    strategyOf: (g) => entrants[g - 1]!.strategy,
  };
}

export default function WatchPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasRef = useRef<SpriteAtlas | null>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const [seed, setSeed] = useState(42);
  const [ownGate, setOwnGate] = useState(3);
  const [jostle, setJostle] = useState(0.6);
  const [warped, setWarped] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    void loadAtlas(18).then((a) => { atlasRef.current = a; setReady(true); });
  }, []);

  useEffect(() => {
    try {
      setBuilt(build(seed, ownGate, jostle, warped));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    pausedAtRef.current = 0;
    setClock(0);
  }, [seed, ownGate, jostle, warped]);

  /** 表示の時刻 d（秒）を1枚描く */
  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const atlas = atlasRef.current;
    if (cv === null || atlas === null || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;

    // ★表示の時計 → レースの時計（D-062）
    const sec = built.warp.raceSecAt(d);
    const own = built.model.at(sec).find((h) => h.gate === ownGate);
    const metersLeft = own === undefined ? DIST : DIST - own.meters;

    const frame = sceneAt({
      model: built.model,
      viewport: VIEW,
      camera: cameraFor(metersLeft, ownGate),
      ownGate,
      silkOf: (g) => `silk-${g}`,
      gallopFrames: 6,
      laneOf: (g) => (g - 1) % LANES,
      laneCount: LANES,
      strategyOf: built.strategyOf,
      pace: built.pace,
      // ★脚は**表示の時計**で回す（送りを速くしても小走りにならない）
      animSec: d,
      // ★ハロン棒（間隔は画面が発明しない）
      poleEveryMeter: 200,
    }, sec);
    drawFrame(ctx, frame, atlas, VIEW);
  }, [built, ownGate]);

  useEffect(() => { render(pausedAtRef.current); }, [render]);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - pausedAtRef.current * 1000;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      if (d >= built.warp.displaySec) {
        pausedAtRef.current = built.warp.displaySec;
        setClock(built.warp.displaySec);
        render(built.warp.displaySec);
        setPlaying(false);
        return;
      }
      pausedAtRef.current = d;
      setClock(d);
      render(d);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, built, render]);

  const box: React.CSSProperties = {
    background: '#221f1b', color: '#efe9dc', padding: '12px 16px',
    fontFamily: 'system-ui, sans-serif', minHeight: '100vh',
  };
  const row: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' };

  return (
    <main style={box}>
      <h1 style={{ fontSize: 18, margin: '4px 0 12px' }}>
        レース観戦（開発用）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★本番と同じエンジンで確定 → 境界時刻 → 位置モデル → 描画コマンド → Canvas
        </span>
      </h1>

      {err !== null && (
        <p style={{ color: '#e06a4a', fontWeight: 'bold' }}>★{err}</p>
      )}

      <div style={row}>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={!ready || built === null}
          style={{
            padding: '8px 20px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
            background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0,
          }}
        >
          {playing ? '停止' : '発走'}
        </button>
        <button
          type="button"
          onClick={() => { pausedAtRef.current = 0; setClock(0); setPlaying(false); render(0); }}
          style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}
        >
          最初から
        </button>
        <label>
          シード{' '}
          <input
            type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <label>
          自馬{' '}
          <select value={ownGate} onChange={(e) => setOwnGate(Number(e.target.value))}>
            {Array.from({ length: FIELD }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>{g} 番</option>
            ))}
          </select>
        </label>
        <label title="D-062: 道中を速く送り、直線を引き伸ばす">
          <input type="checkbox" checked={warped} onChange={(e) => setWarped(e.target.checked)} />
          {' '}時間配分（道中3倍速・直線0.7倍）
        </label>
        <label title="D-061 改訂: 別ストリームの揺らぎ。着順は動かない">
          揺らぎ{' '}
          <input
            type="range" min={0} max={0.9} step={0.05} value={jostle}
            onChange={(e) => setJostle(Number(e.target.value))}
          />
          {' '}{jostle.toFixed(2)}
        </label>
      </div>

      <canvas
        ref={canvasRef}
        width={VIEW.width}
        height={VIEW.height}
        style={{
          width: '100%', maxWidth: VIEW.width, border: '1px solid #4a453d',
          imageRendering: 'pixelated', background: '#111',
        }}
      />

      {built !== null && (
        <div style={{ ...row, fontSize: 13, opacity: 0.85 }}>
          <span>
            表示 {clock.toFixed(1)} / {built.warp.displaySec.toFixed(1)} 秒
            {warped && <span style={{ opacity: 0.6 }}>（レースは {built.raceSec.toFixed(1)} 秒）</span>}
          </span>
          <span>ペース {built.pace}</span>
          <span style={{ opacity: 0.6 }}>着順 {built.order.join(' ')}</span>
        </div>
      )}

      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 12, lineHeight: 1.7 }}>
        ★下の帯＝各馬の「余力」。⚠️ <b>いまここに入っている値は余力ではありません</b>
        （`BoundaryTimes` から作れるのは進捗の言い換えだけで、必ず逆を向きます・Q-P4-21）。<br />
        ★馬の下の文字＝脚質（逃/先/差/追）。左下＝ペース・前との差と詰まる速さ・局面・自馬のゲージ。<br />
        ★<b>揺らぎをどれだけ動かしても着順は変わりません</b>（変わったら D-059 のゲートで落ちます）。
      </p>
    </main>
  );
}
