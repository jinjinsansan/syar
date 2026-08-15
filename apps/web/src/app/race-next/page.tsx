/**
 * ★レース（第2便）— **区間別の景観・コーナーの回頭・発走ゲート**
 *
 * 【★なぜ新しいページにしたか】
 *   動いている `/race` に**差し込もうとして4回壊しました**
 *   （`S.rgba` 未公開 / 馬番が焼かれていない / 引数の並びが壊れた / `layers.json` を上書き）。
 *   ★**型検査もテストも通るのに、画面を見るまで壊れが分かりません**（渡す値がすべて unknown 型）。
 *   → **一から書きます。`/race` は触りません。**
 *
 * 【★この画面の描き方】
 *   背景・ゲート・馬・手前のラチ … **`STARScene.drawScene` だけ**（`drawStill` と併用しない）
 *   UI（順位・スタミナ・実況・着順）  … **このファイルで描く**（役割を重ねない）
 *
 * 【★守っていること】
 *   ・着順はエンジンが決めたもの（開始時に D-059 のゲートを通す）
 *   ・構図（3段12枠）は固定。**誰がどの枠に入るか**だけを順位で決める
 *   ・倍率は 1× と 2× だけ（D-058）
 *   ・16進を書かない（`palette.json` から役割名で）
 *   ・コーナーの回頭は 0 → 0.48 → 0 に補間（突然逆流すると「バグ」に見える）
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches } from '@star/race-engine';
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor, DEFAULT_PHASE_RATES,
  ovalCourse, segmentStarts, HORSE_LENGTH_M,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
/** ★上げないと古い JS が使われます（「変わっていません」の正体） */
const V = '17';

/** ★区間の境目（1角/2角/向正面/…）。**コースから読みます**（書き写すとずれる） */
const COURSE = ovalCourse(DIST);
const SEGS: readonly { s: number; end: number; label: string }[] = (() => {
  const st = segmentStarts(COURSE);
  return st.map((x, i) => ({ s: x.s, end: st[i + 1]?.s ?? COURSE.distance, label: x.label }));
})();

/** ★発走の間（秒）。この間はレースの時計を進めません */
const GATE_HOLD = 3.4;
const GATE_OPEN_AT = 2.6;
/** ★回頭の補間幅。1.2秒 × 17m/s ≒ 20m（`$cornerMotion.$ease`） */
const PAN_EASE_M = 20;

/** ★コースの区間 → 第2便の景観 */
const SECTION_OF: Record<string, string> = {
  直線: 'homestretch', 向正面: 'backstretch',
  '1角': 'corner', '2角': 'corner', '3角': 'corner', '4角': 'corner',
};

/**
 * ★枠（3段12箇所）。**デザイナーの構図をそのまま使います。**
 *   計算で置き直したら壊れたので、**誰がどの枠に入るかだけ**を順位で決めます。
 */
const SLOTS: readonly { row: number; x: number }[] = [
  { row: 2, x: 1060 }, { row: 2, x: 660 }, { row: 2, x: 230 },
  { row: 1, x: 985 }, { row: 1, x: 800 }, { row: 1, x: 615 }, { row: 1, x: 430 },
  { row: 0, x: 860 }, { row: 0, x: 685 }, { row: 0, x: 505 }, { row: 0, x: 330 }, { row: 0, x: 150 },
];
const ROW_DEF: readonly { id: string; scale: number; groundY: number; air: number }[] = [
  { id: 'back', scale: 1, groundY: 436, air: 0.1 },
  { id: 'mid', scale: 1, groundY: 520, air: 0.04 },
  { id: 'front', scale: 2, groundY: 626, air: 0 },
];

interface StillApi {
  buildAtlas: (sheet: HTMLImageElement, pal: unknown, layers: unknown) => Promise<unknown>;
  setOptions: (o: { coat: boolean; backlight: boolean }) => void;
}
interface SceneApi {
  drawScene: (ctx: CanvasRenderingContext2D, o: Record<string, unknown>) => void;
  drawFanfare: (ctx: CanvasRenderingContext2D, pal: unknown, w: number, phase: number) => void;
  drawCutBadge: (ctx: CanvasRenderingContext2D, pal: unknown, label: string, metersLeft: number) => void;
}
/** ★`declare global` は使いません（`/race` の宣言と衝突して型検査が落ちました） */
function stillApi(): StillApi | undefined {
  return (window as unknown as { STARStill?: StillApi }).STARStill;
}
function sceneApi(): SceneApi | undefined {
  return (window as unknown as { STARScene?: SceneApi }).STARScene;
}

type Palette = Record<string, string>;
interface Layers2 { sections: Record<string, unknown>; $cornerMotion: { pan: number } }

interface Built {
  readonly model: ReturnType<typeof replayPositionModel>;
  readonly warp: ReturnType<typeof timeWarpFor>;
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
    raceId: `n${seed}`, distance: DIST, surface: 'turf' as const,
    trackCondition: 'good' as const, courseShape: 'oval' as const, baseWeightKg: 55,
  };
  const result = resolveRace({ conditions, entrants, seed, balance: DEFAULT_RACE_BALANCE });
  const { pace } = paceOf(entrants, DEFAULT_RACE_BALANCE);
  const boundaries = replayOf(result, (g) => entrants[g - 1]!.strategy, pace);
  // ★D-059 のゲート。映像が着順を作り変えていないことを、開始時に確かめます
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

/** ★区間を距離から引く（入口・出口も要るので `segmentAt` ではなく表を持つ） */
function segAt(m: number): { s: number; end: number; label: string } {
  const c = Math.max(0, Math.min(COURSE.distance - 0.001, m));
  for (const g of SEGS) if (c >= g.s && c < g.end) return g;
  return SEGS[SEGS.length - 1]!;
}

/** ★回頭の強さ 0→1→0（区間の入口と出口で 20m かけて補間・`$cornerMotion.$ease`） */
function panEase(m: number, seg: { s: number; end: number }): number {
  const inn = (m - seg.s) / PAN_EASE_M;
  const out = (seg.end - m) / PAN_EASE_M;
  const t = Math.max(0, Math.min(1, Math.min(inn, out)));
  return t * t * (3 - 2 * t);
}

function lumOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
}

export default function RaceNextPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const artRef = useRef<{ pal: Palette; shared: unknown[]; l2: Layers2; atlas: unknown } | null>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0);
  const dRef = useRef(0);
  const lastSecRef = useRef('');
  const badgeAtRef = useRef(-9);

  const [seed, setSeed] = useState(42);
  const [ownGate, setOwnGate] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = (src: string): Promise<void> => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error(`読み込めません: ${src}`));
      document.head.appendChild(s);
    });
    const boot = async (): Promise<void> => {
      // ★still-reference.js → scene.js の順（scene.js は still.js を土台にします）
      if (stillApi() === undefined) await load(`/art/still-reference.js?v=${V}`);
      if (sceneApi() === undefined) await load(`/art/scene.js?v=${V}`);
      const [pal, l1, l2] = await Promise.all([
        fetch(`/art/palette.json?v=${V}`).then((r) => r.json()) as Promise<Palette>,
        fetch(`/art/layers.json?v=${V}`).then((r) => r.json()) as Promise<{ layers: unknown[] }>,
        fetch(`/art/layers2.json?v=${V}`).then((r) => r.json()) as Promise<Layers2>,
      ]);
      const sheet = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('スプライトを読み込めません'));
        im.src = `/art/horse-gallop.png?v=${V}`;
      });
      const api = stillApi();
      if (api === undefined) throw new Error('STARStill がありません');
      if (sceneApi() === undefined) throw new Error('STARScene がありません');
      api.setOptions({ coat: false, backlight: false });
      /**
       * ★**全馬番（1〜18）を焼きます。**
       *   ⚠️ `buildAtlas` は**計画に載っている馬番しか焼きません**。第1便の計画は
       *      `14,6,11,…` なので、★**5番・10番が焼かれず画面から消えました**。
       *   ⚠️ 引数は `buildAtlas(sheet, palette, layers)`。**順を間違えました**。
       */
      const all = Array.from({ length: 18 }, (_, i) => i + 1);
      const atlas = await api.buildAtlas(sheet, pal, {
        horsePlan: { rows: ROW_DEF.map((r) => ({ id: r.id, gates: all })) },
      });
      if (cancelled) return;
      artRef.current = { pal, shared: l1.layers, l2, atlas };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { setBuilt(build(seed, ownGate)); setErr(null); } catch (e) {
      setBuilt(null);
      setErr(e instanceof Error ? e.message : String(e));
    }
    dRef.current = 0;
    setClock(0);
    lastSecRef.current = '';
    badgeAtRef.current = -9;
  }, [seed, ownGate]);

  const render = useCallback((d: number) => {
    const cv = canvasRef.current;
    const art = artRef.current;
    const scene = sceneApi();
    if (cv === null || art === null || scene === undefined || built === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;
    const pal = art.pal;
    const c = (k: string): string => pal[k] ?? '#000000';

    const inGate = d < GATE_HOLD;
    const gateOpen = d >= GATE_OPEN_AT;
    const raceD = Math.max(0, d - GATE_HOLD);
    const sec = built.warp.raceSecAt(raceD);
    const at = built.model.at(sec);
    const sorted = [...at].sort((a, b) => b.meters - a.meters);
    const lead = sorted[0]!.meters;
    const own = at.find((h) => h.gate === ownGate);
    const focus = own === undefined ? lead : own.meters;
    const metersLeft = Math.max(0, DIST - focus);
    const seg = segAt(focus);
    const section = inGate ? 'gate' : (SECTION_OF[seg.label] ?? 'homestretch');
    /** ★ゲートは開いたあと **1.4秒かけて後ろへ流れて**画面から抜けます（急に消さない） */
    const gateT = Math.max(0, d - GATE_OPEN_AT) / 1.4;
    const gateX = gateT <= 0 ? 83 : 83 - 1500 * (gateT * gateT);

    // ★区間が切り替わった瞬間だけ帯を出す（時刻を書き写さない）
    if (lastSecRef.current !== section) { lastSecRef.current = section; badgeAtRef.current = d; }

    /** ★枠に順位を割り当てる（構図は固定・先頭が手前の 2×） */
    const rows = ROW_DEF.map((r, ri) => {
      const slots = SLOTS.map((s, i) => ({ ...s, i })).filter((s) => s.row === ri);
      return {
        id: r.id, scale: r.scale, groundY: r.groundY, air: r.air,
        gates: slots.map((s) => sorted[s.i]?.gate ?? 1),
        x: slots.map((s) => s.x),
      };
    });

    // ★回頭は 0 → 0.48 → 0 に補間（`$cornerMotion` を複製して pan だけ差し替え）
    const ease = section === 'corner' ? panEase(focus, seg) : 0;
    const l2 = { ...art.l2, $cornerMotion: { ...art.l2.$cornerMotion, pan: art.l2.$cornerMotion.pan * ease } };

    scene.drawScene(ctx, {
      palette: pal, layers2: l2, sharedLayers: art.shared, atlas: art.atlas,
      section, scroll: (inGate ? 0 : lead) * 20, cornerVariant: 'c',
      signText: seg.label,
      horsePlan: { own: ownGate, rows },
      /**
       * ★発走ゲート（**馬より後ろ**に描かれます）。
       *   ⚠️ 開いた瞬間に消すと「バグ」に見えたので、**後ろへ流して画面から抜けさせます**。
       */
      gate: gateX > -1300
        ? { x: gateX, groundY: 626, stalls: FIELD, open: gateOpen, firstGate: 1, scale: 2 }
        : undefined,
      showHorses: !inGate || gateOpen,
      /** ★脚の回転。**毎秒 2.4 歩**（実際の駆歩は 2.1〜2.4）。★既定は固定コマなので必ず渡す */
      frameOf: (gate: number): number =>
        Math.floor(((((inGate ? 0 : raceD) * 2.4 + gate * 0.37) % 1) + 1) % 1 * 6),
    });

    // ★ファンファーレ（枠入り → 発走）
    if (d < GATE_OPEN_AT) scene.drawFanfare(ctx, pal, W, d < 1.5 ? 0 : 1);
    // ★カットの帯（区間が切り替わってから 1.2秒）
    if (!inGate && d - badgeAtRef.current < 1.2) {
      scene.drawCutBadge(ctx, pal, seg.label, Math.round(metersLeft));
    }

    /* ── UI（★このファイルで描きます。`drawStill` と役割を重ねません）── */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // ★順位表示（枠順の色 ＋ 馬番。★色だけに頼らない）
    {
      const size = 30;
      const gap = 6;
      const barW = sorted.length * (size + gap) + 18;
      const bx = Math.round((W - barW) / 2);
      ctx.fillStyle = `${c('ink-0')}aa`;
      ctx.fillRect(bx, 12, barW, size + 26);
      sorted.forEach((h, i) => {
        const x = bx + 9 + i * (size + gap);
        const col = pal[`silk-${h.gate}`] ?? c('paper-0');
        if (i === 0) { ctx.fillStyle = c('mark-gold'); ctx.fillRect(x - 3, 19, size + 6, size + 6); }
        ctx.fillStyle = col;
        ctx.fillRect(x, 22, size, size);
        ctx.strokeStyle = c('ink-0');
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 22.5, size - 1, size - 1);
        ctx.fillStyle = lumOf(col) < 140 ? c('paper-0') : c('ink-0');
        ctx.font = 'bold 17px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(h.gate), x + size / 2, 44);
        ctx.textAlign = 'left';
        // ★自馬は枡の下に線（色だけに頼らない）
        if (h.gate === ownGate) { ctx.fillStyle = c('paper-0'); ctx.fillRect(x, 56, size, 3); }
      });
    }

    // ★スタミナ・区間・残り
    {
      ctx.fillStyle = `${c('ink-0')}cc`;
      ctx.fillRect(20, 78, 300, 76);
      ctx.fillStyle = c('paper-0');
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`自馬 ${ownGate}番　スタミナ`, 32, 98);
      const st = own === undefined ? 1 : own.staminaRatio;
      ctx.fillStyle = c('ink-1');
      ctx.fillRect(32, 104, 276, 12);
      ctx.fillStyle = st < 0.25 ? c('mark-red') : c('mark-gold');
      ctx.fillRect(32, 104, Math.round(276 * Math.max(0, Math.min(1, st))), 12);
      ctx.fillStyle = c('mark-gold');
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(inGate ? '発走前' : `${seg.label}　残り ${metersLeft.toFixed(0)}m`, 32, 138);
      ctx.fillStyle = `${c('paper-0')}bb`;
      ctx.font = '13px sans-serif';
      ctx.fillText(`ペース ${built.pace}`, 228, 138);
    }

    // ★実況（★順位の数字を読み上げない。**変化**を言う）
    {
      const back = built.model.at(Math.max(0, sec - 0.6));
      const prev = [...back].sort((a, b) => b.meters - a.meters);
      const leaderNow = sorted[0]!.gate;
      let line: string;
      if (inGate) line = gateOpen ? 'ゲートが開いた' : d < 1.5 ? 'まもなく枠入り' : '各馬が態勢を整えた';
      else if (raceD >= built.warp.displaySec - 0.01) line = `${built.result[0]!.gate}番　ゴールイン`;
      else if (prev[0] !== undefined && prev[0].gate !== leaderNow) line = `${leaderNow}番　先頭に立った`;
      else {
        let bg = -1;
        let bv = 0;
        for (const h of sorted) {
          const b = back.find((x) => x.gate === h.gate);
          if (b === undefined || prev[0] === undefined) continue;
          const g = (prev[0].meters - b.meters) - (lead - h.meters);
          if (g > bv) { bv = g; bg = h.gate; }
        }
        const s2 = sorted[1];
        if (bv > 0.8 && bg > 0) line = seg.label === '直線' ? `${bg}番　外から伸びてきた` : `${bg}番　上がってきた`;
        else if (seg.label === '直線' && metersLeft < 200) {
          line = (s2 !== undefined && sorted[0]!.meters - s2.meters < HORSE_LENGTH_M)
            ? `${leaderNow}番と${s2.gate}番　並んだ`
            : `残り ${metersLeft.toFixed(0)}m　${leaderNow}番先頭`;
        } else if (seg.label === '直線') line = `さあ直線　${leaderNow}番が先頭`;
        else if (seg.label === '4角') line = '4角をまわった　各馬が動いた';
        else line = `${seg.label}　${leaderNow}番が先頭`;
      }
      ctx.fillStyle = c('paper-0');
      ctx.fillRect(20, H - 70, 780, 52);
      ctx.fillStyle = c('ink-0');
      ctx.fillRect(20, H - 70, 6, 52);
      ctx.font = 'bold 25px sans-serif';
      ctx.fillText(line, 44, H - 34);
    }

    // ★着順（★決着の一拍のあと）
    if (raceD >= built.warp.displaySec + 0.8) {
      const bx = Math.round(W * 0.36);
      const rs = built.result.slice(0, 5);
      ctx.fillStyle = `${c('ink-0')}e6`;
      ctx.fillRect(bx, 150, 350, 32 + rs.length * 30);
      ctx.fillStyle = c('mark-gold');
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('着 順', bx + 18, 178);
      rs.forEach((e, i) => {
        const y = 210 + i * 30;
        const col = pal[`silk-${e.gate}`] ?? c('paper-0');
        ctx.fillStyle = c('paper-0');
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(`${e.place}着`, bx + 18, y);
        ctx.fillStyle = col;
        ctx.fillRect(bx + 62, y - 16, 26, 21);
        ctx.fillStyle = lumOf(col) < 140 ? c('paper-0') : c('ink-0');
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.fillText(String(e.gate), bx + 75, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = `${c('paper-0')}bb`;
        ctx.font = '15px sans-serif';
        ctx.fillText(e.margin, bx + 104, y);
      });
    }
  }, [built, ownGate]);

  useEffect(() => { render(dRef.current); }, [render, ready]);

  useEffect(() => {
    if (!playing || built === null) return;
    t0Ref.current = performance.now() - dRef.current * 1000;
    const total = built.warp.displaySec + GATE_HOLD + 1.4;
    const loop = (): void => {
      const d = (performance.now() - t0Ref.current) / 1000;
      if (d >= total) {
        dRef.current = total;
        setClock(built.warp.displaySec);
        render(total);
        setPlaying(false);
        return;
      }
      dRef.current = d;
      setClock(Math.max(0, Math.min(d - GATE_HOLD, built.warp.displaySec)));
      render(d);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, built, render]);

  const restart = (): void => {
    dRef.current = 0;
    setClock(0);
    setPlaying(false);
    lastSecRef.current = '';
    badgeAtRef.current = -9;
    render(0);
  };

  return (
    <main style={{ background: '#14120f', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        レース（第2便）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★発走ゲート・区間別の景観・コーナーの回頭
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
          type="button" onClick={restart}
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
        {!ready && err === null && <span style={{ fontSize: 13, opacity: 0.6 }}>素材を読み込んでいます…</span>}
      </div>
      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'pixelated', background: '#111' }}
      />
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, lineHeight: 1.8 }}>
        ★<b>発走</b>: 枠入り → ファンファーレ → ゲートが開く（★ゲートは馬より後ろに描かれます）。<br />
        ★<b>区間で景色が変わります</b>（向正面は<b>観客が1人もいません</b>）。<b>コーナーでは層の流れる向きが上下で分かれ</b>、回頭が出ます。<br />
        ★<b>着順はエンジンが決めたもの</b>（開始時に D-059 のゲートを通しています）。<b>倍率は 1× と 2× だけ</b>（D-058）。
      </p>
    </main>
  );
}
