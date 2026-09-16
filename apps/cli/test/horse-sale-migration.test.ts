/**
 * ★**手放す経路の移行**（★ゲーム本体 (a) 第 5 便-3・2026-09-16・移行 `0026`・正典 **D-102 ③**）
 *
 * 【★見ている壊れ方】★この RPC は ★**EP が増える経路**なので、抜けはそのまま「EP の蛇口」になります。
 *   ① ★**利用者が戻る額を申告できる**（★憲法 3・サーバー権威が破れる）
 *   ② ★**配合で生まれた馬を売って EP を作れる**（★買っていない馬から EP が湧く）
 *   ③ ★**買った額以上が戻る**（★買って売ってを繰り返すと EP が増える・D-102 ③）
 *   ④ ★**冪等でない**（★同じ鍵で二度呼ぶと二度戻る）
 *   ⑤ ★**引退した馬を手放せる**（★記録であって所有ではない・§18 LR-2）
 *   ⑥ ★**割合（`SELL_BACK_RATE`）が SQL にも書かれる**（★二重帳簿・D-052）
 *   ⑦ ★**所有と NPC 厩舎の排他が壊れる**（★`0001` の CHECK。★浮いた馬を作る）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { SELL_BACK_RATE, sellBackEP, priceOfStars } from '@star/scheduler';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = '0026_horse_sale.sql';
const sql = readFileSync(path.join(DIR, MIGRATION), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない） */
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const body = blank(sql);

describe('★手放す経路の移行（0026・D-102 ③）', () => {
  it('① ★戻る額は出品の行から取る（★利用者が申告する引数が無い）', () => {
    expect(body).toMatch(/create or replace function public\.sell_horse\(p_horse_id uuid, p_client_token uuid\)/i);
    expect(body).not.toMatch(/sell_horse\([^)]*amount|sell_horse\([^)]*ep\b/i);
    expect(body).toMatch(/select sell_back_ep into v_back from horse_market_listing/i);
  });

  it('② ★迎えた記録のある馬だけ手放せる（★配合で生まれた馬から EP が湧かない）', () => {
    expect(body).toMatch(/reason = 'horse_purchase'/);
    expect(body).toMatch(/迎えた記録のない馬は手放せません/);
    /** ★自分の馬であることも見る */
    expect(body).toMatch(/自分の馬ではありません/);
  });

  it('③ ★買った額以上は戻さない（★EP の蛇口にしない）', () => {
    /** ★実際に払った額（台帳）と突き合わせている */
    expect(body).toMatch(/if v_back >= v_paid then/i);
    expect(body).toMatch(/EP の蛇口になります/);
    /** ★列の制約でも閉じている（★RPC を書き換えても DB が拒む） */
    expect(body).toMatch(/check \(sell_back_ep is null or \(sell_back_ep >= 0 and sell_back_ep < price_ep\)\)/i);
  });

  it('④ ★冪等（★同じ鍵で二度戻さない）', () => {
    expect(body).toMatch(/'sale:' \|\| p_client_token::text/);
    expect(body).toMatch(/select delta into v_done from ep_ledger where dedupe_key = v_key/i);
  });

  it('⑤ ★引退した馬は手放せない（★§18 LR-2・記録であって所有ではない）', () => {
    expect(body).toMatch(/引退した馬は手放せません/);
    expect(body).toMatch(/retired_at_week/);
  });

  it('⑥ ★割合を SQL に写していない（★D-052・二重帳簿にしない）', () => {
    /** ★`SELL_BACK_RATE`（0.2）や、額 × 割合の式が SQL に無い */
    expect(body).not.toContain('0.2');
    expect(body).not.toMatch(/price_ep\s*\*/);
    expect(body).not.toMatch(/v_paid\s*\*/);
    /** ★参考: TS 側の値（★この検査が SQL と TS の両方を見ていることの明示） */
    expect(SELL_BACK_RATE).toBeGreaterThan(0);
    expect(sellBackEP(priceOfStars(3.0))).toBeLessThan(priceOfStars(3.0));
  });

  it('⑦ ★NPC 世界へ戻す（★所有と NPC 厩舎の排他を保つ・`0001` の CHECK）', () => {
    expect(body).toMatch(/select min\(id\) into v_stable from npc_stables/i);
    expect(body).toMatch(/update horses set owner_id = null, npc_stable_id = v_stable/i);
    /** ★厩舎が無ければ黙って浮かせない */
    expect(body).toMatch(/NPC 厩舎がありません/);
  });

  it('⑧ ★台帳の語を閉じた集合に足している（★PP に触れない）', () => {
    expect(body).toMatch(/reason in \('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee', 'horse_purchase', 'horse_sale'\)/);
    expect(body).not.toMatch(/pp_ledger|prize_points/i);
    expect(body).not.toMatch(/from_pp|pp_to_ep/i);
  });

  it('⑨ ★D-080 の 1 行と、権限の置き直しがある', () => {
    expect(body).toMatch(/assert_setup_complete\(\)/);
    expect(body).toMatch(/revoke all on function public\.sell_horse\(uuid, uuid\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.sell_horse\(uuid, uuid\) to authenticated/i);
  });

  it('⑩ ★1 つの移行で 1 つのこと（購入・出走登録を混ぜない）', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toContain(MIGRATION);
    expect(body).not.toMatch(/function public\.buy_horse/i);
    expect(body).not.toMatch(/function public\.enter_race/i);
    expect(body).not.toMatch(/function public\.place_bet/i);
  });
});
