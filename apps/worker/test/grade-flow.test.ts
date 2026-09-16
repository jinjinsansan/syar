/**
 * ★**厩舎の格の値段を書く経路**（★(a) 第 5 便-5・2026-09-16・移行 `0027`・正典 **D-103 ④**）
 *
 * ★偽の DB で `syncStableGradePrices` を**本物のまま**回します。
 *
 * 【★見ている壊れ方】
 *   ① ★**値段をここに書く**（★D-052・二重帳簿。★TS の `GRADE_UNLOCK_EP` から読むこと）
 *   ② ★**冪等でない**（★毎日 `updated_at` を動かす／同じ値を書き直す）
 *   ③ ★**段が増えたときに書き漏れる**（★`GRADE_UNLOCK_EP` の鍵をすべて書く）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADE_UNLOCK_EP } from '@star/training';
import { syncStableGradePrices } from '../src/grade-flow.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/grade-flow.ts'), 'utf8');

function fakeDb(store: Record<string, number>): pg.Client {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (!sql.includes('insert into stable_grade_price')) {
        throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
      }
      /** ★「値が違うときだけ書く」が SQL の文面にあるときだけ効かせる（R-30） */
      const onlyWhenChanged = sql.includes('where stable_grade_price.price_ep <> excluded.price_ep');
      const grades = params[0] as string[];
      const prices = params[1] as number[];
      const written: { grade: string }[] = [];
      grades.forEach((g, i) => {
        if (onlyWhenChanged && store[g] === prices[i]) return;
        store[g] = prices[i]!;
        written.push({ grade: g });
      });
      return { rows: written, rowCount: written.length };
    },
  };
  return client as unknown as pg.Client;
}

describe('★厩舎の格の値段を書く（D-103 ④）', () => {
  it('③ ★`GRADE_UNLOCK_EP` の段をすべて、その値で書く', async () => {
    const store: Record<string, number> = {};
    const r = await syncStableGradePrices(fakeDb(store));
    expect(r.written).toBe(Object.keys(GRADE_UNLOCK_EP).length);
    for (const [g, price] of Object.entries(GRADE_UNLOCK_EP)) {
      expect(store[g], `★${g} の値段`).toBe(price);
    }
    /** ★ブロンズは値段を持たない（★既定の格で、上げるものではない） */
    expect(store['bronze']).toBeUndefined();
  });

  it('② ★冪等（★値が同じなら 2 回目は書かない）', async () => {
    const store: Record<string, number> = {};
    await syncStableGradePrices(fakeDb(store));
    const again = await syncStableGradePrices(fakeDb(store));
    expect(again.written).toBe(0);
  });

  it('② ★値が変わったときだけ書き直す', async () => {
    const store: Record<string, number> = { silver: 1, gold: 2 };
    const r = await syncStableGradePrices(fakeDb(store));
    expect(r.written).toBe(Object.keys(GRADE_UNLOCK_EP).length);
    for (const [g, price] of Object.entries(GRADE_UNLOCK_EP)) expect(store[g]).toBe(price);
  });

  it('① ★値段をこの層に書いていない（★D-052・二重帳簿にしない）', () => {
    for (const price of Object.values(GRADE_UNLOCK_EP)) {
      expect(SRC, `★値段が写っている: ${price}`).not.toContain(String(price));
    }
    expect(SRC).toMatch(/GRADE_UNLOCK_EP/);
    /** ★時刻も乱数も読まない（★`updated_at` は DB の now()） */
    expect(SRC).not.toMatch(/Date\.now|Math\.random|new Date\(/);
  });
});
