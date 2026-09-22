/**
 * ★**総獲得賞金の数え方は 1 か所**（★SQL の関数 `horse_total_prize_pp`・`0071`・裁定 `REVIEW_BREED_OWN_MARE_VERDICT_20260922.md` §3）。
 *
 * 【★なぜ要るか】
 *   ★種付料（★EP の焼却の額・`player-breeding.ts`）と ★馬の値段（★D-102・`market-flow.ts`）が、
 *   ★同じ馬について ★別々の「総獲得賞金」から出ると、★どちらか 1 つを直したとき（★取消・失格の扱いなど）に食い違う（★D-052）。
 *   ★2026-09-22 まで ★同じ形の SQL が 2 か所にあった。
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { allMigrationsBody, lastFunctionBody } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
/** ★出走の賞金を足している形（★表の別名が付いていてもいなくても） */
const SUM_PRIZE = /sum\(\s*(?:\w+\.)?prize_pp\s*\)/gi;

describe('★総獲得賞金の数え方は 1 か所', () => {
  it('★対照: ★探す形が ★実際の書き方に当たる（★別名つき・なし）', () => {
    expect('coalesce(sum(e.prize_pp), 0)'.match(SUM_PRIZE)).toHaveLength(1);
    expect('coalesce(sum(prize_pp), 0)'.match(SUM_PRIZE)).toHaveLength(1);
  });

  it('🔴 ★コード（apps・packages・tools）に ★賞金を足す SQL が無い', () => {
    const files = globSync('{apps/*/src,packages/*/src}/**/*.{ts,tsx}', { cwd: ROOT })
      .concat(globSync('tools/**/*.mjs', { cwd: ROOT }));
    // ★対照: ★走査が空ではない
    expect(files.length).toBeGreaterThan(100);
    // ★`g` 付きの正規表現を `.test` で使い回すと ★前の一致位置が残って見落とす。★ここは `g` 無しで見る
    const once = new RegExp(SUM_PRIZE.source, 'i');
    const hits = files.filter((f) => once.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(hits, '★総獲得賞金は horse_total_prize_pp を呼ぶこと').toEqual([]);
  });

  it('🔴 ★移行の中でも ★horse_total_prize_pp の 1 か所だけ', () => {
    const all = allMigrationsBody().match(SUM_PRIZE) ?? [];
    expect(all.length, '★移行に賞金を足す SQL が 2 か所以上ある').toBe(1);
    expect(lastFunctionBody('horse_total_prize_pp').body).toMatch(SUM_PRIZE);
  });
});
