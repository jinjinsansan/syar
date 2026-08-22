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
 *   ・横位置は**実際の差**／段は順位で決めるが、**瞬間移動させない**（1.2秒かけて移す）
 *   ・倍率は 1× と 2× だけ（D-058）
 *   ・16進を書かない（`palette.json` から役割名で）
 *   ・コーナーの回頭は 0 → 0.48 → 0 に補間（突然逆流すると「バグ」に見える）
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RACE_BALANCE, resolveRace, paceOf, replayOf, finalOrderMatches , laneAt } from '@star/race-engine';
import type { Strategy } from '@star/sim-engine';
import {
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor, ratesForTarget, targetDisplaySec,
  ovalCourse, segmentStarts, HORSE_LENGTH_M, frameRoleOf,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
/** ★上げないと古い JS が使われます（「変わっていません」の正体） */
const V = '24';

/** ★区間の境目（1角/2角/向正面/…）。**コースから読みます**（書き写すとずれる） */
const COURSE = ovalCourse(DIST);
const SEGS: readonly { s: number; end: number; label: string }[] = (() => {
  const st = segmentStarts(COURSE);
  return st.map((x, i) => ({ s: x.s, end: st[i + 1]?.s ?? COURSE.distance, label: x.label }));
})();

/**
 * ★★**送り速さは、距離から逆算します**（`RACE_PRESENTATION_BASICS.md` §4）
 *
 * 【オーナー判定】「レースはおよそ45秒（★**短距離は短くてもいい**）」
 *
 * 【★なぜ固定をやめたか — 実測】
 *   距離によらず `2.7 / 2.25 / 1.8` の固定だと:
 *     1200m 35.0s ★合っている ／ 1600m 44.7s ★合っている
 *     2400m 65.0s ⚠️ 長い     ／ 3000m 80.5s ⚠️ ★長すぎる
 *   ★**道中の実時間だけが距離とともに伸びる**ので、そこを吸収させます。
 *
 * ★**勝負所と直線の送りは距離によらず一定**（C-6 が成立する場所なので縮めない）。
 */

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
 * ★★**横位置は「枠」ではなく「実際の差」で決めます。**
 *
 * 【何が間違っていたか】
 *   3段12枠に**順位順で馬を入れ替えて**いました。すると
 *   ★**誰も誰も抜きません。** 順位が変わると馬が瞬間移動するだけで、
 *   画面上は「定位置で走り、背景だけが流れる」ものになります。オーナー判定のとおりです。
 *
 * 【縮尺の根拠】`design/art/handoff2/RESEARCH.md` §3
 *   ・1馬身 = **2.4m**（競馬ブック用語辞典・dbpedia）
 *   ・第1便の zoom は **20px/m**。220px のスプライトは 1× で **4.6馬身ぶんの幅**
 *   ・→ ★**絵は実寸の 4.6倍。** 直しません（実寸だと何も見えない）。**馬は重なります**
 *   ・道中は **24m に一団**（10馬身）→ 手前の段で 480px、奥の段で 264px
 *   ・★望遠レンズは馬間を圧縮する。それが `xCompression` の正体（RESEARCH §4）
 *
 * 【段ごとの px/m】★背景の層の速度から出します（勝手な値を置かない）
 *   手前(2×) は railFront の上 → speedRatio 1.00 → **20px/m**
 *   中 (1×)                    → 0.65            → **13px/m**
 *   奥 (1×) は turfMain の上   → 0.55            → **11px/m**
 *   ★同じ 24m でも奥ほど狭く見えます。これが奥行きです。
 */
/**
 * ★★**奥行き（段）と横位置**
 *
 * 【★F-10「奥の小さな馬が円を描くように動く」／F-11「追い抜き方が不自然」の原因】
 *   ⚠️ 段ごとに `px/m` を変えていました（奥22 / 中30 / 手前40）。すると
 *      ★**馬が段を移るだけで横にも滑る**ので、上下＋左右の動きが合成されて
 *      **円を描いて**見えます。追い抜きも、進んでいないのに前後が入れ替わります。
 *   → ★**px/m は全段で同じ**にします。コース上の内外（横幅 10m 程度）は
 *      進行方向の位置にほとんど影響しないので、これが物理的にも正しい。
 *      奥行きは**大きさ（1×/2×）と接地線の y** だけで作ります。
 *
 * 【★F-06「大小わけのわからない状態」の原因 — こちらは実装のバグ】
 *   ⚠️ 段の補間で `f = now - Math.floor(now)` と書いていました。
 *      `now = 2`（いちばん手前）のとき `floor(2) = 2` で **f = 0** になり、
 *      ★**位置は中段（y=520・1×相当）のまま、倍率だけ 2× になる**という
 *      ちぐはぐな状態を作っていました。**接地線がばらばらに見えていたのはこれです。**
 *   → 添字を丸めたほうに合わせて `f = now - i` にします。
 */
const LANE_Y = [436, 520, 626] as const;
const LANE_AIR = [0.1, 0.04, 0] as const;
/** ★**全段で同じ**（上のコメント）。1馬身 = 2.4m なので 1馬身 = 72px（画角 1× のとき） */
const PX_PER_M = 30;
/** ★段を移るのにかける秒数。短いと「瞬間移動」、長いと反応しない */
const LANE_MOVE_SEC = 1.6;
/** ★倍率が 1× → 2× に変わる位置（D-058: 倍率は 1× と 2× だけ） */
const SCALE_AT = 1.6;

/**
 * ★**横位置**。`anchorX` からの左右で**別々に上限**を持ちます。
 *   ⚠️ 上限を1つにすると、`anchorX` を左に寄せた発走のカットで
 *      **右に走れる余地まで狭まります**。
 *   ★上限にはスプライトの半分の幅を引いています。
 *      **中心が枠内でも、絵の右半分がはみ出して「消えた」ように見えた**ためです（F-08）。
 */
function softX(dm: number, zoom: number, anchorX: number, halfW: number): number {
  const lim = dm >= 0
    ? Math.max(60, W - anchorX - halfW - 8)
    : Math.max(60, anchorX - halfW - 8);
  return lim * Math.tanh((dm * PX_PER_M * zoom) / lim);
}

/**
 * ★★**カット**（区間ごとに画角・注視点・画面のどこを基準にするかを切り替える）
 *
 * 【★できないこと（素材が無い）】
 *   ・**上空からの俯瞰** … 一度自作して失敗（`/race2`・馬が小さく「地図」に見えた）
 *   ・**奥から走ってくる正面の絵** … アートバイブル §3（線遠近を描き込まない）に抵触
 *   → **第3便でデザイナーに依頼**。推測で作りません。
 */
interface Cut {
  readonly zoom: number;
  readonly target: 'pack' | 'mover' | 'lead2' | 'winner';
  /** ★画面のどこを「カメラが見ている地点」にするか */
  readonly anchorX: number;
  readonly label: string;
}
const CUT_OF: Record<string, Cut> = {
  // ★発走は**左に寄せる**。オーナー指示「馬は→に走るのでゲートは左サイド」＝
  //   右にたっぷり走る余地がないと、飛び出した感じが出ません
  '2角': { zoom: 1.35, target: 'pack', anchorX: 380, label: '発走' },
  '1角': { zoom: 1.35, target: 'pack', anchorX: 380, label: '発走' },
  向正面: { zoom: 0.95, target: 'pack', anchorX: 640, label: '道中' },
  '3角': { zoom: 1.35, target: 'mover', anchorX: 600, label: '仕掛け' },
  '4角': { zoom: 1.7, target: 'lead2', anchorX: 580, label: '勝負所' },
  直線: { zoom: 2.1, target: 'lead2', anchorX: 540, label: '決着' },
};
/** ★ゲート入り（発走前） */
const CUT_GATE: Cut = { zoom: 1.35, target: 'pack', anchorX: 380, label: 'ゲート入り' };
/**
 * ★★**ゴール後は1着の馬を追う**（オーナー指示 F-14「実際の中継は1着の馬をカメラワークが追う」）。
 *   勝ち馬を画面の右寄りに置き、**後続が左へ流れていく**。
 */
const CUT_WINNER: Cut = { zoom: 1.9, target: 'winner', anchorX: 800, label: '★ゴール後' };
/** ★カットが切り替わってから画角が落ち着くまで（区間の中だけ効く） */
const CUT_EASE = 0.55;
/** ★「寄る前に一度引く」（裁定）。直線に入った最初の 0.7秒だけ引く */
const PULL_BACK_SEC = 0.7;
const PULL_BACK_ZOOM = 0.75;

/**
 * ★**段（奥行き）は順位で決めるが、瞬間移動させない。**
 *   ⚠️ 固定すると「ずっと小さいままの馬」ができます（オーナー判定）。
 *   ★行ったり来たりしないよう「ため」を入れます。
 *   ★自馬は奥の段に落としません（自分の馬を見失わないため）。
 */
function targetLane(rank: number, current: number, isOwn: boolean): number {
  const up2 = rank <= 2, down2 = rank >= 4, up1 = rank <= 6, down1 = rank >= 8;
  let want = current >= 1.5 ? (down2 ? 1 : 2) : (up2 ? 2 : (current >= 0.5 ? (down1 ? 0 : 1) : (up1 ? 1 : 0)));
  if (isOwn) want = Math.max(1, want);
  return want;
}

/* ── ★発走ゲート ───────────────────────────────── */
const GATE_SCALE = 2;
/** 1房の幅（`scene.js` の `drawGate` と同じ 46 × 倍率） */
const STALL_W = 46 * GATE_SCALE;
const GATE_X0 = 60;
const GATE_GROUND = 626;
/** 房 g の中心の画面 x（★ここに馬を立たせます） */
function stallX(gate: number): number {
  return GATE_X0 + (gate - 1) * STALL_W + STALL_W / 2 + 5;
}

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
  /** ★各馬がゴール線に達したレース秒。**ゴール後も走らせ続ける**ために要ります */
  readonly finishSec: ReadonlyMap<number, number>;
  readonly winner: number;
  readonly winnerSec: number;
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
  const finishSec = new Map<number, number>(boundaries.map((b) => [b.gate, b.finishSec]));
  const winner = Number(result.order[0]!.horseId);
  return {
    model,
    warp: (() => {
      const knots = knotsFor(boundaries, ownGate);
      return timeWarpFor(knots, ratesForTarget(knots, targetDisplaySec(DIST)));
    })(),
    pace,
    result: result.order.map((e, i) => ({ place: i + 1, gate: Number(e.horseId), margin: e.marginLabel })),
    finishSec,
    winner,
    winnerSec: finishSec.get(winner) ?? 0,
  };
}

/**
 * ★**ゴール後も走り続ける距離**（減速しながら）。
 *
 * 【★F-13「ゴールでなぜかまた馬が全部並ぶ」の原因】
 *   ⚠️ 位置モデルはゴール線で頭打ちになります（`replay-model.ts`）。
 *      ★全馬の位置が `distanceMeter` で同じ値になるので、**差が 0 になり、
 *      画面上で全員が1点に集まって**いました。
 *   → ゴールした馬は **そこから先も惰性で走らせます**。着差がそのまま残ります。
 */
function coastM(t: number): number {
  return 96 * (1 - Math.exp(-t / 6));
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

/**
 * ★**色は枠、数字は個体**（D-060・レビュー側指摘 2026-08-15）。
 *
 *   ⚠️ 以前は `silk-{馬番}` で**頭数ぶん別々の色**を引いていました。
 *      18頭立てで「いちばん近い2色」が見分けられなくなります。
 *   → ★枠番（1〜8）の色にし、**馬番を必ず併記**します。
 */
function frameColor(pal: Palette, gate: number): string {
  return pal[frameRoleOf(gate, FIELD)] ?? pal['paper-0'] ?? '#000000';
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
  /** ★カットの画角と注視点。**なめらかに追う**ための保持値 */
  const zoomRef = useRef(0);
  const camRef = useRef<number | null>(null);
  const lastDRef = useRef(0);
  /** ★馬ごとの「いまいる段」（連続値）。瞬間移動させないための保持値 */
  const laneRef = useRef<Map<number, number>>(new Map());

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
        horsePlan: { rows: [{ id: 'back', gates: all }, { id: 'mid', gates: all }, { id: 'front', gates: all }] },
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
    zoomRef.current = 0;
    camRef.current = null;
    lastDRef.current = 0;
    laneRef.current = new Map();
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

    /**
     * ★**ゴールしたあとも走らせます**（F-13）。
     *   位置モデルはゴール線で頭打ちになるので、そのままだと**全馬の位置が同じ値**になり、
     *   画面上で1点に集まります。ゴール後は惰性ぶんを足して、着差を残します。
     */
    const mOf = (gate: number, meters: number): number => {
      const fin = built.finishSec.get(gate);
      if (fin === undefined || sec <= fin) return meters;
      return DIST + coastM(sec - fin);
    };
    const pos = at.map((h) => ({ gate: h.gate, meters: mOf(h.gate, h.meters), staminaRatio: h.staminaRatio }));
    const sorted = [...pos].sort((a2, b2) => b2.meters - a2.meters);
    const lead = sorted[0]!.meters;
    const own = pos.find((h) => h.gate === ownGate);
    const focus = Math.min(DIST, own === undefined ? lead : own.meters);
    const metersLeft = Math.max(0, DIST - focus);
    const seg = segAt(focus);
    /** ★勝ち馬がゴール線を通過したら「ゴール後」のカットへ */
    const afterGoal = !inGate && sec >= built.winnerSec;
    const section = inGate ? 'gate' : (SECTION_OF[seg.label] ?? 'homestretch');

    /**
     * ★カットが切り替わった瞬間（時刻を書き写さない・**コースが知っている**）。
     *   ⚠️ 景観は 3角 も 4角 も同じ `corner` なので、**景観ではなく区間名**で見ます。
     */
    const cutKey = inGate ? 'gate' : afterGoal ? 'goal' : seg.label;
    if (lastSecRef.current !== cutKey) { lastSecRef.current = cutKey; badgeAtRef.current = d; }

    /* ── ★カット（画角・注視点・基準の x を区間で切り替える）───────── */
    const cut = inGate ? CUT_GATE : afterGoal ? CUT_WINNER : (CUT_OF[seg.label] ?? CUT_OF['直線']!);
    const sinceCut = d - badgeAtRef.current;
    // ★「寄る前に一度引く」（裁定）。直線に入った最初だけ引いてから寄る
    const wanted = (seg.label === '直線' && !afterGoal && sinceCut < PULL_BACK_SEC && !inGate)
      ? PULL_BACK_ZOOM : cut.zoom;
    const dt = Math.max(0, Math.min(0.1, d - lastDRef.current));
    lastDRef.current = d;
    /**
     * ★**カットは「切り替え」です。** 区間が変わった瞬間は**その場で**画角を変えます
     *   （滑らかに変えると、切り替わったことが分かりません）。
     */
    const isCutMoment = sinceCut < dt * 1.5 || zoomRef.current <= 0 || dt === 0;
    if (isCutMoment) zoomRef.current = wanted;
    else zoomRef.current += (wanted - zoomRef.current) * Math.min(1, dt / CUT_EASE);
    const zoom = zoomRef.current;
    const anchorX = cut.anchorX;

    /**
     * ★★**注視点**
     *
     * 【★F-08「右端に消える」／F-09「ごそっと左に移動してまた前に進む」の原因】
     *   ⚠️ カメラ位置そのもの（＝**増え続けるメートル**）に一次遅れをかけていました。
     *      ★**ランプ入力に遅れをかけると、平滑化ではなく「一定のずれ」になります。**
     *      表示は毎秒 40m 以上進むので、時定数 0.9秒 なら**常に 35m 以上あとをついていく**。
     *      → 馬群が右へ寄り続け、追いつくたびに**ごそっと左へ戻る**。
     *      ★オーナーが見た「小間切れ現象」と「右端に消える」は、**同じ1つのバグ**でした。
     *
     *   → ★**カメラの基準は馬群の重心（`packM`）に厳密に一致させ、
     *        「誰を見るか」のぶんの**差だけ**を滑らかにします。**
     *        差は有界（数十m）なので、遅れをかけても溜まりません。
     */
    const packM = pos.reduce((s2, h) => s2 + h.meters, 0) / pos.length;
    let targetM = packM;
    if (cut.target === 'winner') {
      targetM = sorted[0]!.meters;
    } else if (cut.target === 'lead2') {
      targetM = packM * 0.35 + ((sorted[0]!.meters + (sorted[1]?.meters ?? sorted[0]!.meters)) / 2) * 0.65;
    } else if (cut.target === 'mover') {
      const back = built.model.at(Math.max(0, sec - 1.2));
      const lead0 = Math.max(...back.map((h) => h.meters));
      let best = packM;
      let bestGain = 0;
      for (const h of sorted) {
        const b2 = back.find((x) => x.gate === h.gate);
        if (b2 === undefined) continue;
        const gain = (lead0 - b2.meters) - (sorted[0]!.meters - h.meters);
        if (gain > bestGain) { bestGain = gain; best = h.meters; }
      }
      targetM = packM * 0.55 + best * 0.45;
    }
    const resid = targetM - packM;
    if (camRef.current === null || isCutMoment) camRef.current = resid;
    else camRef.current += (resid - camRef.current) * Math.min(1, dt / 0.9);
    const camM = packM + camRef.current;

    /**
     * ★★**発走**（F-01/F-02/F-05/F-07）
     *   `gp` … 0 = ゲートの中 ／ 1 = 通常の隊列。**1.4秒かけて移ります。**
     *   ・`gp = 0` では **12頭が房の位置に立ち、接地線はゲートと同じ 626**
     *     → ★ゲートが「下にある」ように見えません。大きさも全頭同じです
     *   ・ゲートは**開いた瞬間から左へ流れ**、馬は右へ出ていきます
     *     → ★「馬は → に走るのでゲートは左サイド」
     */
    const gp = Math.max(0, Math.min(1, (d - GATE_OPEN_AT) / 1.4));
    const gateX = GATE_X0 - 1900 * gp * gp;
    const showGate = gateX > -(FIELD * STALL_W + 40);

    /**
     * ★**1頭 = 1段**にして組みます（`drawScene` は段ごとに倍率が1つなので、
     *   段を共有するとその馬だけ 2× にできません）。描く順は**奥から**。
     */
    const laneNow = laneRef.current;
    const horses = sorted.map((h, rank) => {
      const cur = laneNow.get(h.gate) ?? (rank <= 2 ? 2 : rank <= 6 ? 1 : 0);
      const want = targetLane(rank, cur, h.gate === ownGate);
      const step = dt === 0 ? 1 : Math.min(1, dt / LANE_MOVE_SEC);
      const now = gp < 1 ? cur : cur + (want - cur) * step;
      laneNow.set(h.gate, now);

      /**
       * ⚠️ ★添字は**丸めたほう**に合わせること。
       *    `f = now - Math.floor(now)` だと `now = 2` で f = 0 になり、
       *    ★**位置は中段のまま倍率だけ 2×** というちぐはぐな状態になりました（F-06）。
       */
      const i = Math.max(0, Math.min(1, Math.floor(now)));
      const f = Math.max(0, Math.min(1, now - i));
      const laneY = LANE_Y[i]! + (LANE_Y[i + 1]! - LANE_Y[i]!) * f;
      const laneAir = LANE_AIR[i]! + (LANE_AIR[i + 1]! - LANE_AIR[i]!) * f;
      const scale = (gp < 0.5 ? 1 : now >= SCALE_AT ? 2 : 1);
      const halfW = 110 * scale;

      const runX = anchorX + softX(h.meters - camM, zoom, anchorX, halfW);
      // ★発走: 房の位置から隊列へ（瞬間移動させない）
      const x = gp >= 1 ? runX : stallX(h.gate) + (runX - stallX(h.gate)) * gp;
      const y = gp >= 1 ? laneY : GATE_GROUND + (laneY - GATE_GROUND) * gp;
      return {
        id: `h${h.gate}`,
        scale,
        air: laneAir * gp,
        gates: [h.gate],
        groundY: [Math.round(y)],
        x: [Math.round(x)],
        _y: y,
      };
    });
    const rows = [...horses].sort((a2, b2) => a2._y - b2._y);
    /** ★ゴール後に「1着」の旗を出す位置（F-14「誰が1着かわかるカメラワーク」） */
    const winnerRow = horses.find((r) => r.gates[0] === built.winner);

    // ★回頭は 0 → 0.48 → 0 に補間（`$cornerMotion` を複製して pan だけ差し替え）
    const ease = section === 'corner' ? panEase(focus, seg) : 0;
    const l2 = { ...art.l2, $cornerMotion: { ...art.l2.$cornerMotion, pan: art.l2.$cornerMotion.pan * ease } };

    scene.drawScene(ctx, {
      palette: pal, layers2: l2, sharedLayers: art.shared, atlas: art.atlas,
      // ★背景もカメラ地点で流します（馬と背景の基準がずれると足が滑って見える）
      section, scroll: (inGate ? 0 : camM) * 20, cornerVariant: 'c',
      signText: seg.label,
      horsePlan: { own: ownGate, rows },
      /**
       * ★発走ゲート。★**開く前は馬より手前**（＝馬が房の中にいるように見える）、
       *   ★**開いた後は馬より後ろ**（デザイナー指摘「扉が開いた瞬間、馬はもうゲートより前にいる」）。
       */
      gate: showGate
        ? { x: gateX, groundY: GATE_GROUND, stalls: FIELD, open: gateOpen, firstGate: 1, scale: GATE_SCALE }
        : undefined,
      gateFront: !gateOpen,
      // ★F-02「ゲートと馬と騎手も見せるべき」→ 発走前から馬を出します
      showHorses: true,
      /** ★脚の回転。**毎秒 2.4 歩**（実際の駆歩は 2.1〜2.4）。★既定は固定コマなので必ず渡す */
      frameOf: (gate: number): number =>
        Math.floor(((((inGate ? 0 : raceD) * 2.4 + gate * 0.37) % 1) + 1) % 1 * 6),
    });

    /**
     * ★★**決勝線とハロン棒**（F-12「ゴール前が一番盛り上がるはずなのに全くわからない」）。
     *   ⚠️ ゴール板もハロン棒も**画面に1つも出ていませんでした**。残り距離は数字だけ。
     *   ★内ラチの上に立つので、**馬より手前**に描くのが正しい（`railFront` と同じ側）。
     */
    if (!inGate) {
      const marks: readonly { m: number; label: string; big: boolean }[] = [
        { m: DIST, label: 'ゴール', big: true },
        { m: DIST - 100, label: '100', big: false },
        { m: DIST - 200, label: '200', big: false },
        { m: DIST - 400, label: '400', big: false },
      ];
      for (const mk of marks) {
        const mx = anchorX + softX(mk.m - camM, zoom, anchorX, 0);
        if (mx < -60 || mx > W + 60) continue;
        const x0 = Math.round(mx);
        const top = mk.big ? 300 : 400;
        ctx.fillStyle = c('ink-0');
        ctx.fillRect(x0 - 3, top, 6, GATE_GROUND - top);
        ctx.fillStyle = c('paper-0');
        ctx.fillRect(x0 - 2, top + 2, 3, GATE_GROUND - top - 4);
        if (mk.big) {
          // ★ゴール板
          ctx.fillStyle = c('ink-0');
          ctx.fillRect(x0 - 62, top - 46, 124, 44);
          ctx.fillStyle = c('mark-gold');
          ctx.fillRect(x0 - 58, top - 42, 116, 36);
          ctx.fillStyle = c('ink-0');
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ゴール', x0, top - 14);
          // ★決勝線（走路を横切る白い帯）
          ctx.fillStyle = `${c('paper-0')}cc`;
          ctx.fillRect(x0 - 4, 400, 9, GATE_GROUND - 400 + 26);
        } else {
          ctx.fillStyle = c('paper-0');
          ctx.fillRect(x0 - 21, top - 30, 42, 28);
          ctx.fillStyle = c('ink-0');
          ctx.font = 'bold 19px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(mk.label, x0, top - 9);
        }
        ctx.textAlign = 'left';
      }
    }

    /**
     * ★★**1着の旗**（F-14「ゴール通過したら1着の馬をカメラワークが追う／誰が1着かわかる」）
     *   カメラは `CUT_WINNER` で勝ち馬を追っています。そのうえで
     *   **どの馬が1着か**を画面上でも指します。
     *   ⚠️ ★**騎手が手を上げて喜ぶ絵（F-15）は素材がありません。** 第3便で頼みます。
     */
    if (afterGoal && winnerRow !== undefined && sec >= built.winnerSec + 0.5) {
      const wx = winnerRow.x[0]!;
      const wy = winnerRow.groundY[0]! - 150 * winnerRow.scale;
      const t = Math.min(1, (sec - built.winnerSec - 0.5) / 0.4);
      const yy = Math.round(wy - 30 * (1 - t));
      ctx.globalAlpha = t;
      ctx.fillStyle = `${c('ink-0')}cc`;
      ctx.fillRect(wx - 74, yy - 4, 152, 48);
      ctx.fillStyle = c('mark-gold');
      ctx.fillRect(wx - 70, yy, 144, 40);
      ctx.fillStyle = c('ink-0');
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`1着 ${built.winner}番`, wx, yy + 30);
      // ★下向きの三角で、どの馬か指す
      ctx.beginPath();
      ctx.moveTo(wx - 12, yy + 40);
      ctx.lineTo(wx + 12, yy + 40);
      ctx.lineTo(wx, yy + 56);
      ctx.closePath();
      ctx.fillStyle = c('mark-gold');
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // ★ファンファーレ（ゲート入り → 発走）
    if (d < GATE_OPEN_AT) scene.drawFanfare(ctx, pal, W, d < 1.5 ? 0 : 1);
    // ★カットの帯（区間が切り替わってから 1.2秒）
    if (!inGate && sinceCut < 1.2) {
      scene.drawCutBadge(ctx, pal, `${seg.label}　${cut.label}`, Math.round(metersLeft));
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
        const col = frameColor(pal, h.gate);
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
      ctx.fillText(inGate ? '発走前' : `${seg.label}　${cut.label}　残り ${metersLeft.toFixed(0)}m`, 32, 138);
      ctx.fillStyle = `${c('paper-0')}bb`;
      ctx.font = '13px sans-serif';
      ctx.fillText(`ペース ${built.pace}`, 228, 138);
    }

    /**
     * ★★**実況の帯**（F-04「実況中継の帯がダサい」）
     *   ⚠️ 紙色のべた塗り1枚に文字を置いただけでした。
     *   → 中継の下三分の一（lower third）の作りにします:
     *      墨の帯 ＋ 上辺に金の罫 ＋ **枠順色の枡に馬番** ＋ 右に区間と残り。
     *   ★色だけに頼らないため、枡の中に**馬番の数字**を必ず入れます。
     */
    {
      const back = built.model.at(Math.max(0, sec - 0.6));
      const prev = [...back].sort((a2, b2) => b2.meters - a2.meters);
      const leaderNow = sorted[0]!.gate;
      /** 帯の左に出す馬番（いま話題にしている馬） */
      let chip = leaderNow;
      let line: string;
      if (inGate) {
        chip = ownGate;
        line = gateOpen ? 'ゲートが開いた' : d < 1.5 ? 'まもなくゲート入り' : '各馬が態勢を整えた';
      } else if (afterGoal) {
        chip = built.winner;
        const t = sec - built.winnerSec;
        line = t < 1.2 ? `${built.winner}番　ゴールイン` : `${built.winner}番　先頭でゴールを駆け抜けた`;
      } else if (prev[0] !== undefined && prev[0].gate !== leaderNow) {
        line = `${leaderNow}番　先頭に立った`;
      } else {
        let bg = -1;
        let bv = 0;
        for (const h of sorted) {
          const b2 = back.find((x) => x.gate === h.gate);
          if (b2 === undefined || prev[0] === undefined) continue;
          const g = (prev[0].meters - b2.meters) - (lead - h.meters);
          if (g > bv) { bv = g; bg = h.gate; }
        }
        const s2 = sorted[1];
        if (bv > 0.8 && bg > 0) {
          chip = bg;
          line = seg.label === '直線' ? `${bg}番　外から伸びてきた` : `${bg}番　上がってきた`;
        } else if (seg.label === '直線' && metersLeft < 200) {
          if (s2 !== undefined && sorted[0]!.meters - s2.meters < HORSE_LENGTH_M) {
            line = `${leaderNow}番と${s2.gate}番　並んだ　どっちだ`;
          } else {
            line = `残り ${metersLeft.toFixed(0)}m　${leaderNow}番先頭`;
          }
        } else if (seg.label === '直線') line = `さあ直線　${leaderNow}番が先頭`;
        else if (seg.label === '4角') line = '4角をまわった　各馬がいっせいに動いた';
        else line = `${seg.label}　${leaderNow}番が先頭`;
      }

      const by = H - 96;
      const bh = 78;
      ctx.fillStyle = `${c('ink-0')}ee`;
      ctx.fillRect(0, by, W, bh);
      ctx.fillStyle = c('mark-gold');
      ctx.fillRect(0, by, W, 4);
      ctx.fillStyle = `${c('ink-1')}88`;
      ctx.fillRect(0, by + bh - 2, W, 2);
      // ★枠順色の枡＋馬番
      {
        const col = frameColor(pal, chip);
        ctx.fillStyle = col;
        ctx.fillRect(26, by + 18, 48, 44);
        ctx.strokeStyle = `${c('paper-0')}66`;
        ctx.lineWidth = 2;
        ctx.strokeRect(27, by + 19, 46, 42);
        ctx.fillStyle = lumOf(col) < 140 ? c('paper-0') : c('ink-0');
        ctx.font = 'bold 26px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(chip), 50, by + 49);
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = c('paper-0');
      ctx.font = 'bold 29px sans-serif';
      ctx.fillText(line, 92, by + 50);
      // ★右端に区間と残り
      ctx.textAlign = 'right';
      ctx.fillStyle = c('mark-gold');
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(inGate ? 'ゲート入り' : `${seg.label}　${cut.label}`, W - 24, by + 32);
      ctx.fillStyle = `${c('paper-0')}cc`;
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.fillText(inGate ? `${DIST}m` : `残り ${metersLeft.toFixed(0)}m`, W - 24, by + 60);
      ctx.textAlign = 'left';
    }

    // ★着順（★決着の一拍のあと）
    if (afterGoal && sec >= built.winnerSec + 2.2) {
      const bx = Math.round(W * 0.36);
      const rs = built.result.slice(0, 5);
      ctx.fillStyle = `${c('ink-0')}e6`;
      ctx.fillRect(bx, 150, 350, 32 + rs.length * 30);
      ctx.fillStyle = c('mark-gold');
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('着 順', bx + 18, 178);
      rs.forEach((e, i) => {
        const y = 210 + i * 30;
        const col = frameColor(pal, e.gate);
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
    // ★ゴール後（1着を追うカット・着順）を見せるぶんを足す
    const total = built.warp.displaySec + GATE_HOLD + 3.6;
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
    zoomRef.current = 0;
    camRef.current = null;
    lastDRef.current = 0;
    laneRef.current = new Map();
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
        ★<b>ゲート入り → 発走 → 道中 → 仕掛け → 勝負所 → 決着 → ゴール後</b>でカットが切り替わります（画角と、カメラが誰を追うか）。<br />
        ★<b>ゲートから出て走ります</b>。ゲートは左へ流れて抜けます。<b>ゴール板とハロン棒</b>（残り400/200/100m）が立っています。<br />
        ★<b>ゴール後は1着の馬をカメラが追います</b>。着差は残ります（ゴール線で全馬が1点に集まりません）。<br />
        ★<b>誰も画面の外へ出ません</b>（絵の端まで含めて判定）。<b>着順はエンジンが決めたもの</b>（D-059）。<b>倍率は 1× と 2× だけ</b>（D-058）。<br />
        ⚠️ <b>上空からの俯瞰</b>／<b>奥から走ってくる画</b>／<b>ゴール後に騎手が喜ぶ絵</b>は<b>素材がありません</b>（第3便でデザイナーに依頼予定・未発注）。
      </p>
    </main>
  );
}
