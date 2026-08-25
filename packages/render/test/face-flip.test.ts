/**
 * ★**馬の絵の左右反転が、カットの途中で起きないこと**
 *
 * 【何が起きていたか】
 *   馬は板の絵なので、向きは素材の選び分けと左右反転でしか変わりません。反転を毎コマ
 *   決めていたため、コーナーを回る途中で符号が変わり、★**馬だけが 1 コマで裏返って**いました。
 *   実測（seed 42・`fourth-corner-front`・表示 19.20s / 6 シードすべてで 1 回）。
 *   ★オーナー評「**滑らかに曲がっていない。かくかく曲がっている**」。
 *
 * 【この案件の基準】
 *   ★**カットの途中で跳ぶのは不具合／カットの境目なら許容**。同じ形の 3 例目です
 *   （①順位入替で注視点が 237px 飛ぶ ②先頭差で画角が 13°→6° に跳ぶ ③今回の反転）。
 *
 * ⚠️ ★レース結果は使いません。馬をコースに沿って進めるだけの合成データです（憲法 3）。
 */
import { describe, expect, it } from 'vitest';
import { ovalCourse, posOf, cameraBasis, project, SCRIPT_V5, type BroadcastV2Script } from '../src/index.js';
import { resolveBroadcastV2Scene, type BroadcastV2Horse } from '../src/broadcast-v2-scene.js';

const DIST = 1600;
const course = ovalCourse(DIST, { widthM: 20, turn: 'left' });
const VIEWPORT = { width: 1280, height: 720 };

/** ★先頭が `leadS` にいる 12 頭（隊列は固定・着順には触れない） */
const fieldAt = (leadS: number): BroadcastV2Horse[] =>
  Array.from({ length: 12 }, (_, i) => ({ gate: i + 1, s: Math.max(0, leadS - i * 2.5), w: 5 + (i % 4) * 2 }));

const sceneAt = (leadS: number, script: BroadcastV2Script) =>
  resolveBroadcastV2Scene(course, fieldAt(leadS), VIEWPORT, false, { script, fourthCornerFront: true });

/** ★直す前の決め方（毎コマ・注視点の向きの投影）。★比較のためだけに置いています */
const rawFlipOf = (scene: ReturnType<typeof sceneAt>): boolean => {
  const p0 = posOf(course, scene.focusS, scene.focusW);
  const p1 = posOf(course, scene.focusS + 1, scene.focusW);
  const basis = cameraBasis(scene.camera);
  const q0 = project(scene.camera, basis, { x: p0.x, y: p0.y, z: 0 });
  const q1 = project(scene.camera, basis, { x: p1.x, y: p1.y, z: 0 });
  return (q1.x - q0.x) < 0;
};

describe('馬の絵の左右反転', () => {
  for (const script of ['v5', 'v4'] as const) {
    it(`★台本 ${script}: 反転が変わるのはカットの境目だけ`, () => {
      let prev = sceneAt(1, script);
      for (let s = 2; s <= DIST; s += 1) {
        const cur = sceneAt(s, script);
        if (cur.faceFlip !== prev.faceFlip) {
          expect(cur.shot.id, `先頭 ${s}m で、同じカット（${cur.shot.id}）の中で反転した`).not.toBe(prev.shot.id);
        }
        prev = cur;
      }
    });
  }

  it('★直す前は第4コーナーのカットの中で反転していた（この検査が意味を持つことの確認）', () => {
    /**
     * ★R-14 の作法: **直っていない状態なら落ちる**ことを、同じ入力で確かめます。
     *   毎コマ決める旧方式なら、`fourth-corner-front` のカットの中で符号が変わります。
     */
    const cut = SCRIPT_V5.findIndex((row) => row.id === 'fourth-corner-front');
    expect(cut).toBeGreaterThan(0);
    const from = Math.ceil((SCRIPT_V5[cut - 1]?.until ?? 0) * DIST) + 1;
    const to = Math.floor((SCRIPT_V5[cut]?.until ?? 0) * DIST) - 1;
    const raws = new Set<boolean>();
    const kept = new Set<boolean>();
    for (let s = from; s <= to; s += 1) {
      const scene = sceneAt(s, 'v5');
      expect(scene.shot.id).toBe('fourth-corner-front');
      raws.add(rawFlipOf(scene));
      kept.add(scene.faceFlip);
    }
    // ★旧方式なら 2 通り（＝カットの中で裏返る）
    expect(raws.size, '旧方式でも反転しないなら、この検査は何も守っていない').toBe(2);
    // ★いまは 1 通りだけ（＝カット中は変わらない）
    expect(kept.size, 'カットの中で反転している').toBe(1);
  });
});
