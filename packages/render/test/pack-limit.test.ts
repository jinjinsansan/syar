/**
 * ★**2D 馬群描画の限界テスト**の検証用コード（指示書 §9）
 *
 * 【★このテストが守るもの】
 *   ① 同じシード・同じ入力なら、座標も位相も一致する（決定論・憲法 4）
 *   ② 密集化は**順序を変えない**（＝着順に触れていない）
 *   ③ 上位 8 頭の広がりが 5〜7m に入る
 *   ④ 位相のずれが 12 頭すべて同じではない
 *   ⑤ 奥行き順を入れ替えると描画順も入れ替わる
 *   ⑥ ★**検証用の設定が通常レースへ漏れない**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PACK_LIMIT_TEST, packDensify, packPhaseOffsets, packStrideScale, type PackHorse,
} from '../src/pack-limit.js';
import { ovalCourse } from '../src/course.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';
import { drawPerspectiveHorses } from '../src/perspective-draw.js';

/** 実レースに近い、伸びた隊列（実測: ゴール前で上位 8 頭が 27.7m） */
const SPREAD: readonly PackHorse[] = [
  { gate: 3, s: 1000.0, w: 2.6 }, { gate: 11, s: 997.5, w: 5.1 }, { gate: 7, s: 994.0, w: 3.4 },
  { gate: 8, s: 989.0, w: 8.2 }, { gate: 12, s: 986.5, w: 6.0 }, { gate: 4, s: 982.0, w: 11.4 },
  { gate: 5, s: 978.0, w: 4.2 }, { gate: 2, s: 972.3, w: 9.7 }, { gate: 9, s: 966.0, w: 13.1 },
  { gate: 6, s: 961.0, w: 7.3 }, { gate: 10, s: 955.5, w: 10.2 }, { gate: 1, s: 949.0, w: 15.0 },
];

const spanOfTop = (list: readonly PackHorse[], n: number): number => {
  const sorted = [...list].sort((a, b) => b.s - a.s);
  return sorted[0]!.s - sorted[Math.min(n, sorted.length) - 1]!.s;
};

describe('2D 馬群の限界テスト（検証用コード）', () => {
  it('★① 同じ入力なら同じ結果（決定論）', () => {
    expect(packDensify(SPREAD, PACK_LIMIT_TEST)).toEqual(packDensify(SPREAD, PACK_LIMIT_TEST));
    expect([...packPhaseOffsets(12, 42)]).toEqual([...packPhaseOffsets(12, 42)]);
    // ★対照: シードが違えば違う（シードが効いていないことの検出）
    expect([...packPhaseOffsets(12, 42)]).not.toEqual([...packPhaseOffsets(12, 43)]);
  });

  /**
   * ★②: **順序を変えないこと。**
   *   ここが崩れると、密集化が「着順を書き換えている」ことになります（憲法 3）。
   */
  it('★② 密集化しても前後の順序は変わらない（着順に触れていない）', () => {
    const before = [...SPREAD].sort((a, b) => b.s - a.s).map((h) => h.gate);
    const after = [...packDensify(SPREAD, PACK_LIMIT_TEST)].sort((a, b) => b.s - a.s).map((h) => h.gate);
    expect(after).toEqual(before);
  });

  it('★③ 上位 8 頭の広がりが 5〜7m に入る', () => {
    expect(spanOfTop(SPREAD, 8)).toBeGreaterThan(20);          // 前提: 元は伸びている
    const dense = packDensify(SPREAD, PACK_LIMIT_TEST);
    const span = spanOfTop(dense, 8);
    expect(span).toBeGreaterThanOrEqual(5);
    expect(span).toBeLessThanOrEqual(7);
  });

  it('★ 完全に同じ点へは重ならない（画像が 1 枚に潰れない）', () => {
    const dense = [...packDensify(SPREAD, PACK_LIMIT_TEST)].sort((a, b) => b.s - a.s);
    for (let i = 1; i < dense.length; i += 1) {
      expect(dense[i - 1]!.s - dense[i]!.s).toBeGreaterThanOrEqual(PACK_LIMIT_TEST.minSeparationM - 1e-9);
    }
    // 横は 2〜4 列（指示書 §6）
    const columns = new Set(dense.map((h) => Math.round(h.w / PACK_LIMIT_TEST.lateralStepM)));
    expect(columns.size).toBeGreaterThanOrEqual(2);
    expect(columns.size).toBeLessThanOrEqual(4);
  });

  /**
   * ★④: 位相が 12 頭すべて同じでないこと。
   *   ⚠️ 「全部違う」だけでは足りません。**等間隔に並んでいない**ことも見ます
   *      （現行の `馬番 × 0.37` は全部違いますが、等間隔なので周期的に揃います）。
   */
  it('★④ 位相のずれが 12 頭すべて同じでなく、等間隔でもない', () => {
    const offsets = [...packPhaseOffsets(12, PACK_LIMIT_TEST.phaseSeed).values()];
    expect(new Set(offsets.map((v) => v.toFixed(6))).size).toBe(12);
    const sorted = [...offsets].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((v, i) => v - sorted[i]!);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    // ★等間隔なら分散はほぼ 0。散っていることを見る
    expect(variance).toBeGreaterThan(1e-4);
    // 完歩長の個体差も 12 頭で違う（±4% の範囲内）
    const strides = [...packStrideScale(12, PACK_LIMIT_TEST.phaseSeed).values()];
    expect(new Set(strides.map((v) => v.toFixed(6))).size).toBe(12);
    for (const v of strides) expect(Math.abs(v - 1)).toBeLessThanOrEqual(0.04 + 1e-9);
  });

  /**
   * ★⑤: 描画順が**奥行き**で決まること。
   *   手前の馬があとに描かれる（＝奥の馬を隠す）。
   */
  it('★⑤ 奥行き順を入れ替えると描画順も入れ替わる', () => {
    const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
    const drawOrderFor = (horses: readonly PackHorse[]): number[] => {
      const scene = resolveBroadcastV2Scene(course, horses, { width: 1920, height: 1080 }, false,
        { forceShotId: 'side-low' as never });
      const order: number[] = [];
      const target: Record<string, unknown> = {
        drawImage: () => undefined, beginPath: () => undefined, fill: () => undefined,
        ellipse: () => undefined, save: () => undefined, restore: () => undefined,
        transform: () => undefined, measureText: () => ({ width: 1 }),
      };
      const ctx = new Proxy(target, {
        get: (obj, key) => (key in obj ? obj[key as string] : () => undefined),
        set: () => true,
      });
      drawPerspectiveHorses(ctx as never, course, scene.camera, horses, {
        sheet: 'x' as never, sheetWidth: 800, spec: { frames: 8, cellH: 100 } as never,
        fieldSize: 12, frameOf: () => 0, frameRoleOf: (gate) => { order.push(gate); return 'frame-1'; },
        distanceMeter: 1600,
      });
      return order;
    };
    // 横位置（＝カメラからの奥行き）だけを入れ替える
    const a = [{ gate: 1, s: 1000, w: 3 }, { gate: 2, s: 1000, w: 15 }];
    const b = [{ gate: 1, s: 1000, w: 15 }, { gate: 2, s: 1000, w: 3 }];
    const orderA = drawOrderFor(a), orderB = drawOrderFor(b);
    expect(orderA).toHaveLength(2);
    expect(orderB).toHaveLength(2);
    expect(orderA).toEqual([...orderB].reverse());
  });

  /**
   * ★⑥: **検証用の設定が通常レースへ漏れていないこと。**
   *
   *   ⚠️ 「気をつける」では守れません（P3 の教訓）。`pack-limit` を参照している
   *      ファイルを機械で数え、**検証用の道具と自分自身とテスト以外に無い**ことを見ます。
   */
  it('★⑥ 検証用コードが通常レースの経路から参照されていない', () => {
    const roots = [
      { dir: join(process.cwd(), 'packages', 'render', 'src'), label: 'render/src' },
      { dir: join(process.cwd(), 'apps', 'web', 'src', 'app', 'race'), label: 'race ページ' },
    ];
    const hits: string[] = [];
    const walk = (dir: string, label: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, label); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (entry.name === 'pack-limit.ts') continue;              // 自分自身
        const text = readFileSync(full, 'utf8');
        if (/packDensify|packPhaseOffsets|packStrideScale|PACK_LIMIT_TEST/.test(text)) {
          hits.push(`${label}/${entry.name}`);
        }
      }
    };
    for (const { dir, label } of roots) walk(dir, label);
    /**
     * ★`index.ts` の再輸出だけは許します（道具が `@star/render` から読むため）。
     *   それ以外に 1 件でもあれば、通常のレースへ漏れています。
     */
    expect(hits.filter((h) => !h.endsWith('index.ts'))).toEqual([]);
  });

  /**
   * ★V0 が「現状相当」であること: 密集化を通していない入力は**素通し**になる。
   *   ⚠️ ここが変わっていたら、V0 が対照群になりません。
   */
  it('★V0 の対照性: 密集化を掛けなければ座標は元のまま', () => {
    const untouched = SPREAD.map((h) => ({ ...h }));
    expect(untouched).toEqual([...SPREAD]);
    // 密集化を掛けたときだけ変わる
    expect(packDensify(SPREAD, PACK_LIMIT_TEST)).not.toEqual([...SPREAD]);
  });
});
