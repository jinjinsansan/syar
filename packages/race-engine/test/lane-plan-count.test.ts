/**
 * ★**1 レースの判定で、距離ロスの区間を作るのは 1 回だけ**（★ES 便 ES-4・2026-09-16・回答 `REVIEW_ENGINE_LANE_SPEED_ES3_ANSWER_20260916.md` §6）
 *
 * 【★見ている壊れ方】★速さの退行。★ES-2 で `resolveRace` は ★区間と `swingScale`（`lanePlanOf`）を ★**頭数によらず 1 レース 1 回**だけ作り、
 *   ★馬ごとに `laneExtraMOnPlan` で使い回すようになりました。★誰かが馬ごとに `laneExtraM`（★中で区間を作り直す）を呼ぶ形に戻すと、
 *   ★結果は同じまま ★**1 レースが数十倍遅くなり**、★10 分サイクルに入らなくなります（★報告 `REPORT_ENGINE_LANE_SPEED_20260915.md` §2）。
 *   ★時間は機械で揺れるので、★**呼び出しの回数**で固定します（回答 §Q-4）。
 *
 * 【★数え方】★製品のコードに数える状態を足しません（★回答 §Q-2「状態を持たない」）。★この検査の中だけ `../src/lane.js` を包み、
 *   ★`resolveRace`（`race.ts`）が import した `lanePlanOf`・`laneExtraM` の呼び出しを数えます。★包みは元の関数をそのまま呼ぶので、結果は変わりません
 *   （★指紋の検査 `lane-fingerprint.test.ts` は包みを使わずに同じ結果を見ています）。
 * ⚠️ ★ES-5 で分解の式を入れた後も、★この上限（1 レース 1 回）が成り立つこと（回答 §6）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lane.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lane.js')>();
  return {
    ...orig,
    lanePlanOf: vi.fn(orig.lanePlanOf),
    laneExtraM: vi.fn(orig.laneExtraM),
    ovalSegments: vi.fn(orig.ovalSegments),
  };
});

const lane = await import('../src/lane.js');
const { resolveRace, DEFAULT_RACE_BALANCE, DEFAULT_OVAL } = await import('../src/index.js');
const { fingerprintField } = await import('./lane-fingerprint.cases.js');

const cond = (distance: number, courseShape: 'oval' | 'straight', course?: typeof DEFAULT_OVAL) => ({
  raceId: 'count', distance, surface: 'turf' as const, trackCondition: 'good' as const, baseWeightKg: 55, courseShape,
  ...(course === undefined ? {} : { course }),
});

describe('★距離ロスの区間を作る回数（ES-4）', () => {
  beforeEach(() => { vi.mocked(lane.lanePlanOf).mockClear(); vi.mocked(lane.laneExtraM).mockClear(); vi.mocked(lane.ovalSegments).mockClear(); });

  it('★楕円のレースは、頭数によらず lanePlanOf が 1 回・馬ごとの laneExtraM は 0 回', () => {
    const shapes = [DEFAULT_OVAL, { lapM: 2400, homeStretchM: 540, widthM: 23 }];
    for (const heads of [8, 12, 18]) {
      for (const distance of [1200, 3000]) {
        for (const course of shapes) {
          vi.mocked(lane.lanePlanOf).mockClear(); vi.mocked(lane.laneExtraM).mockClear();
          resolveRace({ conditions: cond(distance, 'oval', course), entrants: fingerprintField(heads), seed: 4242, balance: DEFAULT_RACE_BALANCE });
          const label = `${heads}頭 ${distance}m ${course.lapM}`;
          expect(vi.mocked(lane.lanePlanOf).mock.calls.length, `${label} の lanePlanOf`).toBe(1);
          expect(vi.mocked(lane.laneExtraM).mock.calls.length, `${label} の laneExtraM（馬ごとに区間を作り直す経路）`).toBe(0);
        }
      }
    }
  });

  it('★直線のレースは距離ロスの区間を作らない（対照）', () => {
    resolveRace({ conditions: cond(1200, 'straight'), entrants: fingerprintField(18), seed: 4242, balance: DEFAULT_RACE_BALANCE });
    expect(vi.mocked(lane.lanePlanOf).mock.calls.length).toBe(0);
    expect(vi.mocked(lane.laneExtraM).mock.calls.length).toBe(0);
  });
});
