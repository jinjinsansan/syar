/**
 * 🔴 ★**書く鍵と読む鍵が、★同じであること**（★2026-09-21・`TRAINING-INSTRUCTION-NOT-READ`）。
 *
 * 【★なぜ要るか — ★1 度 発火しない形を作りました】
 *   ✔ ★`0057` / `0058` の RPC … `if p_week <= v_processed then raise`
 *   ✔ ★`training-runner.ts` … `weeks = rows.map((x) => x.last_processed_week)` で注文を引く
 *   → ★★**ワーカーが読む唯一の鍵を、★RPC がちょうど拒む**形でした。
 *     ★★書いても読まれず、★読もうとしても書けない。★**機構が原理的に発火しません。**
 *   ⚠️ ★型検査でも偽の DB でも出ません（★両側とも「正しく」動くので）。
 *     ★★**2 つを並べて読んだときだけ**出ます。→ ★だから検査にします。
 *
 * ⚠️ ★この検査は ★**原文を読みます**（★DB に繋ぎません）。
 *    ★SQL と TypeScript にまたがる約束は、★型では守れません。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

/** ★いちばん新しい `set_training_order` の定義（★後の移行が前を上書きします） */
function latestRpc(): string {
  const files = [
    'db/migrations/0057_training_orders.sql',
    'db/migrations/0058_training_order_setup_guard.sql',
    'db/migrations/0059_training_order_week_key.sql',
  ];
  let last = '';
  for (const f of files) {
    const src = read(f);
    const i = src.indexOf('create or replace function public.set_training_order');
    if (i >= 0) last = src.slice(i);
  }
  // 🔴 ★切り出せたことを確かめる（★CK-3）
  expect(last.length, '★RPC の定義が見つからない').toBeGreaterThan(200);
  return last;
}

describe('🔴 ★調教の指示: 書く鍵と読む鍵', () => {
  it('★ワーカーは `last_processed_week` の注文を読む', () => {
    const runner = read('apps/worker/src/training-runner.ts');
    expect(runner, '★注文を読んでいない').toContain('from training_orders');
    expect(runner, '★読む鍵が last_processed_week ではない')
      .toMatch(/weeks\s*=\s*r\.rows\.map\(\(x\) => Number\(x\.last_processed_week\)\)/);
  });

  it('🔴 ★RPC は、★その週（＝これから処理する週）を拒まない', () => {
    const rpc = latestRpc();
    /**
     * ★`p_week < v_processed` … ✅ ★過ぎた週だけ拒む（★正しい）
     * ★`p_week <= v_processed` … 🔴 ★これから処理する週まで拒む（★発火しない）
     */
    expect(rpc, '🔴 ★これから処理する週を拒んでいます（★機構が発火しません）')
      .not.toMatch(/p_week\s*<=\s*v_processed/);
    expect(rpc, '★過ぎた週を通しています').toMatch(/p_week\s*<\s*v_processed/);
  });

  it('★画面も、★その馬の `last_processed_week` を書く（★世界の週ではない）', () => {
    const page = read('apps/web/src/app/training/page.tsx');
    expect(page, '★世界の週を書いている').not.toContain('currentWeekForOrder');
    expect(page, '★馬の週を読んでいない').toMatch(/select\('last_processed_week'\)/);
  });

  it('★献立の名前は、★DB 側でも閉じている（★任意の文字列を書かせない）', () => {
    const create = read('db/migrations/0057_training_orders.sql');
    expect(create, '★check で閉じていない').toMatch(/menu in \('hill'/);
  });
});
