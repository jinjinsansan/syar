/**
 * 🔴 ★**プリシードの出力を、★数で釘付けにする**（★2026-09-20）。
 *
 * 【★なぜ要るか】
 *   ★既存の「同じ種から同じプールが出る」検査は ★**同じコードの中での再現性**しか見ません。
 *   → ★★**配合の論理を書き換えると、★2 回とも同じだけ変わるので、★検査は通ります。**
 *   ⚠️ ★しかし ★**本番の世界は `runPreseed(20260833)` から作りました。**
 *     ★出力が変われば、★★**あの世界は二度と同じ種から再現できません。**
 *
 * → ★**要約（sha256）を literal で持ちます。** ★変わったら落ちます。
 * ⚠️ ★**落ちること自体は「悪い」ではありません。** ★意図して変えたなら、
 *    ★**なぜ変えたか**を書いて、★この数を更新してください（★黙って更新しないこと）。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ALLOW_ALL_NAMES, NPC_STABLES } from '@star/sim-engine';
import { DEFAULT_PRESEED_OPTIONS, preseedNicks, runPreseed } from '../src/preseed.js';

/** ★世界の骨格だけを取る（★名前は別の乱数なので、配合の論理とは分けます） */
function digestOf(seed: number, generations: number): string {
  const r = runPreseed({
    ...DEFAULT_PRESEED_OPTIONS,
    seed,
    generations,
    nicks: preseedNicks(seed, NPC_STABLES),
    blocklist: ALLOW_ALL_NAMES,
  });
  const lines: string[] = [];
  for (const [id, h] of [...r.world.all].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const x = h.record;
    lines.push([
      id, x.sireId ?? '-', x.damId ?? '-', x.birthYear, x.generation,
      x.sireLine, x.damSireLine ?? '-',
      x.inbreedCoeff.toFixed(6), x.nicksMultiplier.toFixed(4),
    ].join('|'));
  }
  return `${lines.length}:${createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex')}`;
}

describe('🔴 ★プリシードの出力を釘付けにする（★配合の論理を黙って変えない）', () => {
  /**
   * ⚠️ ★この数を更新してよいのは、★**意図して配合の論理を変えたとき**だけです。
   *    ★そのときは、★**何を変えたか**をここに 1 行 足してください。
   *    ★2026-09-20: 最初に記録（★`@star/breeding` へ移す**前**の値）
   */
  const GOLDEN = '5000:2c57dc946a2c28c25f05d5cedb0d4ae099e224b8aebcfa6e0495b73010f6c007';

  it('★seed 42・5 世代 の骨格が変わっていない', () => {
    expect(digestOf(42, 5)).toBe(GOLDEN);
  });
});
