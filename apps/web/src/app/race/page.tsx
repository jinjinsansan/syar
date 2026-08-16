/**
 * ★レース観戦 — **斜め俯瞰**（D-066・β）
 *
 * 【★守っていること】
 *   ・**着順はエンジンが決めたもの**（開始時に D-059 のゲートを通す）
 *   ・★横位置 `w` は**エンジンが引いたもの**（D-071）。**距離ロスは着順に効いています**
 *     （D-065 は 2026-08-16 にエンジンへ入りました＝`race.ts` の `laneCoef`）
 *   ・★**描き方はこの画面に持ちません** — `@star/render` の `drawObliqueWorld` が唯一の出どころで、
 *     **動画の道具と同じ関数**を呼びます（2か所で描いたら必ず離れます）
 *   ・色は 16進を持たず `palette.json` から役割名で引く
 *
 * 【⚠️ ★まだ入っていないもの】
 *   ・実況帯／ゲージ／順位表示（★動画の道具にはあります。この画面には**まだ移していません**）
 *   ・★ゲージを入れるときは**エンジンの `staminaAt()` を読むこと**（D-072）。
 *     **この画面で式を作らないでください** — 一度作って**符号が逆**になりました。
 *
 * 【★毛色と逆光は既定で切っています】
 *   どちらも元の素材の階調を殺すためです（オーナー判定）。上のチェックで入れられます。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE,
  resolveRace, paceOf, replayOf, finalOrderMatches,
  laneAt, laneAtStart, TRACK_WIDTH_M,
  aiProxyPlan, staminaTrackOf, staminaGaugeOf, staminaAt, boundaryTimesOf,
} from '@star/race-engine';
import { deriveRng } from '@star/sim-engine';
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, ovalCourse, segmentAt, HORSE_LENGTH_M,
  // ★描き方は package が唯一の出どころ（この画面には持たない）
  drawObliqueWorld, frameRoleOf, SHEET_V2, SHEET_FAR,
  // ★UI も package が唯一の出どころ（動画の道具と同じ関数）
  drawGauge, drawStandings, drawCallBand, type CallPart,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const ASSET_VERSION = '16';
/** ★構図の基準幅（`layers.json` の viewport と同じ） */
const VP_W = 1280;

/** ★枠順の色（D-060）。着順表示に使います */
const POST_COLORS: readonly (readonly [number, number, number])[] = [
  [214, 40, 40], [245, 245, 245], [20, 70, 180], [250, 215, 40], [20, 140, 70], [25, 25, 25],
  [240, 130, 25], [245, 150, 190], [45, 190, 180], [120, 45, 160], [150, 150, 155], [170, 220, 50],
  [110, 70, 45], [128, 30, 55], [175, 165, 120], [135, 190, 230], [25, 40, 95], [30, 80, 50],
];

/** ★コース（1角/2角/向正面/3角/4角/直線）。いまどこを走っているかを出すため */
const COURSE = ovalCourse(DIST);

/**
 * ★**カットの3系統**（アートバイブル）。★数字は 2D の参考の実測から（2026-08-16）:
 *   引き 馬の幅 = 画面幅の 9〜11% ／ 寄り 24% ／ 走路の帯 33%
 *   ⚠️ ★**動画の道具と同じ値**です。離したら見え方が変わります。
 */
const CUTS = {
  wide: { horseW: 120, far: true, cam: { pxPerM: 22, depth: 0.54, anchorX: 470, anchorY: 500 } },
  close: { horseW: 300, cam: { pxPerM: 46, depth: 0.36, anchorX: 380, anchorY: 560 } },
  goal: { horseW: 190, cam: { pxPerM: 34, depth: 0.22, anchorX: 560, anchorY: 540 } },
} as const;

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
  /** ★自馬のゲージ（D-072）。**エンジンが出した状態**を読むだけ */
  readonly gauge: ReturnType<typeof staminaGaugeOf>;
  /** ★確定着順と走破タイム（ゴール後の順位表示に使う） */
  readonly finishPos: ReadonlyMap<number, number>;
  readonly finishSec: ReadonlyMap<number, number>;
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
    // ★道中は脚質から生成する（Q-P4-38）。走破タイムからは作らない
    strategyOf: (g) => entrants[g - 1]!.strategy,
    // ★横位置はエンジンが引いたものを読むだけ（D-071）
    laneOf: (gate, metersLeft) => laneAt(gate, entrants.length, metersLeft, DIST, seed),
    pace,
    formationSeed: seed * 2654435761,
  });
  const settled = result.order.map((e) => Number(e.horseId));
  if (JSON.stringify(finalOrderOf(model)) !== JSON.stringify(settled)) {
    throw new Error('位置モデルの最終順が着順と違います（D-059）');
  }
  /**
   * ★**自馬のゲージ**（§12.6「自馬にのみ表示」・D-072）。
   *   ⚠️ ★**ここで式を作りません。** エンジンの `staminaGaugeOf` が出した状態を読むだけです。
   *      一度この層で近似を作って**符号が逆**になりました。
   *   ★乱数は注入します（憲法4）。`Math.random` は呼びません。
   */
  const own = entrants[ownGate - 1]!;
  const ownHorse = {
    iq: own.stats.iq, gt: own.stats.gt, st: own.stats.st,
    condition: own.condition, fatigue: own.fatigue,
  };
  const ownEntry = result.order.find((e) => Number(e.horseId) === ownGate)!;
  const gauge = staminaGaugeOf(
    staminaTrackOf(ownHorse, aiProxyPlan(ownHorse, deriveRng(seed, ownGate), DEFAULT_INTERVENTION_BALANCE), DIST, DEFAULT_INTERVENTION_BALANCE),
    boundaryTimesOf(ownEntry, DIST, ownGate, own.strategy, pace),
    DIST, own.strategy, pace,
  );
  const finishPos = new Map(result.order.map((e) => [Number(e.horseId), e.finishPosition]));
  const finishSec = new Map(result.order.map((e) => [Number(e.horseId), e.timeSec]));
  return {
    model,
    warp: timeWarpFor(knotsFor(boundaries, ownGate), DEFAULT_PHASE_RATES),
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
    gauge, finishPos, finishSec,
  };
}

export default function RacePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** ★実況の行（変化したときだけ積む） */
  const callRef = useRef<readonly (readonly CallPart[])[]>([]);
  const callKeyRef = useRef<string>('');
  const artRef = useRef<{
    pal: unknown; layers: unknown; atlas: unknown;
    oblique: HTMLImageElement; obliqueFar: HTMLImageElement;
  } | null>(null);
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
      /**
       * ★第3便のシート（8コマ × 枠色8行）を**カットごとに2枚**。
       *   ⚠️ 引きに寄りのシートを縮めて使うと **0.4倍**になり、輪郭が濁ります
       *      （契約 §5 で禁じている形）。★引き用は別に描き起こしたものです。
       */
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error(`スプライトを読み込めません: ${src}`));
          im.src = src;
        });
      const [oblique, obliqueFar] = await Promise.all([
        loadImg(`/art/horse-oblique-v2.png?v=${ASSET_VERSION}`),
        loadImg(`/art/horse-oblique-far.png?v=${ASSET_VERSION}`),
      ]);
      const api = window.STARStill;
      if (api === undefined) throw new Error('STARStill がありません');
      api.setOptions({ coat, backlight });
      const atlas = await api.buildAtlas(sheet, pal, layers);
      if (cancelled) return;
      artRef.current = { pal, layers, atlas, oblique, obliqueFar };
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
    const sorted = [...at].sort((a, b) => b.meters - a.meters)
      .map((h) => ({ gate: h.gate, s: h.meters, stamina: h.staminaRatio }));
    const lead = sorted[0]!.s;
    const own = at.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.meters);

    /**
     * ★**斜め俯瞰で描きます**（D-066・β／2026-08-16 の裁定「動画と同じ見え方に揃える」）。
     *
     * ⚠️ ★**描き方はこの画面に持ちません。** `@star/render` の `drawObliqueWorld` が
     *    唯一の出どころです。動画の道具と**同じ関数**を呼びます。
     *    ★別々に描いたら必ず離れます（走路の幅 20m/25m と同じ形）。
     *
     * ⚠️ ★**旧・手配置スロットの構図は撤去しました。**
     *    平面の段は**コーナーが無く、内外の差も出ません**でした
     *    （オーナーの指摘「馬それぞれの場所が定位置」「競馬ではない」）。
     */
    const cut = metersLeft <= 220 ? CUTS.goal : metersLeft <= 800 ? CUTS.close : CUTS.wide;
    const centre = at.reduce((sum, h) => sum + h.meters, 0) / at.length;
    // ★内外もカメラが追う（走路の真ん中を見ると馬群が上端に貼りつく）
    const wCentre = at.reduce((sum, h) => sum + (h.w ?? COURSE.widthM / 2), 0) / at.length;
    const cam = {
      ...cut.cam,
      s: Math.max(1, Math.min(DIST - 1, centre)),
      w: wCentre,
    };
    ctx.imageSmoothingEnabled = false;
    drawObliqueWorld(ctx, {
      course: COURSE, cam, pal: art.pal as Record<string, string>,
      viewport: { width: W, height: H }, distanceMeter: DIST,
      horses: at.map((h) => ({
        gate: h.gate, meters: h.meters, w: h.w ?? COURSE.widthM / 2,
      })),
      fieldSize: FIELD, horseWidthPx: cut.horseW,
      sheet: 'far' in cut ? art.obliqueFar : art.oblique,
      sheetWidth: ('far' in cut ? art.obliqueFar : art.oblique).width,
      sheet_: 'far' in cut ? SHEET_FAR : SHEET_V2,
      // ★脚は**表示の時間**で回す（距離で回すと道中の早送りで小走りになる）
      frameOf: (g) => Math.floor(d * 16 + g * 0.37 * 8) % 8,
      modeOf: (h) => (h.meters >= DIST ? 'celebrate' : (DIST - h.meters) <= 400 ? 'drive' : 'cruise'),
      ridePhase: d * 2,
      gateWOf: (g) => laneAtStart(g, FIELD, TRACK_WIDTH_M),
      frameRoleOf, font: (px, bold) => `${bold === true ? 'bold ' : ''}${px}px sans-serif`,
    });

    /**
     * ★**UI は画面の座標系**（アートバイブル §9）。
     *   ⚠️ ★`cam` を一切使いません。使った瞬間、寄りの最中にゲージが動きます。
     *   ⚠️ ★**描き方はこの画面に持ちません** — 動画の道具と**同じ関数**を呼びます。
     */
    {
      const vp = { width: W, height: H };
      const FONT = (px: number, bold?: boolean): string =>
        `${bold === true ? 'bold ' : ''}${px}px sans-serif`;
      // ★ゲージはエンジンの staminaAt() を読むだけ（D-072）
      const g = staminaAt(built.gauge, Math.max(0, metersLeft));
      drawGauge(ctx, art.pal as Record<string, string>, vp, FONT,
        `${ownGate}番（自分の馬）`, g.left, built.gauge.initial, g.drainPerMeter);

      /**
       * ★ゴールした馬は**確定着順**で並べます。
       *   ⚠️ 画面上の距離で並べると、ゴール後は全馬が張り付いて★**着順が読めません**。
       */
      const finished = (h: { meters: number }): boolean => h.meters >= DIST - 1e-6;
      const rank = [...at].sort((p, q) => {
        if (finished(p) && finished(q)) {
          return (built.finishPos.get(p.gate) ?? 99) - (built.finishPos.get(q.gate) ?? 99);
        }
        if (finished(p) !== finished(q)) return finished(p) ? -1 : 1;
        return q.meters - p.meters;
      });
      const allIn = rank[0] !== undefined && finished(rank[0]);
      drawStandings(ctx, art.pal as Record<string, string>, vp, FONT, rank.map((h) => ({
        gate: h.gate,
        lengths: ((rank[0]?.meters ?? h.meters) - h.meters) / HORSE_LENGTH_M,
        timeSec: allIn ? built.finishSec.get(h.gate) : undefined,
        isOwn: h.gate === ownGate,
      })), FIELD, frameRoleOf);

      /**
       * ★**実況は「変化」を言う**（Q-P4-14 ①）。
       *   ⚠️ ★同じことを繰り返させません。**状態が変わったときだけ**足します
       *      （一度、機械的に足して**3行とも同じ文**になりました）。
       */
      const ownIdx = rank.findIndex((h) => h.gate === ownGate);
      const ownM = rank[ownIdx]?.meters ?? 0;
      const aheadM = ownIdx > 0 ? rank[ownIdx - 1]!.meters : undefined;
      const before = built.model.at(Math.max(0, sec - 0.5));
      const ownBefore = before.find((h) => h.gate === ownGate)?.meters ?? ownM;
      const aheadGate = ownIdx > 0 ? rank[ownIdx - 1]!.gate : undefined;
      const aheadBefore = aheadGate === undefined
        ? undefined : before.find((h) => h.gate === aheadGate)?.meters;
      const gapNow = aheadM === undefined ? 0 : aheadM - ownM;
      const gapBefore = (aheadM === undefined || aheadBefore === undefined)
        ? 0 : aheadBefore - ownBefore;
      const closing = gapBefore - gapNow;
      const lengths = gapNow / HORSE_LENGTH_M;
      const phaseName = metersLeft <= 400 ? '直線' : metersLeft <= 800 ? '勝負所' : '道中';
      const say: CallPart[] = [{ text: `${ownGate}番`, role: frameRoleOf(ownGate, FIELD) }];
      if (aheadM === undefined) say.push({ text: ' が先頭。' });
      else if (lengths < 0.3) say.push({ text: ' は前と並んでいます' });
      else {
        say.push({ text: ` は前と ${lengths.toFixed(1)} 馬身` });
        say.push({
          text: closing > 0.15 ? '、詰めています' : closing < -0.15 ? '、離されています' : 'の差',
        });
      }
      if (phaseName !== '道中') say.push({ text: `　★${phaseName}` });
      const key = `${phaseName}/${lengths < 0.3 ? '並' : closing > 0.15 ? '詰' : closing < -0.15 ? '離' : '同'}/${ownIdx + 1}`;
      if (key !== callKeyRef.current) {
        callKeyRef.current = key;
        callRef.current = [...callRef.current, say].slice(-3);
      }
      drawCallBand(ctx, art.pal as Record<string, string>, vp, FONT, callRef.current);
    }

    /**
     * ★**着順を出す時点**。
     *   ⚠️ ★元は旧構図の変数を使っていました。撤去したので、ここで定義し直します。
     *   ★**全馬がゴールしてから**出します（1着だけで出すと、後ろの叩き合いが隠れます）。
     */
    const showResult = at.every((h) => h.meters >= DIST - 1e-6);

    /**
     * ★**着順**（決着の一拍のあとに出す）。
     *   ⚠️ 参照実装の上に**足して描くだけ**です（構図に触れません）。
     *   ★並べ替えません。**エンジンが決めた順**をそのまま描きます。
     */
    if (showResult) {
      const bx = Math.round(VP_W * 0.34);
      const rows = built.result.slice(0, 5);
      ctx.fillStyle = 'rgba(22,20,17,0.88)';
      ctx.fillRect(bx, 120, 330, 26 + rows.length * 28);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f2c14e';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('着 順', bx + 16, 144);
      rows.forEach((e, i2) => {
        const y = 172 + i2 * 28;
        const col = POST_COLORS[e.gate - 1] ?? [200, 200, 200];
        ctx.fillStyle = '#f6f2e7';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${e.place}`, bx + 18, y);
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.fillRect(bx + 48, y - 15, 24, 20);
        ctx.fillStyle = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140 ? '#f5f5f5' : '#111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${e.gate}`, bx + 60, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(246,242,231,0.75)';
        ctx.font = '15px sans-serif';
        ctx.fillText(e.margin, bx + 88, y);
      });
    }
  }, [built, ownGate]);

  useEffect(() => { render(dRef.current); }, [render, ready]);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - dRef.current * 1000;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      // ★ゴール後も 1.2秒だけ回す（決着の一拍と着順表示のため）
      if (d >= built.warp.displaySec + 1.2) {
        dRef.current = built.warp.displaySec + 1.2;
        setClock(built.warp.displaySec);
        render(dRef.current);
        setPlaying(false);
        return;
      }
      dRef.current = d;
      setClock(Math.min(d, built.warp.displaySec));
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
