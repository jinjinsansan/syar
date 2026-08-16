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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RACE_BALANCE, DEFAULT_INTERVENTION_BALANCE,
  resolveRace, paceOf, replayOf, finalOrderMatches,
  laneAt, laneAtStart, TRACK_WIDTH_M,
  aiProxyPlan, staminaTrackOf, staminaGaugeOf, staminaAt, boundaryTimesOf,
} from '@star/race-engine';
import { deriveRng } from '@star/sim-engine';
import type { Strategy } from '@star/sim-engine';
import type { Surface, TrackCondition } from '@star/race-engine';
import {
  replayPositionModel, finalOrderOf, withFinishRunOut, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  phaseOf, ovalCourse, segmentAt, HORSE_LENGTH_M,
  // ★描き方は package が唯一の出どころ（この画面には持たない）
  frameRoleOf, SHEET_REAR, SHEET_V2, SHEET_DIAG_FRONT_V1, SHEET_HIGH_DIAG_V1, SHEET_DIAG_REAR_V1,
  // ★透視投影（追走カメラ）。動画の道具と同じ関数
  broadcastCamera, drawPerspectiveWorld, drawPerspectiveHorses,
  raceShotAt,
  shotCameraForDistance,
  focusForRaceShot,
  // ★UI も package が唯一の出どころ（動画の道具と同じ関数）
  drawGauge, drawStandings, drawCallBand, drawResultPanel,
  raceHudVisibilityAt, shouldEmitRaceCall, type CallPart,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
const ASSET_VERSION = '20';
/** ★構図の基準幅（`layers.json` の viewport と同じ） */

/**
 * ⚠️ ★**カットごとの `horseW`（120px / 300px）は撤去しました。**
 *    透視投影では、馬の大きさは**深さから連続的に決まります**。
 *    固定の px を持つと、遠近と食い違って**手前と奥で同じ大きさ**になります。
 */

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

function build(seed: number, ownGate: number, surface: Surface, trackCondition: TrackCondition): Built {
  const start = (seed * 13) % Math.max(1, POOL.length - FIELD);
  const entrants = POOL.slice(start, start + FIELD).map((h, i) => ({
    horseId: String(i + 1), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
    distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
    strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
    strategy: STRATS[(i + seed) % 4]!, condition: 3, fatigue: 20,
    weightKg: 55, gate: i + 1, age: 4, skillGenes: h.skillGenes,
  }));
  const conditions = {
    raceId: `r${seed}-${surface}-${trackCondition}`, distance: DIST, surface,
    trackCondition, courseShape: 'oval' as const, baseWeightKg: 55,
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
  const callLastSecRef = useRef<number>(-Infinity);
  const artRef = useRef<{
    pal: unknown; layers: unknown; atlas: unknown;
    rear: HTMLImageElement;
    side: HTMLImageElement;
    diagFront: HTMLImageElement;
    highDiag: HTMLImageElement;
    diagRear: HTMLImageElement;
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
  const [surface, setSurface] = useState<Surface>('turf');
  const [trackCondition, setTrackCondition] = useState<TrackCondition>('good');
  const [turn, setTurn] = useState<'left' | 'right'>('left');
  const course = useMemo(() => ovalCourse(DIST, { turn }), [turn]);

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
      /**
       * ⚠️ ★引き用（120px）の読み込みは**やめました**。
       *    透視投影では大きさが連続的に変わるので、**段階に分けられません**。
       *    → 高解像度の1枚を**滑らかに縮小**します（D-058 の廃止が前提）。
       */
      /**
       * ★**後ろ姿のシート**（追走カメラの主役）。
       * ⚠️ 真横のシートを後ろから見るカメラで使うと、
       *    ★**馬だけ横を向いた別物**になります。
       */
      const [rear, side, diagFront, highDiag, diagRear] = await Promise.all([
        loadImg(`/art/horse-rear.png?v=${ASSET_VERSION}`),
        loadImg(`/art/horse-side-v3.png?v=${ASSET_VERSION}`),
        loadImg(`/art/horse-diag-front-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/horse-high-diag-v1.png?v=${ASSET_VERSION}`),
        loadImg(`/art/horse-diag-rear-v1.png?v=${ASSET_VERSION}`),
      ]);
      const api = window.STARStill;
      if (api === undefined) throw new Error('STARStill がありません');
      api.setOptions({ coat, backlight });
      const atlas = await api.buildAtlas(sheet, pal, layers);
      if (cancelled) return;
      artRef.current = { pal, layers, atlas, rear, side, diagFront, highDiag, diagRear };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [coat, backlight]);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate, surface, trackCondition)); setErr(null); } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    callRef.current = [];
    callKeyRef.current = '';
    callLastSecRef.current = -Infinity;
    setClock(0);
  }, [seed, ownGate, surface, trackCondition]);

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
     * ★**透視投影で描きます**（据えたカメラ）。
     *
     * ⚠️ ★これまでの斜め俯瞰は**平行投影**でした。`w` に係数を掛けて縦にずらすだけなので、
     *    **奥も手前も同じ太さの帯**になり、板を並べた絵にしか見えませんでした。
     *    参考（2D の中継画）は**透視投影**で、ラチが収束し、
     *    反対側の走路とスタンドまで見えています。
     *
     * ⚠️ ★**描き方はこの画面に持ちません。** `@star/render` が唯一の出どころで、
     *    動画の道具と**同じ関数**を呼びます。
     */
    /**
     * ★**馬群の後ろから、走路に沿って見ます**（参考の主役の画）。
     *
     * ⚠️ ★最初は走路の**横**に据えました。**丸ごと外していました。**
     *    参考は3枚とも馬群の後ろから見ており、★**空もスタンドも写っていません**。
     */
    const allFinishedNow = at.every((h) => h.meters >= DIST - 1e-6);
    const shot = raceShotAt({
      distanceMeter: DIST,
      leaderMeters: lead,
      displaySec: d,
      displayDurationSec: built.warp.displaySec,
      phase: phaseOf(DIST - lead),
      allFinished: allFinishedNow,
    });
    const visualAt = withFinishRunOut(at, (gate) => built.finishSec.get(gate), sec, DIST, Math.max(0, d - built.warp.displaySec));
    const visualLead = Math.max(...visualAt.map((h) => h.meters));
    const winnerGate = built.result[0]!.gate;
    const contenders = visualAt.filter((h) => visualLead - h.meters <= HORSE_LENGTH_M * 2);
    const pack = visualAt.filter((h) => visualLead - h.meters <= 40);
    const focusHorses = focusForRaceShot(shot, {
      all: visualAt, pack, contenders,
      leader: visualAt.filter((h) => h.meters === visualLead),
      winner: visualAt.filter((h) => h.gate === winnerGate),
    });
    const packS = focusHorses.reduce((sum, h) => sum + h.meters, 0) / Math.max(1, focusHorses.length);
    const packW = focusHorses.reduce((sum, h) => sum + (h.w ?? course.widthM / 2), 0) / Math.max(1, focusHorses.length);
    const cam = broadcastCamera(course, {
      atS: Math.max(20, shot.family === 'finish' || shot.family === 'winner' ? packS : Math.min(DIST - 5, packS)),
      atW: packW,
      width: W, height: H,
      view: shot.view,
      preset: shotCameraForDistance(shot, DIST),
    });
    const useRear = shot.view === 'rear';
    const useDiagRear = shot.view === 'diag-rear';
    const useDiagFront = shot.view === 'diag-front';
    const useHighDiag = shot.view === 'high-diag';
    const horseSheet = useRear ? art.rear : useDiagRear ? art.diagRear : useDiagFront ? art.diagFront : useHighDiag ? art.highDiag : art.side;
    const horseSpec = useRear ? SHEET_REAR : useDiagRear ? SHEET_DIAG_REAR_V1 : useDiagFront ? SHEET_DIAG_FRONT_V1 : useHighDiag ? SHEET_HIGH_DIAG_V1 : SHEET_V2;
    const horsesToDraw = shot.family === 'winner' ? visualAt.filter((h) => h.gate === winnerGate) : visualAt;
    ctx.imageSmoothingEnabled = true;   // ★遠近で滑らかに縮む。整数倍はもうやりません
    drawPerspectiveWorld(ctx, course, cam, art.pal as Record<string, string>, DIST, packS, { surface, condition: trackCondition });
    drawPerspectiveHorses(ctx, course, cam,
      horsesToDraw.map((h) => ({ gate: h.gate, s: h.meters, w: h.w ?? course.widthM / 2 })), {
        sheet: horseSheet, sheetWidth: horseSheet.width, spec: horseSpec,
        fieldSize: FIELD,
        // ★脚は**表示の時間**で回す（距離で回すと道中の早送りで小走りになる）
        frameOf: (g) => Math.floor(d * 16 + g * 0.37 * horseSpec.frames) % horseSpec.frames,
        frameRoleOf, distanceMeter: DIST,
        trackEffect: {
          surface, condition: trackCondition,
          color: (art.pal as Record<string, string>)[surface === 'dirt'
            ? (trackCondition === 'good' || trackCondition === 'yielding' ? 'dirt-0' : 'dirt-1')
            : 'turf-5'] ?? '#6d5236',
        },
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
      const hud = raceHudVisibilityAt(d, built.warp.displaySec, allFinishedNow);
      // ★ゲージはエンジンの staminaAt() を読むだけ（D-072）
      const g = staminaAt(built.gauge, Math.max(0, metersLeft));
      if (hud.gauge) {
        drawGauge(ctx, art.pal as Record<string, string>, vp, FONT,
          `${ownGate}番（自分の馬）`, g.left, built.gauge.initial, g.drainPerMeter);
      }

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
      if (hud.standings) {
        drawStandings(ctx, art.pal as Record<string, string>, vp, FONT, rank.map((h) => ({
          gate: h.gate,
          lengths: ((rank[0]?.meters ?? h.meters) - h.meters) / HORSE_LENGTH_M,
          timeSec: allIn ? built.finishSec.get(h.gate) : undefined,
          isOwn: h.gate === ownGate,
        })), FIELD, frameRoleOf);
      }

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
      if (hud.calls && shouldEmitRaceCall(callKeyRef.current, key, callLastSecRef.current, d)) {
        callKeyRef.current = key;
        callLastSecRef.current = d;
        callRef.current = [...callRef.current, say].slice(-3);
      }
      if (hud.calls) drawCallBand(ctx, art.pal as Record<string, string>, vp, FONT, callRef.current);

      if (hud.result) {
        drawResultPanel(ctx, art.pal as Record<string, string>, vp, FONT,
          built.result, FIELD, frameRoleOf);
      }
    }
  }, [built, course, ownGate, surface, trackCondition]);

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
          type="button" onClick={() => {
            dRef.current = 0;
            callRef.current = [];
            callKeyRef.current = '';
            callLastSecRef.current = -Infinity;
            setClock(0); setPlaying(false); render(0);
          }}
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
        <label>
          走路{' '}
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
            <option value="turf">芝</option><option value="dirt">ダート</option>
          </select>
        </label>
        <label>
          馬場{' '}
          <select value={trackCondition} onChange={(e) => setTrackCondition(e.target.value as TrackCondition)}>
            <option value="good">良</option><option value="yielding">稍重</option>
            <option value="soft">重</option><option value="bad">不良</option>
          </select>
        </label>
        <label>
          回り{' '}
          <select value={turn} onChange={(e) => setTurn(e.target.value as 'left' | 'right')}>
            <option value="left">左回り</option><option value="right">右回り</option>
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
