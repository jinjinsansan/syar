/**
 * ★**持ち主のいる馬は、引退したら功労馬が既定**（★裁定 `REVIEW_I1_RETIREMENT_ROLE_VERDICT_20260922.md` §3 Q-1・I-1 段 2）。
 *
 * 【★見ている壊れ方】
 *   ① ★持ち主のいる馬が ★自動で繁殖入りする（★上限を数えないまま・照会 I-1 の F-1〜F-3）
 *   ② ★NPC の馬まで功労馬になる（★NPC の繁殖の供給が止まる・§10.5）
 *   ③ ★関数を作っただけで ★ワーカーが渡していない（★LR-9 の形）
 *
 * ★①② は ★本物の週送り（`advanceWeek`）で ★牡牝 × 持ち主の有無の 4 通りを引退させて見ます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ABILITY_KEYS, deriveRng, type AbilityKey } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import { advanceWeek, initialState } from '@star/training';
import { prefersHonored } from '../../worker/src/training-runner.js';
import { stripComments } from './lib/ts-blocks.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

/** ★引退の 1 週前から 1 週 進めて、★決まった役割を返す */
function retireAs(sex: 'male' | 'female', ownerId: string | null): string | undefined {
  const at = LIFECYCLE_WEEKS.retireAt - 1;
  const out = advanceWeek({
    state: {
      ...initialState({ potential: rec(700), current: rec(300), durability: 650, temper: 50 }),
      ageWeeks: at,
    },
    traits: { sex, growth: 'normal', injuryRateMult: 1, birthTemper: 50 },
    menu: 'light',
    enableEvents: false,
    rngFor: (stream) => deriveRng(905, stream, at),
    preferHonored: prefersHonored(ownerId),
  });
  return out.state.retirement?.role;
}

const OWNER = '0f000000-0000-4000-8000-00000000e602';

describe('🔴 ★持ち主のいる馬は、引退したら功労馬が既定（★I-1 段 2）', () => {
  it('★牡 × 持ち主あり → 功労馬', () => expect(retireAs('male', OWNER)).toBe('honored'));
  it('★牝 × 持ち主あり → 功労馬', () => expect(retireAs('female', OWNER)).toBe('honored'));
  it('★対照: 牡 × NPC → 種牡馬（★NPC の供給は変えない）', () => expect(retireAs('male', null)).toBe('stallion'));
  it('★対照: 牝 × NPC → 繁殖牝馬', () => expect(retireAs('female', null)).toBe('broodmare'));

  it('★行に列が無い（undefined）ときは ★NPC と同じ扱い（★持ち主を発明しない）', () => {
    expect(prefersHonored(undefined)).toBe(false);
  });

  it('③ ★ワーカーが週送りに渡している（★作っただけで終わらせない）', () => {
    const runner = stripComments(readFileSync(
      path.resolve(__dirname, '../../worker/src/training-runner.ts'), 'utf8',
    ));
    const call = runner.slice(runner.indexOf('advanceWeek({'));
    expect(call.length, '★週送りの呼び出しが見つからない').toBeGreaterThan(50);
    expect(call.slice(0, call.indexOf('});')), '★preferHonored を渡していない')
      .toContain('preferHonored: prefersHonored(row.owner_id)');
  });
});
