/**
 * ★**4 頭の検証台と桜星賞の配置が一致すること**（★2026-09-10）
 *
 * ★指示書 `DEV_INSTRUCTIONS_P4_GAIT_INTEGRATION_REGRESSION_20260910.md` §5「数値・接続」:
 *   ★① ★**コマの鞍布検出幅が変わっても、描画側が余分な拡縮を足さない**
 *   ★② ★同じ位相・素材・投影なら、★検証台で合意した配置モデルと本編配置が一致する
 *
 * 【★この検査が「実装の書き写し」でない理由】
 *   ★本編側は ★`horseFramePlacement`（★配置）＋ ★`scaledHorseLift`（★描画側が実際に使う関数）から、
 *   ★検証台側は ★`benchCanvasTopY`（★`sprite-client.tsx` の式）から、★**別々に**画面 y を出して突き合わせる。
 *   ★片方を書き換えればもう片方と外れる。
 *
 * 【★前提条件も検査する】（★R-11）
 *   ★実素材の目録に `nativeBounds` / `nativeCanvasHeight` があること。
 *   ★無ければ「ばらつき 0」は ★**素材が読めていないだけ**でも成立してしまう。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  horseFramePlacement, feetRatioOf, medianAnchorWidth, benchCanvasTopY,
  type HorsePlacementFrame, type HorsePlacementSet,
} from '../src/horse-ground.js';
import { scaledHorseLift } from '../src/race-motion.js';

const ROOT = path.resolve(__dirname, '../../..');
const MANIFEST = path.join(ROOT, 'apps/web/public/art/baked/manifest.json');

interface BakedFrame {
  readonly h: number;
  readonly anchor: { readonly y: number; readonly width: number };
  readonly anchorKind?: string;
  readonly nativeBounds: { readonly y: number; readonly height: number };
}
interface BakedSet {
  readonly role: string;
  readonly prefix: string;
  readonly scale: number;
  readonly referenceHeight: number;
  readonly nativeCanvasHeight: number;
  readonly frames: readonly BakedFrame[];
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { readonly sets: readonly BakedSet[] };
/** ★今回の対象＝デフォルメ馬の整形済み素材（★真横 A / B・★斜め前 A / B） */
const TARGET_ROLES = ['side-v6', 'side-v6-b', 'diag-front-v2', 'diag-front-v2-b'] as const;

const framesOf = (set: BakedSet): HorsePlacementFrame[] => set.frames.map((t) => ({
  frameHeightSourcePx: t.h,
  anchorYSourcePx: t.anchor.y,
  anchorWidthSourcePx: t.anchor.width,
  anchorIsSaddle: t.anchorKind === 'saddle',
  lowRatio: (t.nativeBounds.y + t.nativeBounds.height) / set.nativeCanvasHeight,
}));

const measuredSet = (set: BakedSet, frames: readonly HorsePlacementFrame[]): HorsePlacementSet => ({
  mode: 'measured-ground',
  referenceHeight: set.referenceHeight,
  canvasHeightSourcePx: set.nativeCanvasHeight * set.scale,
  feetRatio: feetRatioOf(frames.map((f) => f.lowRatio)),
});

describe('実素材の前提（R-11）', () => {
  it('対象 4 組が目録にあり、原版の画布と輪郭の座標を持っている', () => {
    for (const role of TARGET_ROLES) {
      const set = manifest.sets.find((s) => s.role === role);
      expect(set, `${role} が目録にない`).toBeDefined();
      expect(set!.nativeCanvasHeight).toBeGreaterThan(0);
      expect(set!.frames.length).toBe(8);
      for (const t of set!.frames) {
        expect(t.nativeBounds.height).toBeGreaterThan(0);
        expect(t.nativeBounds.y + t.nativeBounds.height).toBeLessThanOrEqual(set!.nativeCanvasHeight);
      }
    }
  });
});

describe('F-G1 コマ別の拡縮を足さない', () => {
  it('鞍布の検出幅がコマごとに違っても、縮尺の分母は 8 コマとも同じ', () => {
    for (const role of TARGET_ROLES) {
      const set = manifest.sets.find((s) => s.role === role)!;
      const frames = framesOf(set);
      /** ★前提: ★この素材の鞍布幅は ★実際にばらついている（★ばらつきが無ければ検査が空振りする） */
      const widths = frames.map((f) => f.anchorWidthSourcePx);
      expect(Math.max(...widths) - Math.min(...widths), `${role} の鞍布幅がばらついていない`)
        .toBeGreaterThan(0);

      const refs = frames.map((f, i) => horseFramePlacement(measuredSet(set, frames), f, i).referenceHeight);
      expect(new Set(refs).size, `${role} の縮尺の分母がコマごとに違う`).toBe(1);
      expect(refs[0]).toBe(set.referenceHeight);
    }
  });

  it('対照: 従来の指定では同じ素材で実際に拡縮が入る（★検査が効いていることの確認・R-21）', () => {
    const set = manifest.sets.find((s) => s.role === 'side-v6')!;
    const frames = framesOf(set);
    const legacy: HorsePlacementSet = {
      mode: 'legacy-table',
      referenceHeight: set.referenceHeight,
      canvasHeightSourcePx: set.nativeCanvasHeight * set.scale,
      feetRatio: 1,
      legacyMedianAnchorWidth: medianAnchorWidth(frames),
      legacyFlightLiftSourcePx: frames.map(() => 0),
    };
    const refs = frames.map((f, i) => horseFramePlacement(legacy, f, i).referenceHeight);
    expect(new Set(refs).size).toBeGreaterThan(1);
    /** ★隣接コマ間の倍率変化（★指示書 §3 F-G1 は真横 A で 12.18% と報告） */
    const scales = refs.map((r) => set.referenceHeight / r);
    let worst = 0;
    for (let i = 0; i < scales.length; i += 1) {
      const next = scales[(i + 1) % scales.length]!;
      worst = Math.max(worst, Math.abs(next / scales[i]! - 1));
    }
    expect(worst).toBeGreaterThan(0.1);
  });
});

describe('F-G2 検証台と同じ接地になる', () => {
  /**
   * ★本編の描画式（`perspective-draw.ts`）を整理すると
   *   ★`輪郭の下端 = 接地点 − (bodyLift − 足元までの距離) × bob × 縮尺`
   * ★検証台の式（`benchCanvasTopY`）から出る輪郭の下端と、★同じ値になること。
   */
  it.each([0, 0.3, 1])('浮き %s で、本編の輪郭下端が検証台と一致する', (bob) => {
    for (const role of TARGET_ROLES) {
      const set = manifest.sets.find((s) => s.role === role)!;
      const frames = framesOf(set);
      const placementSet = measuredSet(set, frames);
      /** ★投影の大きさ（★画面上の馬の高さ）。★任意の値で成立すること */
      for (const hpx of [180, 420]) {
        frames.forEach((f, i) => {
          const placed = horseFramePlacement(placementSet, f, i);
          const scale = hpx / placed.referenceHeight;
          const feetFromAnchor = f.frameHeightSourcePx - f.anchorYSourcePx;
          const groundY = 500;
          /** ★本編: 描画側が実際に呼ぶ `scaledHorseLift` を通す */
          const top = groundY
            - scaledHorseLift(placed.bodyLiftSourcePx, feetFromAnchor, bob) * scale
            - f.anchorYSourcePx * scale;
          const mainBottom = top + f.frameHeightSourcePx * scale;
          /** ★検証台: 画布の上端から、★そのコマの輪郭下端まで */
          const canvasOnScreen = placementSet.canvasHeightSourcePx * scale;
          const benchBottom = benchCanvasTopY(
            groundY, canvasOnScreen, placementSet.feetRatio, f.lowRatio, bob,
          ) + canvasOnScreen * f.lowRatio;
          expect(mainBottom, `${role} コマ${i + 1} bob=${bob} hpx=${hpx}`).toBeCloseTo(benchBottom, 9);
        });
      }
    }
  });

  it('浮き 0 は全コマ接地（★従来の見え方と 1 画素も変えない対照）', () => {
    const set = manifest.sets.find((s) => s.role === 'side-v6')!;
    const frames = framesOf(set);
    const placementSet = measuredSet(set, frames);
    frames.forEach((f, i) => {
      const placed = horseFramePlacement(placementSet, f, i);
      const scale = 300 / placed.referenceHeight;
      const feetFromAnchor = f.frameHeightSourcePx - f.anchorYSourcePx;
      const top = 500 - scaledHorseLift(placed.bodyLiftSourcePx, feetFromAnchor, 0) * scale
        - f.anchorYSourcePx * scale;
      expect(top + f.frameHeightSourcePx * scale).toBeCloseTo(500, 9);
    });
  });

  it('浮き 1 は素材が描いている浮きをそのまま出す（★平らにしない）', () => {
    const set = manifest.sets.find((s) => s.role === 'side-v6')!;
    const frames = framesOf(set);
    const placementSet = measuredSet(set, frames);
    const lifts = frames.map((f, i) => {
      const placed = horseFramePlacement(placementSet, f, i);
      const scale = 300 / placed.referenceHeight;
      const feetFromAnchor = f.frameHeightSourcePx - f.anchorYSourcePx;
      return (placed.bodyLiftSourcePx - feetFromAnchor) * scale;
    });
    /** ★接地するコマ（★いちばん低い蹄）が 1 つ以上あり、★浮くコマがある */
    expect(Math.min(...lifts)).toBeCloseTo(0, 9);
    expect(Math.max(...lifts)).toBeGreaterThan(1);
  });
});

describe('接地線は素材から出す', () => {
  it('組の中でいちばん低い蹄を接地線にする', () => {
    expect(feetRatioOf([0.85, 0.92, 0.88])).toBe(0.92);
    expect(feetRatioOf([])).toBe(1);
  });
});
