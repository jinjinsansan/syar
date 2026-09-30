/**
 * ★**重賞の出走条件（年齢の帯・牝馬限定）**（★2026-09-30・正典 D-129 ①）。
 *
 * 【★見ている壊れ方】
 *   ① ★「桜花杯」（牝馬限定）に牡が、★「府中2歳ステークス」に 3 歳以上が 出る（★名前が言うことを仕組みが裏付けない）
 *   ② ★齢の帯を 数で書き写す（★`LIFECYCLE_WEEKS` から導かない）
 *   ③ ★選抜（worker）と 登録（enter_race）が 別の値を使う
 * ★「述語を書いた」ことを完了と呼ばない（D-122）: ★実際に 条件つきの鞍を組んで ★条件に合わない馬が 0 頭 を数で見る。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LIFECYCLE_WEEKS, WEEKS_PER_YEAR, GRADED_RACES, entryConditionsOf, meetsEntryConditions, gradedRaceById,
} from '@star/scheduler';

const MIG = path.resolve(__dirname, '../../../db/migrations');

describe('★重賞の出走条件', () => {
  it('🔴 ② 齢の帯は LIFECYCLE_WEEKS と WEEKS_PER_YEAR から（★2 歳 ＝ [104, 156)・3 歳 ＝ [156, 208)・3 歳以上 ＝ [156, ∞)）', () => {
    const two = LIFECYCLE_WEEKS.raceableFrom;
    expect(entryConditionsOf({ age: '2', fillies: false })).toEqual({ minAgeWeeks: two, maxAgeWeeks: two + WEEKS_PER_YEAR, filliesOnly: false });
    expect(entryConditionsOf({ age: '3', fillies: true })).toEqual({ minAgeWeeks: two + WEEKS_PER_YEAR, maxAgeWeeks: two + 2 * WEEKS_PER_YEAR, filliesOnly: true });
    expect(entryConditionsOf({ age: '3+', fillies: false })).toEqual({ minAgeWeeks: two + WEEKS_PER_YEAR, maxAgeWeeks: null, filliesOnly: false });
    expect(entryConditionsOf(null), '★重賞でない鞍は 出走できる齢から').toEqual({ minAgeWeeks: two, maxAgeWeeks: null, filliesOnly: false });
  });

  it('🔴 ① 条件つきの鞍に 条件に合わない馬が 1 頭も入らない（★50 鞍 × 合成の母集団 400 頭 ＝ 延べ 20,000 頭を見て 0 頭）', () => {
    /** ★齢 90〜259 週・牡牝半々の 合成の母集団（★乱数を使わない決定論） */
    const pool = Array.from({ length: 400 }, (_, i) => ({ sex: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female', ageWeeks: 90 + (i * 37) % 170 }));
    const report: string[] = [];
    for (const r of GRADED_RACES) {
      const c = entryConditionsOf(r);
      const ok = pool.filter((h) => meetsEntryConditions(c, h));
      expect(ok.length, `★${r.id}: 出られる馬が 0 頭`).toBeGreaterThan(0);
      const minAge = Math.min(...ok.map((h) => h.ageWeeks));
      const maxAge = Math.max(...ok.map((h) => h.ageWeeks));
      const colts = ok.filter((h) => h.sex === 'male').length;
      if (r.fillies) expect(colts, `★${r.id}（牝馬限定）に牡`).toBe(0);
      expect(minAge, `★${r.id}: 下限より若い馬`).toBeGreaterThanOrEqual(c.minAgeWeeks);
      if (c.maxAgeWeeks !== null) expect(maxAge, `★${r.id}: 上限を超える馬`).toBeLessThan(c.maxAgeWeeks);
      report.push(`${r.id} 最小齢${minAge} 牡${colts}`);
    }
    /** ★名前が条件を言う鞍（★代表） */
    const oka = entryConditionsOf(gradedRaceById('g1-ousei'));
    expect(oka.filliesOnly, '★桜花杯は牝馬限定').toBe(true);
    const fuchu2 = entryConditionsOf(gradedRaceById('g2-fuchu-2yo'));
    expect(fuchu2.maxAgeWeeks, '★府中2歳ステークスは 2 歳だけ').toBe(LIFECYCLE_WEEKS.raceableFrom + WEEKS_PER_YEAR);
    expect(report.length).toBe(50);
    /** ★分母を出す（★見た頭数が 0 でも「合わない馬 0 頭」になる罠・裁定 §11 ②）: ★50 鞍 × 400 頭 ＝ 延べ 20,000 頭を見た */
    expect(GRADED_RACES.length * pool.length).toBe(20000);
  });

  it('🔴 ③ 選抜（worker）と 登録（enter_race）が 同じ値: ワーカーが行に書き・enter_race が行の値で判定する', () => {
    const main = readFileSync(path.resolve(__dirname, '../../worker/src/main.ts'), 'utf8');
    expect(main).toContain('meetsEntryConditions(entryConditionsOf(gradedRaceAt(i)), { sex: h.sex, ageWeeks: weekIndexAt(cycleStartMs(i, cfg.epochMs) + PHASE_OFFSET_MS.start, cfg.epochMs) - born })');
    const store = readFileSync(path.resolve(__dirname, '../../worker/src/pg-store.ts'), 'utf8');
    expect(store).toContain('entryConditionsOf(gradedRaceAt(spec.cycleIndex)).minAgeWeeks');
    expect(store).toContain('entryConditionsOf(gradedRaceAt(spec.cycleIndex)).filliesOnly');
    const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    const last = files.filter((f) => /create\s+or\s+replace\s+function\s+public\.enter_race\s*\(/i.test(readFileSync(path.join(MIG, f), 'utf8'))).at(-1)!;
    const body = readFileSync(path.join(MIG, last), 'utf8');
    expect(body).toContain('v_race.min_age_weeks');
    expect(body).toContain('v_race.max_age_weeks');
    expect(body).toContain("coalesce(v_race.fillies_only, false) and exists (");
    /** ★段（数）を SQL に書き写さない（★104・156・208 を直書きしない） */
    expect(body.indexOf('重賞の出走条件'), '★切り出しの始まりが見つからない').toBeGreaterThan(-1);
    const added = body.slice(body.indexOf('重賞の出走条件'), body.indexOf('このレースは牝馬限定です'));
    expect(added.length, '★切り出した断片が空').toBeGreaterThan(100);
    expect(added).not.toMatch(/\b(156|208)\b/);
  });
});
