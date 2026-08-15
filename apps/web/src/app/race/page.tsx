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
  phaseOf, ovalCourse, segmentAt, HORSE_LENGTH_M,
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
    // ★揺らぎの既定は `@star/render` の DEFAULT_JOSTLE 1か所（判定側もそこから輸入する）
    jostleSeed: seed * 2654435761,
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
    const sorted = [...at].sort((a, b) => b.meters - a.meters)
      .map((h) => ({ gate: h.gate, s: h.meters, stamina: h.staminaRatio }));
    const lead = sorted[0]!.s;
    const own = at.find((h) => h.gate === ownGate);
    const metersLeft = DIST - (own === undefined ? lead : own.meters);

    /**
     * ★**順位から段と横位置を決めます。**
     *   ⚠️ 段は 1×／1×／2× の3つだけ（D-058）。**非整数倍で縮小しません。**
     *   先頭ほど右、後方ほど左。**先頭集団の3頭を手前（2×）**に置きます。
     */
    /**
     * ★**構図はデザイナーのものをそのまま使います。**
     *
     * 【★なぜ計算で置かないか】
     *   ⚠️ 順位から x を計算して置いていたら、**馬が団子になったり間延びしたり**しました。
     *   ★`/still` が綺麗なのは、**12頭を手で配置した構図**だからです。
     *     計算に自由を与えるほど、その構図から離れます。
     *   → **枠（段と位置）は固定**し、**誰がどの枠に入るか**だけを順位で決めます。
     *     さらに**実際の差**でわずかに前後させ、追い抜きが見えるようにします。
     *
     *   枠（`layers.json` の `horsePlan`）:
     *     手前 3頭（2×）… x 230 / 660 / 1060
     *     中   4頭（1×）… x 430 / 615 / 800 / 985
     *     奥   5頭（1×）… x 150 / 330 / 505 / 685 / 860
     */
    const closeUp = metersLeft <= 200;
    const SLOTS: readonly (readonly [number, number])[] = closeUp ? [
      // ★ゴール前: 手前（2×）を5枠に増やして叩き合いを大きく
      [2, 1120], [2, 830], [2, 540], [2, 250], [2, -40],
      [1, 985], [1, 800], [1, 615], [1, 430],
      [0, 860], [0, 685], [0, 505],
    ] : [
      // [row, x] を「先頭から順に」並べる
      [2, 1060], [2, 660], [2, 230],
      [1, 985], [1, 800], [1, 615], [1, 430],
      [0, 860], [0, 685], [0, 505], [0, 330], [0, 150],
    ];
    const horses = sorted.map((h, rank) => {
      const slot = SLOTS[Math.min(rank, SLOTS.length - 1)]!;
      const [row, baseX] = slot;
      /**
       * ★**実際の差でわずかに前後させます**（追い抜きが見えるように）。
       *   ⚠️ 大きく動かすと構図が壊れるので、**±40px まで**に抑えます。
       */
      const behind = lead - h.s;
      /**
       * ★**馬群の伸縮**（調べた実際のレース展開）。
       *   「前からシンガリまで**10馬身くらいで一団**で進んでいきます」
       *   「ひとかたまりで**第4コーナーから直線に向かいます**」
       *   ★道中は詰まり、直線で伸びる。**枠の位置を縮尺で寄せ書きします**（構図は壊さない）。
       */
      const tight = metersLeft > 800 ? 0.72 : metersLeft > 400 ? 0.86 : 1.0;
      const nudge = Math.max(-40, Math.min(40, (behind - rank * 2.2) * -6));
      return {
        gate: h.gate,
        row,
        // ★画面中央へ寄せる度合いで一団に見せる（枠そのものは動かさない）
        x: Math.round(VP_W / 2 + (baseX - VP_W / 2) * tight + nudge),
        /**
         * ★脚の回転。**毎秒 2.4 歩**（実際の駆歩は 2.1〜2.4）。
         *   位相を馬番でずらします（全馬が同じ脚さばきだと**行進**に見えます）。
         */
        frame: Math.floor((((d * 2.4 + h.gate * 0.37) % 1) + 1) % 1 * 6),
        effort: h.stamina,
        own: h.gate === ownGate,
      };
    });

    // ★前の馬との差（順位ではなく変化を出す・裁定 Q-P4-14 ①）
    const myRank = sorted.findIndex((h) => h.gate === ownGate);
    const ahead = myRank > 0 ? sorted[myRank - 1]! : undefined;
    const gapM = ahead === undefined || own === undefined ? 0 : ahead.s - own.meters;
    const back = built.model.at(Math.max(0, sec - 0.6));
    const ownB = back.find((h) => h.gate === ownGate);
    const aheadB = ahead === undefined ? undefined : back.find((h) => h.gate === ahead.gate);
    const gapB = (ownB === undefined || aheadB === undefined) ? gapM : aheadB.meters - ownB.meters;

    /**
     * ★**コーナーの曲がり**を、走路の帯に出します。
     *
     *   ⚠️ デザイナーの描画は**真横専用**で、コーナーを描けません。
     *      走路の帯を**ゆるく反らせる**ことで「いま曲がっている」ことを伝えます。
     *   ★線遠近は描き込みません（アートバイブル §3）。**帯の反りだけ**です。
     *   ⚠️ **絵の都合であって、機構ではありません。** 着順にも位置にも触れません。
     */
    const seg = segmentAt(COURSE, Math.min(DIST, own === undefined ? lead : own.meters));
    const curveAmount = seg.type === 'corner' ? (seg.turn === 'right' ? -1 : 1) : 0;

    const phase = phaseOf(metersLeft);
    // ★いまコースのどこか（実際の区間名）
    const segment = seg.label;
    const finished = d >= built.warp.displaySec - 0.01;
    /**
     * ★**決着で一拍置く**（アートバイブル §2「決着直前に音を抜く」の視覚版）。
     *   ゴール直後の 0.8秒は**着順を出さず**、ゴールした絵だけを見せます。
     *   ⚠️ レースの時計は伸ばしません（表示の後ろで走るだけ）。
     */
    const holdSec = 0.8;
    const sinceFinish = d - built.warp.displaySec;
    const showResult = finished && sinceFinish >= holdSec;

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
      curve: curveAmount,
      /**
       * ★**ゴール前は寄る**（アートバイブル §9「勝負所で寄る」）。
       *   残り200m から、手前の段（2×）に入る頭数を増やして叩き合いを大きく見せます。
       *   ⚠️ 倍率は 1× と 2× のまま（D-058）。**枠の割り当てを変えるだけ**です。
       */
      closeUp: metersLeft <= 200,
      /**
       * ★**実況は「変化」を言う**（裁定 Q-P4-14 ①）。
       *   「3番手」ではなく「上がってきた」。**順位の数字は言いません。**
       *   ⚠️ 少し前と比べて、**実際に起きたこと**を拾います。
       */
      callout: (() => {
        if (finished) return `${built.result[0]!.gate}番　ゴールイン`;
        const prevSorted = [...back].sort((a, b) => b.meters - a.meters);
        const leaderNow = sorted[0]!.gate;
        const leaderBefore = prevSorted[0]?.gate;
        // ★先頭が替わった
        if (leaderBefore !== undefined && leaderBefore !== leaderNow) {
          return `${leaderNow}番　先頭に立った`;
        }
        // ★いちばん詰めている馬
        let bestGate = -1;
        let bestGain = 0;
        for (const h of sorted) {
          const b = back.find((x) => x.gate === h.gate);
          if (b === undefined) continue;
          const gainNow = lead - h.s;
          const gainBefore = (prevSorted[0]?.meters ?? lead) - b.meters;
          const g = gainBefore - gainNow;
          if (g > bestGain) { bestGain = g; bestGate = h.gate; }
        }
        if (bestGain > 0.8 && bestGate > 0) {
          return segment === '直線' ? `${bestGate}番　外から伸びてきた` : `${bestGate}番　上がってきた`;
        }
        if (segment === '直線' && metersLeft < 200) {
          const second = sorted[1];
          if (second !== undefined && sorted[0]!.s - second.s < HORSE_LENGTH_M) {
            return `${leaderNow}番と${second.gate}番　並んだ`;
          }
          return `残り ${metersLeft.toFixed(0)}m　${leaderNow}番先頭`;
        }
        if (segment === '直線') return `さあ直線　${leaderNow}番が先頭`;
        if (segment === '4角') return '4角をまわった　各馬が動いた';
        if (segment === '3角') return '3角　隊列が動き始めた';
        return `${segment}　${leaderNow}番が先頭　残り ${metersLeft.toFixed(0)}m`;
      })(),
    });
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
