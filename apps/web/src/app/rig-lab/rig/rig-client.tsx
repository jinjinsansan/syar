/**
 * ★パーツ駆動の検証台（★2026-09-06）
 *
 * 【★何が前と違うのか】
 *   ★`/rig-lab/sprite` は ★**焼かれた 8 コマ**を距離で切り替えていました。
 *   ★ここは ★**24 パーツを、STAR のリグ計算がその場で動かします**。
 *   → ★コマ数の制限がありません（★60fps 連続）。
 *   → ★発走・追い比べ・ゴール・左向きも、★**追加の発注なしで作れます**。
 *
 * 【★組み合わせているもの】
 *   ★絵   … 承認済み原画の 24 パーツ（★重なり付き・ピボット付き・2026-09-06 受け入れ）
 *   ★動き … `@star/render` の `deformedPoseAt`（★検定 23 件。★接地中の蹄が滑らない）
 *   ★背景 … 既存の 9 層視差（★本番と同じ式）
 *   ★色   … `palette.json`（★毛色・勝負服・枠色）
 *
 * 【⚠️ ★角度は「原画からの差分」で当てます】
 *   ★リグ計算は**それ自身の基準姿勢**で角度を返します。★原画の姿勢はそれとは別物です。
 *   ★そのまま当てると ★**承認済みの絵が別の姿勢に化けます**。
 *   → ★`t = 0` の解を基準にして、★**そこからの差分だけ**を原画に加えます。
 *     ★こうすると ★**止めた瞬間の絵は承認済み原画そのもの**になり、
 *     ★動かした分だけが、検定済みの歩法から来ます。
 *
 * 【⚠️ ★寸法は parts.json から測ります（★数値を書かない・R-30）】
 *   ★脚の骨の長さも、付け根の位置も、鞍の位置も、★**ピボットの間の距離**です。
 *   ★ここに 16 進や実寸を書き写しません。★素材を差し替えたら自動で追従します。
 *
 * 【⚠️ ★開発専用】★本番では 404。★納品素材は配信しません。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFORMED_GAIT_V0, DEFORMED_HORSE_V0, DEFORMED_LEG_IDS, deformedPoseAt, gaitFitsLegs,
  drawParallaxPlate,
  type DeformedHorseContract, type DeformedLegBones, type DeformedLegId,
  type DeformedPose, type ParallaxLayer, type ParallaxPlate,
} from '@star/render';

/** ★納品パーツの置き場（★開発専用・配信しない） */
const PARTS_DIR = '/rig-lab-assets/parts';
const PARALLAX_DIR = '/art/parallax/backstretch-side-v1';
/** ★プレートの枠取り。★`broadcast-v2-scene.ts` の既定値（R-30） */
const PLATE_ZOOM = 1.12;
const PLATE_ANCHOR = 0.48;
/** ★注視点の深さ [m]。★`shot-sequence.ts` の `side-pack` から √(34²+10²+12²) */
const PACK_DEPTH_M = 37.4;
/**
 * ★騎手の頭頂までの高さ [m]。
 *   ★実馬の体高 1.6m ＋ 伏せた騎手。★`SPAN_M`（3.32m ＝ 512px 正方）と同じ出どころで、
 *   ★馬体長 2.4m（`HORSE_LENGTH_M`）に合う値として置いています。
 * ⚠️ ★これは**縮尺**であって、絵柄の値ではありません。★歩幅との釣り合いにだけ効きます。
 */
const HORSE_TOP_M = 2.30;
/** ★作業用の解像度（★1920px のまま 6 頭ぶん色を焼くと落ちます） */
const WORK_HEIGHT_PX = 420;

type LayerName = 'coat' | 'mane' | 'silk' | 'cap' | 'tack';

interface PartMeta {
  readonly name: string;
  readonly parent: string | null;
  readonly pivot: readonly [number, number];
  readonly layer: LayerName;
  readonly z: number;
}

/** ★切り抜いたパーツ（★1920 の全面を持ち回らない） */
interface Piece {
  readonly meta: PartMeta;
  readonly img: HTMLCanvasElement;
  /** ★**そのパーツの切り抜きの中**でのピボット [作業 px]（★回転の中心） */
  readonly px: number;
  readonly py: number;
  /** ★**キャラ全体の外接矩形の中**でのピボット [作業 px]（★置く位置） */
  readonly wx: number;
  readonly wy: number;
  /** ★原画でのピボット位置 [m]（★胴体ピボットが原点・y は上向き） */
  readonly rmx: number;
  readonly rmy: number;
}

const RUNNERS = [
  { gate: 1, coat: 'coat-kage-1', silk: 'silk-1', frame: 'frame-1', lane: 0 },
  { gate: 2, coat: 'coat-kuri-1', silk: 'silk-4', frame: 'frame-2', lane: 1 },
  { gate: 3, coat: 'coat-kurokage-1', silk: 'silk-7', frame: 'frame-3', lane: 2 },
  { gate: 4, coat: 'coat-ashi-1', silk: 'silk-9', frame: 'frame-4', lane: 3 },
  { gate: 5, coat: 'coat-ao-1', silk: 'silk-12', frame: 'frame-5', lane: 4 },
  { gate: 6, coat: 'coat-kuri-2', silk: 'silk-14', frame: 'frame-6', lane: 5 },
] as const;

/** ★脚 4 本の、上・下・蹄のパーツ名（★発注書で名前を揃えてあります） */
const LEG_PARTS: Readonly<Record<DeformedLegId, readonly [string, string, string]>> = {
  hindFar: ['hindLegFarUpper', 'hindLegFarLower', 'hindHoofFar'],
  hindNear: ['hindLegNearUpper', 'hindLegNearLower', 'hindHoofNear'],
  foreFar: ['foreLegFarUpper', 'foreLegFarLower', 'foreHoofFar'],
  foreNear: ['foreLegNearUpper', 'foreLegNearLower', 'foreHoofNear'],
};

/** ★16 進の明るさ（0〜1） */
function luminanceOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return 0.5;
  const v = parseInt(m[1]!, 16);
  const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * ★無彩色のパーツに色を乗せる（★`/rig-lab/sprite` と同じ式・R-30）。
 *   ★`color` で色相と彩度だけ移し、★暗い毛色は明るさまで弱く沈めます。
 */
function tint(src: CanvasImageSource, w: number, h: number, colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  g.globalCompositeOperation = 'color';
  g.fillStyle = colour;
  g.fillRect(0, 0, w, h);
  const lum = luminanceOf(colour);
  if (lum < 0.62) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = Math.min(0.55, (0.62 - lum) * 1.5);
    g.fillStyle = colour;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** ★`manifest.json` の 1 層 */
interface ManifestLayer {
  readonly name: string; readonly file: string;
  readonly plateY0: number; readonly plateY1: number;
  readonly tileWidth: number; readonly depthOffsetM: number;
}
interface Manifest {
  readonly plateWidth: number; readonly plateHeight: number;
  readonly layers: readonly ManifestLayer[];
  readonly dirtLayers?: Readonly<Record<string, string>>;
}
interface Scenery {
  readonly plateWidth: number; readonly plateHeight: number;
  readonly behind: ParallaxPlate<HTMLImageElement>;
  readonly front: ParallaxPlate<HTMLImageElement>;
  readonly groundY0: number; readonly groundY1: number;
}

export default function RigClient(): React.ReactElement {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('パーツを読み込み中…');
  const [fit, setFit] = useState('');
  const [playing, setPlaying] = useState(true);
  const [speedMps, setSpeedMps] = useState(16);
  const [heightRatio, setHeightRatio] = useState(0.20);
  const [strideM, setStrideM] = useState(DEFORMED_GAIT_V0.strideM);
  const [coatTint, setCoatTint] = useState(0.85);
  /**
   * ★**立ち高さ**（★付け根の高さ ÷ 脚の長さ）。
   *
   * ⚠️ ★既定値 `DEFORMED_STAND_BEND` = 0.60 を使ったところ、
   *    ★**脚が短く畳まれた別の馬**になりました（★オーナー評「北海道の道産子」）。
   *    ★0.60 は「深く曲げて低く構える」体型で、★承認済みの絵は**流線型**です。
   * ★原画の実測（★接地線から付け根まで ÷ 脚の長さ）は ★**0.931**。
   *    ★ただしそれは**宙に浮いた局面**の値なので、★接地時の値はそれより下です。
   * → ★契約側が「★Gate 0B で目で決める値」として差し替え口を開けているので、
   *   ★ここをスライダーにします。★0.90 は、★歩幅 4.60m が脚に収まる上限として置いています。
   */
  const [standBend, setStandBend] = useState(0.90);
  const [showBones, setShowBones] = useState(false);
  const stateRef = useRef({ playing, speedMps, heightRatio, strideM, coatTint, showBones, standBend });
  stateRef.current = { playing, speedMps, heightRatio, strideM, coatTint, showBones, standBend };
  const travelRef = useRef(0);
  /** ★描画側が納品パーツから組み立てた契約（★歩幅の判定に使う） */
  const contractRef = useRef<DeformedHorseContract | null>(null);

  const reset = useCallback(() => { travelRef.current = 0; }, []);

  useEffect(() => {
    const canvas = hostRef.current;
    if (canvas === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let cancelled = false;
    let raf = 0;
    let scenery: Scenery | null = null;
    let pieces: Piece[] = [];
    let byPiece = new Map<string, Piece>();
    /** ★[馬][パーツ] の着色済み。★`tack` は色を変えないので無彩色のまま */
    let baked: (HTMLCanvasElement | null)[][] = [];
    let contract: DeformedHorseContract | null = null;
    /** ★原画（t=0）の解。★角度と位置はここからの**差分**で当てます */
    let ref0: DeformedPose | null = null;
    /** ★1 メートルが原画で何 px か */
    let pxPerMArt = 1;
    /** ★切り抜き後の馬の高さ [px]（★画面へ合わせる基準） */
    let workH = WORK_HEIGHT_PX;
    /** ★馬の横長さ ÷ 高さ（★頭数の間隔をここから決める。★勝手な割合を置かない） */
    let artAspect = 2;

    const load = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

    /** ★背景（★既存素材） */
    void (async () => {
      const man = await fetch(`${PARALLAX_DIR}/manifest.json`).then((r) => r.json() as Promise<Manifest>);
      const imgs = await Promise.all(man.layers.map((l) => load(`${PARALLAX_DIR}/${l.file}`)));
      if (cancelled) return;
      const groundNames = new Set(Object.keys(man.dirtLayers ?? {}));
      const behind: ParallaxLayer<HTMLImageElement>[] = [];
      const front: ParallaxLayer<HTMLImageElement>[] = [];
      let g0 = 0; let g1 = 0;
      man.layers.forEach((l, i) => {
        const image = imgs[i]!;
        const e: ParallaxLayer<HTMLImageElement> = {
          image, width: l.tileWidth, height: image.height,
          plateY0: l.plateY0, plateY1: l.plateY1,
          depthOffsetM: l.depthOffsetM, isGround: groundNames.has(l.name),
        };
        if (groundNames.has(l.name) && l.plateY1 > g1) { g0 = l.plateY0; g1 = l.plateY1; }
        if (!groundNames.has(l.name) && l.depthOffsetM < 0) front.push(e); else behind.push(e);
      });
      scenery = {
        plateWidth: man.plateWidth, plateHeight: man.plateHeight,
        behind: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: behind },
        front: { plateWidth: man.plateWidth, plateHeight: man.plateHeight, layers: front },
        groundY0: g0, groundY1: g1,
      };
    })().catch(() => { setStatus('⚠️ 背景素材を読めませんでした'); });

    /** ★パーツと、パーツから測った寸法 */
    void (async () => {
      const palette: Record<string, string> = await fetch('/art/palette.json')
        .then((r) => r.json()).catch(() => ({}));
      const meta: { parts?: PartMeta[] } | PartMeta[] =
        await fetch(`${PARTS_DIR}/parts.json`).then((r) => r.json());
      const list: PartMeta[] = (Array.isArray(meta) ? meta : meta.parts ?? []).slice()
        .sort((a, b) => a.z - b.z);
      const imgs = await Promise.all(list.map((p) => load(`${PARTS_DIR}/${p.name}.png`)));
      if (cancelled) return;

      /** ★全体の外接矩形を測る（★縮尺の基準。★数値を書かない） */
      const probe = document.createElement('canvas');
      probe.width = imgs[0]!.width; probe.height = imgs[0]!.height;
      const pg = probe.getContext('2d', { willReadFrequently: true })!;
      for (const im of imgs) pg.drawImage(im, 0, 0);
      const d = pg.getImageData(0, 0, probe.width, probe.height).data;
      let top = probe.height; let bottom = -1; let left = probe.width; let right = -1;
      for (let y = 0; y < probe.height; y += 1) {
        for (let x = 0; x < probe.width; x += 1) {
          if (d[(y * probe.width + x) * 4 + 3]! < 64) continue;
          if (y < top) top = y; if (y > bottom) bottom = y;
          if (x < left) left = x; if (x > right) right = x;
        }
      }
      const artH = bottom - top + 1;
      pxPerMArt = artH / HORSE_TOP_M;
      const scale = WORK_HEIGHT_PX / artH;
      workH = WORK_HEIGHT_PX;
      artAspect = (right - left + 1) / artH;

      /** ★パーツを外接矩形へ切り抜いて縮める */
      const cut: Piece[] = [];
      list.forEach((p, i) => {
        const im = imgs[i]!;
        const c0 = document.createElement('canvas');
        c0.width = im.width; c0.height = im.height;
        const g0 = c0.getContext('2d', { willReadFrequently: true })!;
        g0.drawImage(im, 0, 0);
        const dd = g0.getImageData(0, 0, im.width, im.height).data;
        let t = im.height; let b = -1; let l = im.width; let r = -1;
        for (let y = 0; y < im.height; y += 1) {
          for (let x = 0; x < im.width; x += 1) {
            if (dd[(y * im.width + x) * 4 + 3]! < 8) continue;
            if (y < t) t = y; if (y > b) b = y;
            if (x < l) l = x; if (x > r) r = x;
          }
        }
        if (b < 0) { t = 0; b = 0; l = 0; r = 0; }
        const w = Math.max(1, Math.round((r - l + 1) * scale));
        const h = Math.max(1, Math.round((b - t + 1) * scale));
        const c1 = document.createElement('canvas');
        c1.width = w; c1.height = h;
        const g1 = c1.getContext('2d')!;
        g1.imageSmoothingQuality = 'high';
        g1.drawImage(im, l, t, r - l + 1, b - t + 1, 0, 0, w, h);
        cut.push({
          meta: p, img: c1,
          px: (p.pivot[0] - l) * scale, py: (p.pivot[1] - t) * scale,
          wx: (p.pivot[0] - left) * scale, wy: (p.pivot[1] - top) * scale,
          rmx: 0, rmy: 0,
        });
      });
      pieces = cut;
      byPiece = new Map(cut.map((c) => [c.meta.name, c]));

      /**
       * ★**寸法をピボットから測って、契約を作ります。**
       *   ★骨の長さ＝ピボット間の距離。★付け根＝胴体ピボットからの差。
       *   ⚠️ ★原画の y は下向き、★リグの y は上向きなので、★縦は符号を反転します。
       */
      const byName = new Map(list.map((p) => [p.name, p]));
      const pivotOf = (n: string): readonly [number, number] => byName.get(n)?.pivot ?? [0, 0];
      const [tx, ty] = pivotOf('torso');
      const toM = (x: number, y: number) => ({ x: (x - tx) / pxPerMArt, y: (ty - y) / pxPerMArt });
      const legs = {} as Record<DeformedLegId, DeformedLegBones>;
      for (const leg of DEFORMED_LEG_IDS) {
        const [un, ln, hn] = LEG_PARTS[leg];
        const hipP = pivotOf(un); const kneeP = pivotOf(ln); const hoofP = pivotOf(hn);
        const hip = toM(hipP[0], hipP[1]);
        legs[leg] = {
          upperM: Math.hypot(kneeP[0] - hipP[0], kneeP[1] - hipP[1]) / pxPerMArt,
          lowerM: Math.hypot(hoofP[0] - kneeP[0], hoofP[1] - kneeP[1]) / pxPerMArt,
          hip,
          plantBiasM: DEFORMED_HORSE_V0.legs[leg].plantBiasM,
          liftM: DEFORMED_HORSE_V0.legs[leg].liftM,
        };
      }
      /** ★原画の静止位置を [m] で持たせる（★脚の絶対配置に使う） */
      for (const c of cut) {
        const m = toM(c.meta.pivot[0], c.meta.pivot[1]);
        (c as { rmx: number; rmy: number }).rmx = m.x;
        (c as { rmx: number; rmy: number }).rmy = m.y;
      }

      const neckP = pivotOf('neck'); const headP = pivotOf('head');
      const tailP = pivotOf('tail'); const seatP = pivotOf('jockeyTorso');
      const jheadP = pivotOf('jockeyHead');
      const neckRoot = toM(neckP[0], neckP[1]);
      const tailRoot = toM(tailP[0], tailP[1]);
      const seat = toM(seatP[0], seatP[1]);
      contract = {
        ...DEFORMED_HORSE_V0,
        totalHeightM: HORSE_TOP_M,
        neck: {
          ...DEFORMED_HORSE_V0.neck,
          rootX: neckRoot.x, rootY: neckRoot.y,
          lengthM: Math.hypot(headP[0] - neckP[0], headP[1] - neckP[1]) / pxPerMArt,
        },
        tail: { ...DEFORMED_HORSE_V0.tail, rootX: tailRoot.x, rootY: tailRoot.y },
        saddle: { x: seat.x, y: seat.y },
        jockey: {
          ...DEFORMED_HORSE_V0.jockey,
          torsoHeightM: Math.hypot(jheadP[0] - seatP[0], jheadP[1] - seatP[1]) / pxPerMArt,
        },
        legs,
      };
      ref0 = deformedPoseAt({ travelM: 0, gate: 1, speedMps: 0, contract, gait: DEFORMED_GAIT_V0 });
      contractRef.current = contract;

      /** ★馬ごとに層の色を焼く（★`tack` は変えない） */
      baked = RUNNERS.map((r) => cut.map((p) => {
        const colour =
          p.meta.layer === 'coat' || p.meta.layer === 'mane' ? palette[r.coat] ?? '#8a6340'
            : p.meta.layer === 'silk' ? palette[r.silk] ?? '#2f6fd0'
              : p.meta.layer === 'cap' ? palette[r.frame] ?? '#d62828'
                : null;
        return colour === null ? null : tint(p.img, p.img.width, p.img.height, colour);
      }));

      const reach = Math.hypot(
        contract.legs.foreNear.upperM + contract.legs.foreNear.lowerM, 0,
      );
      setStatus(`${cut.length} パーツ × ${RUNNERS.length} 頭／馬の高さ ${HORSE_TOP_M}m・脚の長さ ${reach.toFixed(2)}m`);
    })().catch((e) => { setStatus(`⚠️ パーツを読めませんでした: ${String(e)}`); });

    let last = performance.now();
    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const W = canvas.width; const H = canvas.height;
      if (st.playing) travelRef.current += st.speedMps * dt;
      const travel = travelRef.current;
      const gait = { ...DEFORMED_GAIT_V0, strideM: st.strideM };

      const horseH = H * st.heightRatio;
      /** ★画面の px/m（★馬の描画高さと実寸から） */
      const pxPerM = horseH / HORSE_TOP_M;

      if (scenery !== null) {
        drawParallaxPlate(ctx, scenery.behind, {
          viewport: { width: W, height: H },
          zoom: PLATE_ZOOM, verticalAnchor: PLATE_ANCHOR,
          scrollM: travel, packPxPerM: pxPerM, packDepthM: PACK_DEPTH_M, direction: 1,
        });
      } else {
        ctx.fillStyle = '#9fc6e0'; ctx.fillRect(0, 0, W, H * 0.42);
        ctx.fillStyle = '#6d8b4e'; ctx.fillRect(0, H * 0.42, W, H * 0.58);
      }

      const plateScale = W / ((scenery?.plateWidth ?? 1672) / PLATE_ZOOM);
      const cropY0 = Math.max(0, (scenery?.plateHeight ?? 941) - H / plateScale) * PLATE_ANCHOR;
      const toScreenY = (py: number): number => (py - cropY0) * plateScale;
      const bandY0 = scenery?.groundY0 ?? 672;
      const bandY1 = scenery?.groundY1 ?? 762;

      const ref = ref0;
      if (pieces.length > 0 && contract !== null && ref !== null) {
        const scaleFor = (lane: number) => (1 - lane * 0.05);
        for (let i = 0; i < RUNNERS.length; i += 1) {
          const r = RUNNERS[i]!;
          const pose = deformedPoseAt({
            travelM: travel, gate: r.gate, speedMps: st.speedMps, contract, gait,
            standBend: st.standBend,
          });
          const depth = scaleFor(r.lane);
          const s = (horseH * depth) / workH;
          const t = RUNNERS.length > 1 ? r.lane / (RUNNERS.length - 1) : 0;
          const groundY = toScreenY(bandY1 - 8 - t * (bandY1 - bandY0 - 20));
          /**
           * ★前後に散らす。★**間隔は馬の描画長から**決めます。
           *   ⚠️ ★画面幅の固定割合（0.115）で置いていたら、★馬を大きくした瞬間に重なりました。
           */
          const horseLenPx = horseH * artAspect;
          const gapPx = horseLenPx * 0.62;
          const contest = Math.sin(travel * 0.09 + i * 1.7) * horseLenPx * 0.10;
          const originX = W * 0.10 + r.lane * gapPx + contest;
          /** ★原画の接地線が、走路の地面に来るように置く */
          const originY = groundY;
          const mToPx = pxPerM * depth;

          /** ★リグの解（m・y 上向き）を、原画基準の差分 px（y 下向き）へ */
          const dxOf = (a: { x: number; y: number }, b: { x: number; y: number }) =>
            ({ x: (a.x - b.x) * mToPx, y: -(a.y - b.y) * mToPx });

          /**
           * ★**脚は絶対配置、それ以外は原画からの差分。**
           *
           * ⚠️ ★1 度目は脚も差分にして ★**脚が二重に開きました**。
           *    ★原画の脚は**すでに駈歩の途中**の姿勢です。★そこへリグの絶対解の差分を足すと、
           *    ★開きが 2 回ぶん入ります（★実際、蹄が地面の下まで伸びました）。
           * → ★脚は ★**リグの解をそのまま置きます**。★骨の長さは原画のピボット間距離から
           *   ★測って契約に入れてあるので、★リグの膝は必ず原画の骨の長さの所に来ます。
           */
          const angleWorld: Record<string, number> = {};
          const posDelta: Record<string, { x: number; y: number }> = {};
          /** ★リグの座標 [m]（y 上向き・接地面が 0）→ 画面 px */
          const toScreen = (q: { x: number; y: number }) =>
            ({ x: originX + q.x * mToPx, y: groundY - q.y * mToPx });
          const absPos: Record<string, { x: number; y: number }> = {};
          for (const leg of DEFORMED_LEG_IDS) {
            const [un, ln, hn] = LEG_PARTS[leg];
            const L = pose.legs[leg];
            const pu = byPiece.get(un); const pl = byPiece.get(ln); const ph = byPiece.get(hn);
            if (pu === undefined || pl === undefined || ph === undefined) continue;
            /** ★原画での骨の向き（★y は上向きに揃える） */
            const upArt = Math.atan2(pl.rmy - pu.rmy, pl.rmx - pu.rmx);
            const loArt = Math.atan2(ph.rmy - pl.rmy, ph.rmx - pl.rmx);
            const upNow = Math.atan2(L.knee.y - L.hip.y, L.knee.x - L.hip.x);
            const loNow = Math.atan2(L.hoof.y - L.knee.y, L.hoof.x - L.knee.x);
            angleWorld[un] = -(upNow - upArt);
            angleWorld[ln] = -(loNow - loArt);
            angleWorld[hn] = -(loNow - loArt);
            absPos[un] = toScreen(L.hip);
            absPos[ln] = toScreen(L.knee);
            absPos[hn] = toScreen(L.hoof);
          }
          /**
           * ★**体側は胴体にぶら下げます。**
           *
           * ⚠️ ★1 度目は体側を「原画からの差分」で置き、脚だけ絶対配置にしました。
           *    ★すると ★**胴と脚が別の座標系にいる**ので、脚が体から外れて
           *    ★馬が 2 頭に見えました（★実際そう見えました）。
           * → ★胴体をリグの解に置き、★体側は**原画の相対位置のまま**胴に付けます。
           *   ★これで胴の上下と前後の傾きが、体全体に伝わります。
           */
          const pitch = pose.torso.angleRad;
          const pitch0 = ref.torso.angleRad;
          const torsoPiece = byPiece.get('torso');
          const torsoAt = toScreen({ x: pose.torso.x, y: pose.torso.y });
          /** ★胴体ピボットからの原画の相対位置を、傾けて画面へ */
          const onTorsoPx = (rmx: number, rmy: number, extra = 0) => {
            const a = -pitch + extra;
            const dx = rmx * mToPx; const dy = -rmy * mToPx;
            return {
              x: torsoAt.x + dx * Math.cos(a) - dy * Math.sin(a),
              y: torsoAt.y + dx * Math.sin(a) + dy * Math.cos(a),
            };
          };
          /** ★首まわりの追い角（★リグの首角には傾きが入っているので、傾きぶんを引きます） */
          const extraOf = (name: string): number => {
            const a = pose.parts[name as keyof typeof pose.parts];
            const b = ref.parts[name as keyof typeof ref.parts];
            if (a === undefined || b === undefined) return 0;
            if (name === 'neck' || name === 'mane' || name === 'head') {
              return -((a.angleRad - b.angleRad) - (pitch - pitch0));
            }
            return -(a.angleRad - b.angleRad);
          };
          const neckPiece = byPiece.get('neck');
          const neckExtra = extraOf('neck');
          for (const p of pieces) {
            if (p.meta.name in angleWorld) continue;
            const isNeckChild = (p.meta.name === 'mane' || p.meta.name === 'head') && neckPiece !== undefined;
            if (isNeckChild) {
              /** ★首にぶら下げる（★首が振れれば頭とたてがみもついてくる） */
              const nAt = onTorsoPx(neckPiece.rmx, neckPiece.rmy, neckExtra);
              const a = -pitch + neckExtra;
              const dx = (p.rmx - neckPiece.rmx) * mToPx;
              const dy = -(p.rmy - neckPiece.rmy) * mToPx;
              absPos[p.meta.name] = {
                x: nAt.x + dx * Math.cos(a) - dy * Math.sin(a),
                y: nAt.y + dx * Math.sin(a) + dy * Math.cos(a),
              };
              angleWorld[p.meta.name] = a + (extraOf(p.meta.name) - neckExtra);
              continue;
            }
            const extra = extraOf(p.meta.name);
            absPos[p.meta.name] = onTorsoPx(p.rmx, p.rmy, extra);
            angleWorld[p.meta.name] = -pitch + extra;
          }
          void torsoPiece;

          /** ★作業 px → 画面 px。★原点は「外接矩形の左端・接地線」 */
          const topY = originY - workH * s;
          const place = (name: string, wx: number, wy: number) => {
            const abs = absPos[name];
            if (abs !== undefined) return abs;
            const dp = posDelta[name] ?? { x: 0, y: 0 };
            return { x: originX + wx * s + dp.x, y: topY + wy * s + dp.y };
          };
          for (let k = 0; k < pieces.length; k += 1) {
            const p = pieces[k]!;
            const at = place(p.meta.name, p.wx, p.wy);
            ctx.save();
            ctx.translate(at.x, at.y);
            ctx.rotate(angleWorld[p.meta.name] ?? 0);
            ctx.scale(s, s);
            const tinted = baked[i]?.[k] ?? null;
            ctx.drawImage(p.img, -p.px, -p.py);
            if (tinted !== null) {
              ctx.globalAlpha = (p.meta.layer === 'coat' || p.meta.layer === 'mane') ? st.coatTint : 1;
              ctx.drawImage(tinted, -p.px, -p.py);
              ctx.globalAlpha = 1;
            }
            ctx.restore();
          }

          /**
           * ★骨を重ねる（★脚が届いているか・関節が正しいかを目で見るため）。
           *   ★パーツと**同じ置き方**で描きます（★別の式を持たない）。
           */
          if (st.showBones) {
            ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
            for (const leg of DEFORMED_LEG_IDS) {
              const [un, ln, hn] = LEG_PARTS[leg];
              const pu = byPiece.get(un); const pl = byPiece.get(ln); const ph = byPiece.get(hn);
              if (pu === undefined || pl === undefined || ph === undefined) continue;
              const a = place(un, pu.wx, pu.wy);
              const b = place(ln, pl.wx, pl.wy);
              const c = place(hn, ph.wx, ph.wy);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
              ctx.stroke();
              ctx.fillStyle = pose.legs[leg].contact ? '#7CFFB2' : '#ff7a7a';
              for (const q of [a, b, c]) { ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
            }
          }
        }
      }

      /** ★**手前のラチ**は馬の後に描く（★馬が走路の中に入ります） */
      if (scenery !== null) {
        drawParallaxPlate(ctx, scenery.front, {
          viewport: { width: W, height: H },
          zoom: PLATE_ZOOM, verticalAnchor: PLATE_ANCHOR,
          scrollM: travel, packPxPerM: pxPerM, packDepthM: PACK_DEPTH_M, direction: 1,
        });
      }

      ctx.fillStyle = 'rgba(20,28,34,.75)';
      ctx.fillRect(0, 0, 470, 62);
      ctx.fillStyle = '#eef2f6';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`進行 ${travel.toFixed(1)}m  速さ ${stateRef.current.speedMps.toFixed(1)}m/s`, 12, 24);
      ctx.font = '12px sans-serif';
      ctx.fillText(`1 完歩 ${stateRef.current.strideM.toFixed(2)}m（★パーツ駆動・コマ数の制限なし）`, 12, 46);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, []);

  /**
   * ★歩幅が脚に収まるか。★**既存の検定関数をそのまま使います**（★式をここで作らない）。
   *   ⚠️ ★契約は**納品パーツから測った寸法**なので、★読み込みが終わるまで判定できません。
   *      ★描画側が置いた契約を見て、★変わったときだけ書き換えます。
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = contractRef.current;
      if (c === null) return;
      const r = gaitFitsLegs(c, { ...DEFORMED_GAIT_V0, strideM }, 0.97, standBend);
      setFit(r.ok
        ? `歩幅 OK（${r.worstLeg} は ${r.needM.toFixed(2)}m 必要・脚は ${r.haveM.toFixed(2)}m）`
        : `⚠️ 脚が届きません（${r.worstLeg} に ${r.needM.toFixed(2)}m 必要・脚は ${r.haveM.toFixed(2)}m）`);
    }, 400);
    return () => window.clearInterval(id);
  }, [strideM, standBend]);

  return (
    <main style={{ minHeight: '100vh', background: '#12161a', color: '#eef2f6', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>パーツ駆動の検証台（★24 パーツ × STAR のリグ計算）</h1>
        <p style={{ margin: '0 0 10px', color: '#9aa8b4', fontSize: 13, lineHeight: 1.8 }}>
          ★焼いた 8 コマではありません。★<b>24 パーツを、その場でリグ計算が動かしています</b>（★コマ数の制限なし）。<br />
          ★止めたときの絵は<b>承認済み原画そのもの</b>です（★角度は原画からの差分で当てています）。
        </p>
        <canvas
          ref={hostRef} width={1280} height={720}
          style={{
            width: '100%', maxWidth: 'min(1280px, calc(62vh * 16 / 9))', display: 'block', margin: '0 auto',
            border: '1px solid #3d4650', background: '#9fc6e0',
          }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPlaying((v) => !v)} style={btn}>{playing ? '⏸ 停止' : '▶ 再生'}</button>
          <button type="button" onClick={reset} style={btn}>⟲ 最初から</button>
          <button type="button" onClick={() => setShowBones((v) => !v)} style={{ ...btn, background: showBones ? '#2f6fd0' : '#222a31' }}>
            {showBones ? '骨: 入' : '骨: 切'}
          </button>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            速さ {speedMps.toFixed(1)} m/s
            <input type="range" min={4} max={20} step={0.5} value={speedMps}
              onChange={(e) => setSpeedMps(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★1 完歩 {strideM.toFixed(2)} m
            <input type="range" min={2.5} max={9} step={0.02} value={strideM}
              onChange={(e) => setStrideM(Number(e.target.value))} style={{ display: 'block', width: 240, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★立ち高さ {standBend.toFixed(2)}（★原画の実測 0.93）
            <input type="range" min={0.55} max={0.97} step={0.01} value={standBend}
              onChange={(e) => setStandBend(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            ★毛色の濃さ {(coatTint * 100).toFixed(0)}%
            <input type="range" min={0} max={1} step={0.02} value={coatTint}
              onChange={(e) => setCoatTint(Number(e.target.value))} style={{ display: 'block', width: 200, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 700 }}>
            馬の高さ {(heightRatio * 100).toFixed(0)}%
            <input type="range" min={0.12} max={0.5} step={0.01} value={heightRatio}
              onChange={(e) => setHeightRatio(Number(e.target.value))} style={{ display: 'block', width: 220, marginTop: 4 }} />
          </label>
        </div>
        <p style={{ color: '#d8c88f', fontSize: 13, marginTop: 10 }}>{status}{fit === '' ? '' : ` ／ ${fit}`}</p>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  minHeight: 38, padding: '6px 14px', border: '1px solid #55606b', borderRadius: 6,
  background: '#222a31', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
};
