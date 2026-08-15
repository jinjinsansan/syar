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
  replayPositionModel, finalOrderOf, timeWarpFor, knotsFor,
  ovalCourse, segmentStarts, HORSE_LENGTH_M,
} from '@star/render';
import POOL from '../../lib/watch-pool.json';

const DIST = 1600;
const FIELD = 12;
const W = 1280;
const H = 720;
const STRATS: readonly Strategy[] = ['nige', 'senko', 'sashi', 'oikomi'];
/** ★上げないと古い JS が使われます（「変わっていません」の正体） */
const V = '19';

/** ★区間の境目（1角/2角/向正面/…）。**コースから読みます**（書き写すとずれる） */
const COURSE = ovalCourse(DIST);
const SEGS: readonly { s: number; end: number; label: string }[] = (() => {
  const st = segmentStarts(COURSE);
  return st.map((x, i) => ({ s: x.s, end: st[i + 1]?.s ?? COURSE.distance, label: x.label }));
})();

/**
 * ★★**送り速さ**（レース秒 ÷ 表示秒。大きいほど速送り）
 *
 * 【オーナー判定】「なぜか急にスピードが上がる時がある。そのスピードを最初から最後まで。
 *   最低でもスピード感がある」「レースは30秒」
 *
 * 【何が起きていたか】
 *   ・「急に上がる」の正体は**背景ではなく馬**でした。★残り800m が勝負所の境目で、
 *     そこから**馬が離れ始める**ので、それまで動かなかった馬が急に動き出します
 *   ・送り速さ自体は `道中1.8 → 勝負所1.0 → 直線0.7` で、★**進むほど遅く**なります
 *   ・1600m の表示が **91秒**。長すぎます
 *
 * 【どう変えたか】★**比を保ったまま全体を上げます**（D-062 の向きは崩さない）
 *     道中 3.6 / 勝負所 3.0 / 直線 2.4  → 表示 約31秒
 *   ・★段差を 1.8:1:0.7（2.6倍）から 3.6:3:2.4（1.5倍）に**縮めた**ので、
 *     「急に変わった」と感じにくくなります
 *   ・★決着に向けて少し伸びるのは**残します**。D-062（時間を情報量に比例して配る）と
 *     C-6（人間が読んで押す余地）が、そこに依っているためです
 *
 * ⚠️ ★**これは D-062 の数字を変える決定です。** 正典の改訂が要ります。
 *    ⚠️ `packages/render` の既定（`DEFAULT_PHASE_RATES`）は**変えていません**。
 *       あれはレビュー側が実測から置いた数字で、`/race` と V-16 が使っています。
 */
const RATES = { cruise: 3.6, spurt: 3.0, straight: 2.4 };

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
const ROW_DEF: readonly { id: string; scale: number; groundY: number; air: number; pxPerM: number; slots: number }[] = [
  { id: 'back', scale: 1, groundY: 436, air: 0.1, pxPerM: 22, slots: 5 },
  { id: 'mid', scale: 1, groundY: 520, air: 0.04, pxPerM: 30, slots: 4 },
  { id: 'front', scale: 2, groundY: 626, air: 0, pxPerM: 40, slots: 3 },
];
/** ★画面のどこを「カメラが見ている地点」にするか */
const X_ANCHOR = 640;
/**
 * ★**望遠の圧縮**（`camera.ts` の `xCompression` と同じ考え）。
 *   ⚠️ 差をそのまま px にすると、実測で **1頭が 1900px 動き**、
 *      終盤に自馬が画面の外へ出ます（順位表示にしか残らない）。
 *   → ★**接戦（±数m）はそのまま・離れた馬ほど端に寄る**ようにします。
 *      `soft(d) = LIM·tanh(d/LIM)`。**単調なので前後関係は1つも変わりません**
 *      （＝抜き差しの回数は圧縮しても同じ）。
 */
const SOFT_LIMIT_M = 14;
function softGap(dm: number): number {
  return SOFT_LIMIT_M * Math.tanh(dm / SOFT_LIMIT_M);
}
/** ★段の中でも数 px ずらして重なりを解く（段の接地線そのものは動かさない） */
const SUB_DEPTH = 7;

/**
 * ★★**カット**（オーナー指示②「ずっと同じカメラワークで飽きる。見せ場が要る」）
 *
 * 【できること】★**画角**（馬間の広がり＝寄り/引き）と**注視点**（誰を画面の中心に置くか）。
 *   ⚠️ **倍率は 1×/2× のみ**（D-058）なので、寄り＝スプライトを拡大ではなく
 *      **馬間を広げて遠い馬を画面外へ出す**（＝望遠で寄るのと同じ効果）。
 *
 * 【★できないこと（素材が無い）】
 *   ・**上空からの俯瞰**（②2角）… ★一度自作して失敗しました。走路が真上から見た広大な緑になり、
 *     馬が小さく「地図」に見えた（`/race2`・削除済み）。**第3便でデザイナーに頼みます**
 *   ・**奥から走ってくる正面の絵**（④4角）… ★斜め・奥行きの線は
 *     アートバイブル §3（線遠近を描き込まない）に正面から抵触します。**同じく第3便**
 *   → ★**推測で作らず、素材が来るまでは「画角と注視点」で作ります。**
 *
 * 【区間】★コースから読みます（1600m は 2角の途中から始まる）
 *   残り1600〜1400 2角  … 発走。★引いて全馬。逃げ・先行が前へ、差し・追込が後ろへ流れる
 *   残り1400〜1000 向正面 … 道中。★いちばん引く（上空の代わり）
 *   残り1000〜 700 3角  … 仕掛け。★寄り始め・注視は**いちばん上がってきている馬**
 *   残り 700〜 400 4角  … 勝負所。★さらに寄る・注視は先頭争い
 *   残り 400〜   0 直線  … 決着。★最も寄る。ただし**入った瞬間だけ一度引く**（裁定）
 */
interface Cut { readonly zoom: number; readonly target: 'pack' | 'mover' | 'lead2'; readonly label: string }
const CUT_OF: Record<string, Cut> = {
  '2角': { zoom: 0.72, target: 'pack', label: '発走' },
  '1角': { zoom: 0.72, target: 'pack', label: '発走' },
  向正面: { zoom: 0.6, target: 'pack', label: '道中' },
  '3角': { zoom: 1.25, target: 'mover', label: '仕掛け' },
  '4角': { zoom: 1.7, target: 'lead2', label: '勝負所' },
  直線: { zoom: 2.1, target: 'lead2', label: '決着' },
};
/** ★カットが切り替わってから画角が落ち着くまで（秒）。0 だと「バグ」に見える */
const CUT_EASE = 0.55;
/** ★「寄る前に一度引く」（裁定）。直線に入った最初の 0.7秒だけ引く */
const PULL_BACK_SEC = 0.7;
const PULL_BACK_ZOOM = 0.75;

/**
 * ★**走る段は、レース中ずっと変わりません。**
 *   段を順位で入れ替えると**縦に瞬間移動**します。
 *   自馬は必ず手前（2×）。残りは馬番順に配ります（内枠ほど奥＝内めを回る）。
 */
function lanesOf(ownGate: number): readonly { gate: number; row: number; sub: number }[] {
  const rest = Array.from({ length: FIELD }, (_, i) => i + 1).filter((g) => g !== ownGate);
  const out: { gate: number; row: number; sub: number }[] = [];
  const counts = [0, 0, 0];
  out.push({ gate: ownGate, row: 2, sub: counts[2]!++ });
  // 奥（内枠）から順に埋める
  let ri = 0;
  for (const g of rest) {
    while (ri < 3 && counts[ri]! >= ROW_DEF[ri]!.slots) ri++;
    if (ri > 2) break;
    out.push({ gate: g, row: ri, sub: counts[ri]!++ });
  }
  return out;
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
    warp: timeWarpFor(knotsFor(boundaries, ownGate), RATES),
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
  /** ★カットの画角と注視点。**なめらかに追う**ための保持値 */
  const zoomRef = useRef(0);
  const camRef = useRef<number | null>(null);
  const lastDRef = useRef(0);

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
    zoomRef.current = 0;
    camRef.current = null;
    lastDRef.current = 0;
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
    const lanes = lanesOf(ownGate);

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

    /**
     * ★カットが切り替わった瞬間（時刻を書き写さない・**コースが知っている**）。
     *   ⚠️ 景観は 3角 も 4角 も同じ `corner` なので、**景観ではなく区間名**で見ます。
     *      でないと 3角→4角 でカットが切り替わりません（＝ずっと同じカメラワーク）。
     */
    const cutKey = inGate ? 'gate' : seg.label;
    if (lastSecRef.current !== cutKey) { lastSecRef.current = cutKey; badgeAtRef.current = d; }

    /* ── ★カット（画角と注視点を区間で切り替える）─────────────── */
    const cut = inGate
      ? { zoom: 0.72, target: 'pack' as const, label: '発走' }
      : (CUT_OF[seg.label] ?? CUT_OF['直線']!);
    const sinceCut = d - badgeAtRef.current;
    // ★「寄る前に一度引く」（裁定）。直線に入った最初だけ引いてから寄る
    const wanted = (seg.label === '直線' && sinceCut < PULL_BACK_SEC && !inGate)
      ? PULL_BACK_ZOOM : cut.zoom;
    const dt = Math.max(0, Math.min(0.1, d - lastDRef.current));
    lastDRef.current = d;
    if (zoomRef.current <= 0 || dt === 0) zoomRef.current = wanted;
    else zoomRef.current += (wanted - zoomRef.current) * Math.min(1, dt / CUT_EASE);
    const zoom = zoomRef.current;

    /**
     * ★**注視点**。カメラが誰を画面の中心に置くか。
     *   ・pack  … 馬群の重心（発走・道中）
     *   ・mover … ★**いちばん上がってきている馬**（3角＝仕掛けどころ）
     *   ・lead2 … 先頭争いの2頭（4角・直線）
     */
    const packM = at.reduce((s, h) => s + h.meters, 0) / at.length;
    let targetM = packM;
    if (cut.target === 'lead2') {
      targetM = packM * 0.35 + ((sorted[0]!.meters + (sorted[1]?.meters ?? sorted[0]!.meters)) / 2) * 0.65;
    } else if (cut.target === 'mover') {
      const back = built.model.at(Math.max(0, sec - 1.2));
      const lead0 = Math.max(...back.map((h) => h.meters));
      let best = packM;
      let bestGain = 0;
      for (const h of sorted) {
        const b = back.find((x) => x.gate === h.gate);
        if (b === undefined) continue;
        const gain = (lead0 - b.meters) - (sorted[0]!.meters - h.meters);
        if (gain > bestGain) { bestGain = gain; best = h.meters; }
      }
      targetM = packM * 0.55 + best * 0.45;
    }
    /** ★注視点は**なめらかに**移す（急に飛ぶと切れたように見える） */
    if (camRef.current === null || dt === 0) camRef.current = targetM;
    else camRef.current += (targetM - camRef.current) * Math.min(1, dt / 0.9);
    const camM = camRef.current;

    const rows = ROW_DEF.map((r, ri) => {
      const mine = lanes.filter((l) => l.row === ri);
      const pos = mine.map((l) => at.find((h) => h.gate === l.gate));
      return {
        id: r.id, scale: r.scale, air: r.air,
        gates: mine.map((l) => l.gate),
        // ★重なった2頭が1頭に見えないよう、段の中でだけ数 px 奥へずらす
        groundY: mine.map((l) => r.groundY - l.sub * SUB_DEPTH),
        x: pos.map((h) => Math.round(X_ANCHOR + softGap((h === undefined ? 0 : h.meters) - camM) * r.pxPerM * zoom)),
      };
    });

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
      ctx.fillText(inGate ? '発走前' : `${seg.label}　${cut.label}　残り ${metersLeft.toFixed(0)}m`, 32, 138);
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
    zoomRef.current = 0;
    camRef.current = null;
    lastDRef.current = 0;
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
