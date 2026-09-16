/**
 * ★**馬の購入の移行**（★ゲーム本体 第 3 便の続き・2026-09-16・移行 `0025`・正典 **D-102**）
 *
 * 【★見ている壊れ方】
 *   ① ★**利用者が価格を申告できる**形になる（★憲法 3・サーバー権威が破れる）
 *   ② ★**PP で買える**経路ができる（★S-5・L-4 の近縁・D-102 ①）
 *   ③ ★他人の持ち馬・引退馬を買える（★D-102 ②）
 *   ④ ★**所有上限（現役 30 頭）を超えて買える**（★D-104・§6.7）
 *   ⑤ ★出品に**素質の数値**が入る（★§5.5・D-102 ⑥）
 *   ⑥ ★★の算出や価格の式が **SQL にも書かれる**（★二重帳簿・D-052）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = '0025_horse_market.sql';
const sql = readFileSync(path.join(DIR, MIGRATION), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない） */
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const body = blank(sql);

describe('★馬の購入の移行（0025・D-102）', () => {
  it('① ★価格は出品の行から取る（★利用者が申告する引数が無い）', () => {
    /** ★RPC の引数は「馬」と「冪等キー」の 2 つだけ。★価格・★を受け取らない */
    expect(body).toMatch(/create or replace function public\.buy_horse\(p_horse_id uuid, p_client_token uuid\)/i);
    expect(body).not.toMatch(/buy_horse\([^)]*price/i);
    /** ★払う額は出品の行の値 */
    expect(body).toMatch(/v_listing\.price_ep/);
    /** ★出品は active のものだけを見る */
    expect(body).toMatch(/from horse_market_listing[\s\S]{0,80}active/i);
  });

  it('② ★EP だけで払う（★PP・賞金に触れない）', () => {
    expect(body).toMatch(/'horse_purchase'/);
    expect(body).toMatch(/insert into ep_ledger/i);
    expect(body).not.toMatch(/pp_ledger|prize_points/i);
    /** ★台帳の語を閉じた集合に足している（★PP→EP を表す語は足していない） */
    expect(body).toMatch(/reason in \('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee', 'horse_purchase'\)/);
    expect(body).not.toMatch(/from_pp|pp_to_ep/i);
  });

  it('③ ★NPC の馬だけ・引退馬は買えない（D-102 ②）', () => {
    expect(body).toMatch(/すでに持ち主がいます/);
    expect(body).toMatch(/NPC の馬ではありません/);
    expect(body).toMatch(/引退した馬は迎えられません/);
    /** ★所有の移転は 1 か所（★排他制約に合わせて npc_stable_id を null にする） */
    expect(body).toMatch(/update horses set owner_id = v_user, npc_stable_id = null/i);
  });

  it('④ ★所有上限（現役 30 頭）を超えて買えない（D-104・§6.7）', () => {
    expect(body).toMatch(/retired_at_week is null/i);
    expect(body).toMatch(/v_active\s*>=\s*30/);
    expect(body).toMatch(/所有上限（30 頭）/);
  });

  it('⑤ ★出品は★と価格だけ（★素質の数値を持たない・§5.5）', () => {
    expect(body).toMatch(/create table if not exists horse_market_listing/i);
    expect(body).toMatch(/stars numeric\(2,1\) not null/i);
    expect(body).toMatch(/price_ep int not null/i);
    /** ★素質そのものを出品に持たせない */
    expect(body).not.toMatch(/listing[\s\S]{0,200}potential/i);
    /** ★利用者は読むだけ（★書き込みを剥がす） */
    expect(body).toMatch(/revoke insert, update, delete, truncate on horse_market_listing from anon, authenticated/i);
    expect(body).toMatch(/grant select on horse_market_listing to anon, authenticated/i);
  });

  it('⑥ ★★の算出や価格の式を SQL に写していない（★二重帳簿にしない・D-052）', () => {
    /** ★★の境目（`stars.ts` の閾値）や、★×単価の式が SQL に無いこと */
    for (const leak of ['420', '470', '520', '570', '620', '670', '720', '800', '2000 *', '* 2000']) {
      expect(body, `★算出が SQL に写っている: ${leak}`).not.toContain(leak);
    }
    /** ★価格は「出品に書かれた値」を読むだけ（★計算していない） */
    expect(body).not.toMatch(/price_ep\s*:?=\s*[^;]*\*/);
  });

  it('⑦ ★D-080 の 1 行と、再定義に伴う権限の置き直しがある', () => {
    expect(body).toMatch(/assert_setup_complete\(\)/);
    expect(body).toMatch(/revoke all on function public\.buy_horse\(uuid, uuid\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.buy_horse\(uuid, uuid\) to authenticated/i);
  });

  it('⑧ ★移行の番号が連番で、1 つの移行で 1 つのことだけ（出走登録と購入を混ぜない）', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    /**
     * ⚠️ ★**以前は「`0025` が最後の移行」と主張していました**（★2026-09-16・第 5 便-3 で付け替え）。
     *    ★`0026`（手放す経路）を足した日に落ちましたが、★これは ★**この検査の主張が広すぎた**ためです
     *    — ★見たいのは「番号が連番で、購入の移行に別のことを混ぜていない」ことであって、
     *    ★「これが最後」ではありません（★後続の移行を足すたびに落ちる形は、錨として役に立ちません）。
     */
    expect(files, '★購入の移行が名簿にある').toContain(MIGRATION);
    const numbers = files.map((f) => Number(f.slice(0, 4)));
    for (const [i, n] of numbers.entries()) {
      expect(n, `★移行の番号が連番でない: ${files[i]}`).toBe(i + 1);
    }
    /** ★0025 に出走登録の RPC を混ぜていない */
    expect(body).not.toMatch(/function public\.enter_race/i);
    expect(body).not.toMatch(/function public\.place_bet/i);
  });
});
