/**
 * ★**厩舎の格の解放の移行**（★(a) 第 5 便-5・2026-09-16・移行 `0027`・正典 **D-103 ④**）
 *
 * 【★見ている壊れ方】
 *   ① ★**利用者が値段を申告できる**（★憲法 3・サーバー権威が破れる）
 *   ② ★**PP で払える**（★D-103 ④・S-5 の近縁。★「賞金で強さを買う」形）
 *   ③ ★**飛び級できる**（★ブロンズ → ゴールドを 1 回で買うと合計額が変わる）
 *   ④ ★**素質（potential）に触る**（★§7.3・V-2b。★格が動かしてよいのは伸びと費用だけ）
 *   ⑤ ★**他人の馬・引退馬の格を上げられる**
 *   ⑥ ★**冪等でない**（★同じ鍵で二度引かれる）
 *   ⑦ ★**値段が SQL にも書かれる**（★二重帳簿・D-052）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { GRADE_UNLOCK_EP, STABLE_GRADES, nextGrade, unlockPriceEP } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const MIGRATION = '0027_stable_grade_unlock.sql';
const sql = readFileSync(path.join(DIR, MIGRATION), 'utf8');
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
const body = blank(sql);

describe('★厩舎の格の解放の移行（0027・D-103 ④）', () => {
  it('① ★値段は表の行から取る（★利用者が申告する引数が無い）', () => {
    expect(body).toMatch(/create or replace function public\.unlock_stable_grade\(p_horse_id uuid, p_client_token uuid\)/i);
    expect(body).not.toMatch(/unlock_stable_grade\([^)]*price/i);
    expect(body).toMatch(/select price_ep into v_price from stable_grade_price where grade = v_next/i);
    /** ★利用者は読むだけ */
    expect(body).toMatch(/revoke insert, update, delete, truncate on stable_grade_price from anon, authenticated/i);
    expect(body).toMatch(/grant select on stable_grade_price to anon, authenticated/i);
  });

  it('② ★EP だけで払う（★PP・賞金に触れない）', () => {
    expect(body).toMatch(/'stable_grade'/);
    expect(body).toMatch(/insert into ep_ledger/i);
    expect(body).not.toMatch(/pp_ledger|prize_points/i);
    expect(body).toMatch(/reason in \('inflow', 'training', 'entry_fee', 'bet', 'refund', 'stud_fee',\s*'horse_purchase', 'horse_sale', 'stable_grade'\)/);
  });

  it('③ ★1 回に 1 段だけ（★飛び級させない）', () => {
    expect(body).toMatch(/case v_grade when 'bronze' then 'silver' when 'silver' then 'gold' else null end/i);
    expect(body).toMatch(/これ以上は上げられません/);
    /** ★TS 側の段も同じ並び（★片方だけ増やすと食い違う） */
    expect(STABLE_GRADES).toEqual(['bronze', 'silver', 'gold']);
    expect(nextGrade('bronze')).toBe('silver');
    expect(nextGrade('silver')).toBe('gold');
    expect(nextGrade('gold')).toBeNull();
    expect(unlockPriceEP('gold')).toBeNull();
  });

  it('④ ★素質にも能力にも触らない（★動かすのは stable_grade だけ）', () => {
    expect(body).toMatch(/update horses set stable_grade = v_next/i);
    expect(body).not.toMatch(/update horses set[^;]*potential/i);
    expect(body).not.toMatch(/update horses set[^;]*stats/i);
  });

  it('⑤ ★自分の現役馬だけ', () => {
    expect(body).toMatch(/自分の馬ではありません/);
    expect(body).toMatch(/引退した馬の厩舎は上げられません/);
  });

  it('⑥ ★冪等（★同じ鍵で二度引かない）', () => {
    expect(body).toMatch(/'grade:' \|\| p_client_token::text/);
    expect(body).toMatch(/where l\.dedupe_key = v_key/i);
  });

  it('⑦ ★値段を SQL に写していない（★D-052・二重帳簿にしない）', () => {
    for (const g of Object.keys(GRADE_UNLOCK_EP) as (keyof typeof GRADE_UNLOCK_EP)[]) {
      expect(body, `★値段が SQL に写っている: ${g}`).not.toContain(String(GRADE_UNLOCK_EP[g]));
    }
    /** ★式も書かない */
    expect(body).not.toMatch(/price_ep\s*\*/);
  });

  it('⑧ ★D-080 の 1 行と権限の置き直し、★1 つの移行で 1 つのこと', () => {
    expect(body).toMatch(/assert_setup_complete\(\)/);
    expect(body).toMatch(/revoke all on function public\.unlock_stable_grade\(uuid, uuid\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.unlock_stable_grade\(uuid, uuid\) to authenticated/i);
    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toContain(MIGRATION);
    expect(body).not.toMatch(/function public\.(buy_horse|sell_horse|enter_race|place_bet)/i);
  });
});
