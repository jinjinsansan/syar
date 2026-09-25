/**
 * 🔴 ★**市場の出品の公開 view が、出してよい列だけを出す**
 *   ★移行 `0085_horse_market_listing_facts.sql`・★正典 **D-102 ③**・**D-114**
 *
 * 【★なぜ要るか】
 *   ★`buy_horse`（`0070`）は ★動きます（✔ staging 20 件・`tools/verify-buy-horse.mjs`）。
 *   🔴 ★しかし ★`horse_market_listing_public`（`0043`）は ★**3 列だけ**で ★**名前が在りませんでした**。
 *   ★`horses` は `anon` に閉じているので、★**名前の無い馬を「買いますか」と出す**ことになります。
 *   → ★`0085` で ★名前と戦績を足しました。★根拠は ★D-102 ③（走った実績のある馬だけ買える）と
 *     ★D-114（手がかりはオッズと戦績だけ）。★**私が決めた線ではありません**。
 *
 * 【★この網が見るもの】
 *   ★① ★素質・能力・発見度を出していない（★**D-114**）
 *   ★② ★名前が出ている（★これが無いと買えません）
 *   ★③ ★戦績の式が ★他の 2 か所と ★**同じ**（★D-052）
 *   ★④ ★`active` の出品だけ（★売れた馬を売り続けない）
 *   ★⑤ ★`anon` に開いている（★`0043` と同じ扱いを保つ）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lastFunctionBody, lastViewBody, stripSqlComments } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(ROOT, 'db/migrations/0085_horse_market_listing_facts.sql');

function viewBody(): string {
  const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
  const m = sql.match(/create or replace view horse_market_listing_public as([\s\S]*?);/i);
  if (m === null) throw new Error('★view の定義が読めません（★切り出しが壊れている）');
  return m[1]!;
}

describe('🔴 ★市場の出品の公開 view（★D-102・D-114）', () => {
  it('★切り出せている（★空振りしていない）', () => {
    expect(viewBody().length, '★view の本体が短すぎる').toBeGreaterThan(150);
  });

  it('🔴 ★素質・能力・発見度を出していない（★D-114）', () => {
    const body = viewBody();
    for (const bad of ['potential', 'speed', 'stamina', 'guts', 'wisdom', 'genotype', 'discovery', 'stars']) {
      expect(body, `🔴 ★見せない値が出ています: ${bad}`).not.toContain(bad);
    }
    // ★出品は NPC の馬だけなので、★持ち主の列は要りません
    for (const bad of ['owner_id', 'display_name', 'stable_name']) {
      expect(body, `🔴 ★持ち主の情報が出ています: ${bad}`).not.toContain(bad);
    }
  });

  it('★名前が出ている（★これが無いと「名前の無い馬」を売ることになる）', () => {
    expect(viewBody(), '★`h.name as horse_name` が要ります').toMatch(/h\.name\s+as\s+horse_name/);
  });

  /**
   * 🔴 ★**戦績は関数 1 つを呼ぶ**（★`0086`・D-052）。
   *
   * ⚠️ ★ここは最初 ★**3 か所の字面を突き合わせる**網でした。
   *    ★レビュー側の判断: ★**「突き合わせの網より 1 つにするほうが強い」**。
   *    → ★`horse_starts()` / `horse_wins()` に寄せ、★網も ★**呼んでいるか**を見る形にしました。
   *    ★「関数の外で数えていないか」は ★`horse-record-one-place.test.ts` が見ます。
   */
  it('🔴 ★戦績は horse_starts / horse_wins を呼んでいる（★0086）', () => {
    const { file, body } = lastViewBody('horse_market_listing_public');
    expect(file, '★最後の定義が 0086 ではない（★寄せ替えが漏れた）').toBe('0086_horse_record_one_place.sql');
    expect(body, '★勝数は horse_wins を呼ぶこと').toMatch(/horse_wins\(h\.id\)/);
    expect(body, '★出走数は horse_starts を呼ぶこと').toMatch(/horse_starts\(h\.id\)/);
    expect(body, '🔴 ★自分で数えています（★関数に寄せること）')
      .not.toMatch(/count\(\*\)[\s\S]{0,80}race_entries/i);
  });

  it('🔴 ★active の出品だけ（★売れた馬を売り続けない）', () => {
    expect(viewBody(), '★`where l.active` が要ります').toMatch(/where\s+l\.active/);
  });

  it('★anon に開いている（★0043 と同じ扱いを保つ）', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));
    expect(sql, '★anon への grant がありません')
      .toMatch(/grant select on horse_market_listing_public to anon, authenticated/i);
  });

  /**
   * 🔴 ★**価格は出品の行から取る**（★憲法 3。★利用者の申告を使わない）。
   *   ★`buy_horse` が ★引数で価格を受け取っていないことを見ます。
   */
  it('🔴 ★buy_horse が価格を引数で受け取っていない（★憲法 3）', () => {
    const { body } = lastFunctionBody('buy_horse');
    expect(body.slice(0, 200), '🔴 ★価格を引数で受け取っています').not.toMatch(/p_price|p_amount|p_ep/);
    expect(body, '★価格は出品の行から取ること').toMatch(/v_listing\.price_ep/);
  });
});
