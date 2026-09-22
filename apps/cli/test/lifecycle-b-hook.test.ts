/**
 * ★**案 B の模擬の口**（`trainableFromForSimulation`・PLAN Q-1）が ★製品に漏れていないこと・★効くこと。
 *
 * 【★見ている壊れ方】
 *   ① ★製品（ワーカー・画面・RPC の TS）が渡している → ★§7.1 が黙って変わる
 *   ② ★口が効いていない → ★模擬が「何も変わらない」を出す（★2026-09-22 に一度そうなった: エンジンの
 *      ★`canTrain` が 78 週未満を止めていたので、★開始週を早めても 4 通りとも一字一句同じだった）
 *   ③ ★渡さないときに振る舞いが変わる
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ABILITY_KEYS, deriveRng, type AbilityKey } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import { advanceWeek, initialState } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

const stepAt = (week: number, override?: number) => advanceWeek({
  state: { ...initialState({ potential: rec(700), current: rec(300), durability: 650, temper: 50 }), ageWeeks: week },
  traits: { sex: 'male', growth: 'normal', injuryRateMult: 1, birthTemper: 50 },
  menu: 'hard',
  enableEvents: false,
  rngFor: (stream) => deriveRng(7, stream, week),
  ...(override === undefined ? {} : { trainableFromForSimulation: override }),
});

describe('★案 B の模擬の口（trainableFromForSimulation）', () => {
  it('① 🔴 ★製品のソースは渡していない（★apps/worker・apps/web・packages）', () => {
    // ★Windows の glob は逆スラッシュを返すので、★比べる前に / へ揃える
    const files = globSync('{apps/worker/src,apps/web/src,packages}/**/*.{ts,tsx}', { cwd: ROOT })
      .map((f) => f.split(path.sep).join('/'))
      .filter((f) => !f.includes('/test/') && !f.endsWith('packages/training/src/week.ts'));
    // ★対照: ★走査が空ではない
    expect(files.length).toBeGreaterThan(50);
    const leaks = files.filter((f) => readFileSync(path.join(ROOT, f), 'utf8').includes('trainableFromForSimulation'));
    expect(leaks).toEqual([]);
  });

  it('② ★渡せば、★78 週より前でも調教する（★EP を使い、伸びる）', () => {
    const r = stepAt(10, 0);
    expect(r.log.menu).toBe('hard');
    expect(r.log.epSpent).toBeGreaterThan(0);
  });

  it('③ ★対照: ★渡さなければ、★78 週より前は休養（★§7.1 のまま）', () => {
    const r = stepAt(10);
    expect(r.log.menu).toBe('rest');
    expect(r.log.epSpent).toBe(0);
    // ★78 週ちょうどからは調教する（★境界の両側）
    expect(stepAt(LIFECYCLE_WEEKS.trainableFrom).log.menu).toBe('hard');
  });
});
