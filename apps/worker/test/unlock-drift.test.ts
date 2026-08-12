/**
 * ★開放率のずれ検出（レビュー側裁定 2026-08-13）
 *
 * 【なぜ「記録するだけ」では足りないか】
 *   これまで `unlock_daily` に記録はしていましたが、
 *   「測定時からずれたら測り直してください」は ★**手順**でした。
 *   手順は読まれなければ働きません。→ ワーカー自身が突き合わせて通報します。
 *
 * 【★平均だけを見ない】
 *   平均が同じでも上下に割れていれば別の世界です（Q-P3-39 の裁定）。
 *   だから**四分位が動いたときも鳴る**ことを、ここで固定します。
 */
import { describe, it, expect } from 'vitest';
import { UNLOCK_BASELINE, UNLOCK_DRIFT_TOLERANCE, unlockDrift } from '../src/unlock-flow.js';

const at = (o: Partial<Record<'mean' | 'sd' | 'p10' | 'p50' | 'p90', number>>) => ({
  horses: 7338,
  mean: UNLOCK_BASELINE.mean,
  sd: UNLOCK_BASELINE.sd,
  p10: UNLOCK_BASELINE.p10,
  p50: UNLOCK_BASELINE.p50,
  p90: UNLOCK_BASELINE.p90,
  ageMean: 182,
  ...o,
});

describe('★開放率が P1 のゲートを測ったときの分布からずれたら鳴る', () => {
  it('★ずれていなければ鳴らない（対照）', () => {
    expect(unlockDrift(at({}))).toEqual([]);
  });

  it('★平均がずれたら鳴る', () => {
    const d = unlockDrift(at({ mean: UNLOCK_BASELINE.mean + UNLOCK_DRIFT_TOLERANCE.mean + 0.01 }));
    expect(d.map((x) => x.key)).toContain('mean');
  });

  it('★平均が同じでも、分布の形が変われば鳴る（★これが本題）', () => {
    // 平均は動かさず、上下に割る
    const d = unlockDrift(at({
      p10: UNLOCK_BASELINE.p10 - UNLOCK_DRIFT_TOLERANCE.quantile - 0.01,
      p90: UNLOCK_BASELINE.p90 + UNLOCK_DRIFT_TOLERANCE.quantile + 0.01,
    }));
    expect(d.map((x) => x.key).sort()).toEqual(['p10', 'p90']);
    // ★平均は鳴っていない＝「平均だけ見ていたら見逃していた」ことの明示
    expect(d.map((x) => x.key)).not.toContain('mean');
  });

  it('★境界の両側（R-2）', () => {
    /**
     * ★**境界そのものは浮動小数で厳密に試験できません。**
     *   `0.713 + 0.05` を引き算すると `0.050000000000000044` になり、
     *   「ちょうど許容幅」を書いたつもりが**外側**になります（実際に落ちました）。
     *   → 内外を**明確に離して**書きます。ここで見たいのは
     *     「幅の内側は鳴らない／外側は鳴る」であって、丸め誤差の挙動ではありません。
     */
    const inside = UNLOCK_BASELINE.mean + UNLOCK_DRIFT_TOLERANCE.mean - 1e-6;
    const outside = UNLOCK_BASELINE.mean + UNLOCK_DRIFT_TOLERANCE.mean + 1e-6;
    expect(unlockDrift(at({ mean: inside }))).toEqual([]);
    expect(unlockDrift(at({ mean: outside })).map((x) => x.key)).toEqual(['mean']);
    // ★下側でも鳴る（片側だけ見て「両側を見た」としない）
    expect(unlockDrift(at({ mean: UNLOCK_BASELINE.mean - UNLOCK_DRIFT_TOLERANCE.mean - 1e-6 }))
      .map((x) => x.key)).toEqual(['mean']);
  });

  it('★基準値が「ゲートを測ったときの分布」であること（勝手に動かさない）', () => {
    // ★実測に合わせて基準を動かすと警告が黙るだけなので、値そのものを固定する
    expect(UNLOCK_BASELINE.mean).toBeCloseTo(0.713, 3);
    expect(UNLOCK_BASELINE.p10).toBeCloseTo(0.553, 3);
    expect(UNLOCK_BASELINE.p50).toBeCloseTo(0.738, 3);
    expect(UNLOCK_BASELINE.p90).toBeCloseTo(0.861, 3);
  });
});
