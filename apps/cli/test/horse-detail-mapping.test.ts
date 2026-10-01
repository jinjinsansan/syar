/**
 * ★**1 頭の詳細の写し方**（★2026-10-01・R-26 D26-3 ②・`supabaseStableRepo.horse(id)` を本物に繋いだ）
 *
 * ★釘付けするもの:
 *   ① ★格の段は ★`@star/scheduler` から（★0 勝 ＝「新馬・未勝利」・★オープンは「次の格」なし）
 *   ② ★1 走の賞金は ★`null`（★0 にすると「賞金なし」に見える・PR-1）
 *   ③ ★血統は ★読めた名前だけ（★父母とも読めなければ空・★祖父母が無ければ 1 代だけ・★3 代より先は返さない）
 *   ④ ★能力・上限・適性・近交係数を ★読まない（★D-114・R-26 🔴）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  UNKNOWN_NAME, pedigreeRowsOf, placeCountsOf, promotionOf, raceRowOf, type MyRunRow,
} from '../../web/src/lib/stable-repo';

const ROOT = path.resolve(__dirname, '../../..');

const run = (over: Partial<MyRunRow>): MyRunRow => ({
  race_id: 'r', horse_id: 'h', game_week: 12, scheduled_at: '2026-10-01T00:00:00Z', race_name: '若葉特別',
  grade: null, class_rank: 2, surface: 'turf', distance: 1800, track_condition: 'good',
  finish_pos: 1, finish_time: 108.4, ...over,
});

describe('★1 頭の詳細の写し方', () => {
  it('① ★次の格は 勝利数から（★オープンは無し）', () => {
    expect(promotionOf(0)).toEqual({ nextClassLabel: '1勝クラス', promotionHint: 'あと 1 勝' });
    expect(promotionOf(3)).toEqual({ nextClassLabel: 'オープン', promotionHint: 'あと 1 勝' });
    expect(promotionOf(4)).toEqual({ nextClassLabel: null, promotionHint: null });
    expect(promotionOf(9)).toEqual({ nextClassLabel: null, promotionHint: null });
  });

  it('② ★戦績の行: 賞金は null・週が無ければ null・格は grade が無ければ段の名前', () => {
    const r = raceRowOf(run({}));
    expect(r).toEqual({ week: 12, race: '若葉特別', grade: '1勝クラス', cond: '芝1,800m 良', place: 1, time: '1:48.4', prizePP: null });
    expect(raceRowOf(run({ game_week: null, finish_time: null })).week).toBeNull();
    expect(raceRowOf(run({ finish_time: null })).time).toBe(UNKNOWN_NAME);
    expect(raceRowOf(run({ grade: 'G2' })).grade).toBe('G2');
  });

  it('★2 着・3 着を数える', () => {
    expect(placeCountsOf([run({ finish_pos: 2 }), run({ finish_pos: 3 }), run({ finish_pos: 2 }), run({ finish_pos: 1 })]))
      .toEqual({ seconds: 2, thirds: 1 });
  });

  it('③ ★血統は 読めた名前だけ', () => {
    expect(pedigreeRowsOf(null, null)).toEqual([]);
    expect(pedigreeRowsOf({ name: null, sireName: 'A', damName: 'B' }, null)).toEqual([]);
    expect(pedigreeRowsOf({ name: '父', sireName: null, damName: null }, null)).toEqual([['父', UNKNOWN_NAME]]);
    expect(pedigreeRowsOf(
      { name: '父', sireName: '父の父', damName: null },
      { name: '母', sireName: null, damName: '母の母' },
    )).toEqual([['父', '母'], ['父の父', UNKNOWN_NAME, UNKNOWN_NAME, '母の母']]);
  });

  it('④ ★能力・上限・適性・近交係数の列を 読まない（★D-114）', () => {
    const src = readFileSync(path.join(ROOT, 'apps/web/src/lib/stable-repo.ts'), 'utf8');
    const selects = [...src.matchAll(/select\(([^)]*)\)/g)].map((m) => m[1]!).join(' ');
    const consts = [...src.matchAll(/const \w+_COLUMNS =([\s\S]*?);/g)].map((m) => m[1]!).join(' ');
    // ★走査が空振りしていない（★0 件 通過を合格にしない）
    expect(selects).toContain('sire_id');
    expect(consts).toContain('stable_grade');
    for (const col of ['potential', 'stats', 'aptitude', 'inbreed_coeff', 'genotype', 'pedigree_cache']) {
      expect(`${selects} ${consts}`, `★${col} を読んでいます`).not.toContain(col);
    }
  });
});
