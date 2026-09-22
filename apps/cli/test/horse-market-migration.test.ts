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
import { OWNERSHIP_LIMITS } from '@star/scheduler';
import { lastFunctionBody } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = '0025_horse_market.sql';
const sql = readFileSync(path.join(DIR, MIGRATION), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない） */
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const body = blank(sql);
/**
 * ★**購入の RPC の本文は「最後の定義」から読む**（★2026-09-22・`0070` で定義し直した・裁定 I-1 段 3 §4）。
 *   ★`body`（★`0025` の本文）は ★**0025 で起きたこと**（★表・台帳の語・権限）を見るときだけ使う。
 *   ★RPC の振る舞いは ★`fn` で見る（★名指しの検査が古い定義を見て盲になるのを防ぐ・`pinned-migration-tests.test.ts` ③）。
 */
const fn = lastFunctionBody('buy_horse').body;

describe('★馬の購入の移行（0025・D-102）', () => {
  it('① ★価格は出品の行から取る（★利用者が申告する引数が無い）', () => {
    /** ★RPC の引数は「馬」と「冪等キー」の 2 つだけ。★価格・★を受け取らない */
    expect(fn).toMatch(/create or replace function public\.buy_horse\(p_horse_id uuid, p_client_token uuid\)/i);
    expect(fn).not.toMatch(/buy_horse\([^)]*price/i);
    /** ★払う額は出品の行の値 */
    expect(fn).toMatch(/v_listing\.price_ep/);
    /** ★出品は active のものだけを見る */
    expect(fn).toMatch(/from horse_market_listing[\s\S]{0,80}active/i);
  });

  it('② ★EP だけで払う（★PP・賞金に触れない）', () => {
    expect(fn).toMatch(/'horse_purchase'/);
    expect(fn).toMatch(/insert into ep_ledger/i);
    expect(fn).not.toMatch(/pp_ledger|prize_points/i);
    /** ★台帳の語を閉じた集合に足している（★PP→EP を表す語は足していない） */
    expect(body).toMatch(/reason in \('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee', 'horse_purchase'\)/);
    expect(body).not.toMatch(/from_pp|pp_to_ep/i);
  });

  it('③ ★NPC の馬だけ・引退馬は買えない（D-102 ②）', () => {
    expect(fn).toMatch(/すでに持ち主がいます/);
    expect(fn).toMatch(/NPC の馬ではありません/);
    expect(fn).toMatch(/引退した馬は迎えられません/);
    /** ★所有の移転は 1 か所（★排他制約に合わせて npc_stable_id を null にする） */
    expect(fn).toMatch(/update horses set owner_id = v_user, npc_stable_id = null/i);
  });

  it('④ ★所有上限（現役 30 頭）を超えて買えない（D-104・§6.7）', () => {
    expect(fn).toMatch(/retired_at_week is null/i);
    /** ★数は TS の定数と突き合わせる（★字面の 30 を固定しない・照会 E-2・`ownership-limits-sql.test.ts`） */
    expect(fn).toMatch(new RegExp(`v_active\\s*>=\\s*${OWNERSHIP_LIMITS.active}\\b`));
    expect(fn).toMatch(new RegExp(`所有上限（${OWNERSHIP_LIMITS.active} 頭）`));
  });

  it('⑤ ★出品は★と価格だけ（★素質の数値を持たない・§5.5）', () => {
    expect(body).toMatch(/create table if not exists horse_market_listing/i);
    expect(body).toMatch(/stars numeric\(2,1\) not null/i);
    expect(body).toMatch(/price_ep int not null/i);
    /** ★素質そのものを出品に持たせない */
    expect(body).not.toMatch(/listing[\s\S]{0,200}potential/i);
    /** ★利用者は読むだけ（★書き込みを剥がす） */
    expect(body).toMatch(/revoke insert, update, delete, truncate on horse_market_listing from anon, authenticated/i);
    /**
     * 🔴 ★**2026-09-18 に反転**（裁定 `REVIEW_ANON_EXPOSURE_VERDICT_20260918.md` AE-3）。
     * ★以前は `grant select on horse_market_listing to anon, authenticated` を**要求**していました。
     * ★`0018:52` の宣言（実体テーブルには一切 grant しない）と V-20 ②（公開ビュー以外は anon から 0 行）に反します。
     * ★**この検査は `0024` の検査を手本にして書かれ、誤りごと写っていました**（裁定 §3）。
     * ★★と価格は「公開してよい中身」ですが、★**中身ではなく形の問題**です（公開が要るなら `*_public` ビュー・正典 410 行）。
     */
    expect(blank(readFileSync(path.join(DIR, '0032_close_anon_table_grants.sql'), 'utf8'))).toMatch(
      /revoke\s+all\s+on\s+horse_market_listing\s+from\s+anon,\s*authenticated/i,
    );
  });

  it('⑥ ★★の算出や価格の式を SQL に写していない（★二重帳簿にしない・D-052）', () => {
    /** ★★の境目（`stars.ts` の閾値）や、★×単価の式が SQL に無いこと */
    for (const leak of ['420', '470', '520', '570', '620', '670', '720', '800', '2000 *', '* 2000']) {
      expect(body, `★算出が SQL に写っている: ${leak}`).not.toContain(leak);
      expect(fn, `★算出が SQL に写っている（★最後の定義）: ${leak}`).not.toContain(leak);
    }
    /** ★価格は「出品に書かれた値」を読むだけ（★計算していない） */
    expect(fn).not.toMatch(/price_ep\s*:?=\s*[^;]*\*/);
  });

  it('⑦ ★D-080 の 1 行と、再定義に伴う権限の置き直しがある', () => {
    expect(fn).toMatch(/assert_setup_complete\(\)/);
    expect(fn).toMatch(/revoke all on function public\.buy_horse\(uuid, uuid\) from public, anon/i);
    expect(fn).toMatch(/grant execute on function public\.buy_horse\(uuid, uuid\) to authenticated/i);
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
