/**
 * ★**争っている馬を画面に収める**（オーナー指摘 2026-08-22）
 *
 * 【何が起きていたか】
 *   参考に合わせて直線の寄りを 53% にした結果、★**画面に 1〜2 頭しか入らなくなりました。**
 *   ところがエンジンは差し・追い込みを出しています。60 レースの実測:
 *     残り 400m で 4 番手以下だった馬が勝つ … **35%**
 *     先頭のまま押し切る               … 43%
 *   デモ（シード 42）の勝ち馬 10 番は**追い込み**で、
 *     625m 地点で **10 番手・23.9m 差** → 1186m で 4 番手・8.6m → 1410m で先頭
 *   ★**その差し切りが、全部画面の外で起きていました。**
 *   オーナー評「最後の直線で最後 2 頭が走って、ただ前の馬が勝つだけ」。
 *
 * 【★この検査が見ているのは 3 つの壊れ方】
 *   ① 隊列が伸びても寄ったまま → 差してくる馬が画面に入らない（今回の実害）
 *   ② 隊列が詰まっても引いたまま → 参考の寄り（53%）が二度と出ない
 *   ③ 余白が足りない → 先頭と最後尾が画面の縁に来て、抜いた瞬間が切れる
 */
import { describe, it, expect } from 'vitest';
import { ovalCourse } from '../src/course.js';
import { broadcastV2ContenderFov, broadcastV2ShotById } from '../src/broadcast-v2.js';
import { resolveBroadcastV2Scene } from '../src/broadcast-v2-scene.js';

const course = ovalCourse(1600, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** 先頭 `lead`、後続を `gaps` m 後ろに置いたときの解決画角（度） */
function fovFor(shotId: string, lead: number, gaps: readonly number[]): number {
  const horses = [{ gate: 1, s: lead, w: 6 },
    ...gaps.map((g, i) => ({ gate: i + 2, s: lead - g, w: 6 + ((i % 4) * 2) }))];
  const scene = resolveBroadcastV2Scene(course, horses, VIEWPORT, false, { forceShotId: shotId as never });
  return (scene.camera.fovY * 180) / Math.PI;
}

describe('争っている馬を画面に収める', () => {
  const preset = broadcastV2ShotById('homestretch-side').camera;

  /** ★②: 詰まっていれば、ショット本来の寄り（参考の 53%）まで寄ること */
  it('★馬群が詰まっていれば寄る（参考と同じ 5.7°）', () => {
    expect(fovFor('homestretch-side', 1200, [0.5, 1.0, 1.5])).toBeCloseTo(preset.fovDeg, 3);
  });

  /** ★①: 伸びていれば引くこと */
  it('★差してくる馬が離れていれば引く', () => {
    const tight = fovFor('homestretch-side', 1200, [0.5, 1.0]);
    const spread = fovFor('homestretch-side', 1200, [4, 8, 11]);
    expect(spread).toBeGreaterThan(tight);
    // ★上限を超えては引かない（引きすぎると馬が豆粒になる）
    const huge = fovFor('homestretch-side', 1200, [40, 80, 120]);
    expect(huge).toBeLessThanOrEqual(broadcastV2ShotById('homestretch-side').frameContenders!.maxFovDeg + 1e-6);
  });

  /**
   * ★**「争っている馬」の範囲の外は無視すること。**
   *   これが無いと、大きく離れた最後尾に引きずられて毎回いちばん引いた画になります。
   */
  it('★大きく離れた馬には引きずられない', () => {
    const spec = broadcastV2ShotById('homestretch-side').frameContenders!;
    const near = fovFor('homestretch-side', 1200, [1, 2]);
    const nearPlusFar = fovFor('homestretch-side', 1200, [1, 2, spec.withinM + 40]);
    expect(nearPlusFar).toBeCloseTo(near, 6);
  });

  /** ★③: 余白があること（先頭と最後尾が縁に来ない） */
  it('★視野は争っている範囲より広い（縁で切れない）', () => {
    const spanM = 9;
    const distM = Math.hypot(preset.backM, preset.upM, preset.sideM);
    const aspect = VIEWPORT.width / VIEWPORT.height;
    const deg = broadcastV2ContenderFov(spanM, distM, aspect, preset.fovDeg, 13);
    const visibleX = 2 * distM * Math.tan((deg * Math.PI) / 180 / 2) * aspect;
    expect(visibleX).toBeGreaterThan(spanM + 2.4);   // 馬 1 頭ぶん以上の余白
  });

  it('★指定の無いショットは画角を動かさない（対照）', () => {
    expect(broadcastV2ShotById('finish-line').frameContenders).toBeUndefined();
    const a = fovFor('finish-line', 1560, [1, 2]);
    const b = fovFor('finish-line', 1560, [8, 16, 24]);
    expect(a).toBeCloseTo(b, 6);
  });

  it('★決定論 — 同じ入力なら同じ画角（憲法4）', () => {
    expect(fovFor('homestretch-side', 1200, [4, 8])).toBe(fovFor('homestretch-side', 1200, [4, 8]));
  });
});
