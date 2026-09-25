/**
 * ★**デイリーの受け取りが、画面から実際に押せて、押す前に条件を言う**
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §1・§5 (c)
 *
 * 【🔴 ★なぜこの網が要るか — ★同じ形で 2 度やっています】
 *   ★① 出走登録: ★`supabaseEntryRepo.enter` は在るのに、★画面の「登録する」が `<span>` で
 *      ★**誰も呼んでいませんでした**（★本番で登録 0 件）。
 *   ★② 日次 EP: ★D-075 が額を決め、★画面は「準備中です」と出していたのに、
 *      ★**渡す側が 1 つも在りませんでした**。
 *   → ★**「RPC は在る」と「画面から呼べる」は別**です。★ここは後者を見ます。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

describe('★毎日のログインで EP を受け取る（★D-075）', () => {
  it('🔴 ★画面が受け取りの関数を実際に呼んでいる（★口が在るだけにしない）', () => {
    const page = read('apps/web/src/app/earn/page.tsx');
    expect(page, '★claimDailyEp を読み込むこと').toMatch(/import[\s\S]*claimDailyEp[\s\S]*from '\.\.\/\.\.\/lib\/daily-ep'/);
    expect(page, '🔴 ★押しても何も呼ばない形になっています').toMatch(/onClick=\{onClaim\}/);
    expect(page, '★onClaim が claimDailyEp を呼ぶこと').toMatch(/const onClaim[\s\S]{0,400}claimDailyEp\(\)/);
  });

  it('🔴 ★「準備中です」のままになっていない（★渡す側が出来た）', () => {
    const page = read('apps/web/src/app/earn/page.tsx');
    const ways = page.match(/const WAYS = \[([\s\S]*?)\] as const;/);
    expect(ways, '★WAYS が読めない（★切り出しが壊れている）').not.toBeNull();
    expect(ways![1], '🔴 ★毎日のログインが「準備中」の一覧に残っています')
      .not.toMatch(/毎日のログイン/);
  });

  /**
   * 🔴 ★**押す前に言う**（★裁定 §5 (c)・D-123 の作法）。
   *   ★押したあとに知らせると、★受け取り忘れた人に ★後から不利を告げる形になります。
   */
  it('🔴 ★「持ち越せない」を、ボタンより前に出している', () => {
    const page = read('apps/web/src/app/earn/page.tsx');
    const note = page.indexOf('DAILY_EP_NO_CARRYOVER_NOTE');
    const button = page.indexOf('onClick={onClaim}');
    expect(note, '🔴 ★持ち越せない旨が画面に出ていません').toBeGreaterThan(0);
    expect(button, '★受け取りのボタンが見つかりません').toBeGreaterThan(0);
    expect(note, '🔴 ★押したあとにしか出ていません（★押す前に言うこと）').toBeLessThan(button);
  });

  /**
   * 🔴 ★**止まっているのを「受け取り済み」と見せない**（★裁定 §7 ①）。
   *   ★判定の順番が大事です。★`alreadyClaimed` を先に見ると ★**また「受け取り済み」が勝ちます**
   *   （★止まっているあいだ `already_claimed` は true になりうる）。
   */
  it('🔴 ★「配布が止まっています」を「受け取り済み」より先に見ている', () => {
    const page = read('apps/web/src/app/earn/page.tsx');
    const stalled = page.indexOf('state.distributionStalled ? DAILY_EP_STALLED_NOTE');
    const claimed = page.indexOf("state.alreadyClaimed ? '今日のぶんは受け取り済み'");
    expect(stalled, '🔴 ★止まっている表示がありません').toBeGreaterThan(0);
    expect(claimed, '★受け取り済みの表示が見つかりません').toBeGreaterThan(0);
    expect(stalled, '🔴 ★「受け取り済み」が先に判定されています（★止まっているのを隠します）')
      .toBeLessThan(claimed);
  });

  it('🔴 ★画面が額を RPC に渡していない（★利用者が発行量を決められない）', () => {
    const lib = read('apps/web/src/lib/daily-ep.ts');
    expect(lib, '★claim_daily_ep を引数なしで呼ぶこと')
      .toMatch(/rpc\('claim_daily_ep'\)/);
    expect(lib, "🔴 ★額を渡しています（★サーバーが ep_grant_amount から取ること）")
      .not.toMatch(/rpc\('claim_daily_ep',/);
  });

  it('🔴 ★TS 側に額を書き直していない（★@star/betting の EP_GRANTS が正）', () => {
    const lib = read('apps/web/src/lib/daily-ep.ts');
    expect(lib, '🔴 ★額が直に書かれています').not.toMatch(/\b200\b|\b2000\b|\b10000\b/);
    const setup = read('apps/web/src/lib/setup.ts');
    expect(setup, '🔴 ★setup.ts に額が直に書き戻されています')
      .not.toMatch(/SETUP_(GRANT|DAILY)_EP\s*=\s*\d+/);
  });
});
