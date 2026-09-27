/**
 * 🔴 ★**性別と年齢は「牡4」の形で出す**（★2026-09-27・オーナーの画面で ★出走登録に `female4` と生の値が出ていた）
 *   ★規則は `apps/web/src/lib/format.ts` の `formatSexAge` 1 か所（★D-052）。
 *   ★出走登録（`entry-screen.ts`）と厩舎（`stable-repo.ts`）が ★同じ関数を通ることも見ます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatSexAge } from '../../web/src/lib/format';
import { toEntryHorseView } from '../../web/src/lib/entry-screen';

describe('★性別と年齢の表示', () => {
  it('★牡・牝・セ ＋ 年齢（★52 週で 1 歳）', () => {
    expect(formatSexAge('female', 100, 100 + 52 * 4)).toBe('牝4');
    expect(formatSexAge('male', 0, 52 * 3 + 51)).toBe('牡3');
    /** ★DB は male / female だけ。★知らない値を「セ」にして ★居ない騸馬を作らない */
    expect(formatSexAge('unknown', 0, 52 * 5)).toBe('unknown5');
    expect(formatSexAge('female', null, 300), '★生まれた週が無ければ性別だけ').toBe('牝');
  });

  it('🔴 ★出走登録の馬は ★生の値（female / male）を出さない', () => {
    const view = toEntryHorseView({
      id: 'h', name: 'テスト', sex: 'female', condition: 3, fatigue: 0, birthWeek: 92, wins: 0, starts: 0,
    }, 300);
    expect(view.sexAge).toBe('牝4');
    expect(view.sexAge).not.toMatch(/female|male/);
  });

  it('★出走登録と厩舎が ★同じ 1 か所を通る（★写しを持たない）', () => {
    const root = path.resolve(__dirname, '../../web/src/lib');
    for (const f of ['entry-screen.ts', 'stable-repo.ts']) {
      const src = readFileSync(path.join(root, f), 'utf8');
      expect(src, `★${f} が formatSexAge を通っていない`).toMatch(/sexAge: formatSexAge\(/);
      expect(src, `★${f} に 年の長さの写し（52）が残っている`).not.toMatch(/const WEEKS_PER_YEAR = 52/);
    }
  });
});
