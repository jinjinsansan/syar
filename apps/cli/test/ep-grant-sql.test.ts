/**
 * ★**SQL の EP の額・分類と、TS の定数を結ぶ**（★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §5 (a)(b)）
 *
 * 【★なぜ要るか】
 *   ★RPC は ★**額を引数で受け取れません**（★利用者が発行量を決められる形になる）。★SQL に書くしかない。
 *   ★画面は「いくら貰えるか」を押す前に言うので、★TS 側にも値が要る。★2 か所に在る以上、
 *   ★**ずれたら落ちる**網を張ります（★D-052。★`ownership-limits-sql.test.ts` と同じ作法）。
 *
 * 【★条件: 最新の定義から読む】
 *   ★`create_account` は `0031` → `0037` → `0067` → `0080` と ★4 回 定義し直されています。
 *   ★古い定義から読むと ★**直したはずの所を見ていない**ことになります（★裁定 §5 (a) の「§1 の R-1 と同じ罠」）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { EP_GRANTS } from '@star/betting';
import { DAY_BOUNDARY_STALE_AFTER_HOURS } from '@star/scheduler';
import { lastFunctionBody, stripSqlComments } from './lib/sql-source.js';

const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');

/** ★本文から 1 つだけ数を抜く（★0 個・2 個以上なら投げる ＝ 何を比べたか曖昧にしない） */
function onlyNumber(body: string, re: RegExp, label: string): number {
  const all = [...body.matchAll(re)];
  if (all.length !== 1) throw new Error(`★${label}: 一致が ${all.length} 個（★1 個であること）`);
  return Number(all[0]![1]);
}

describe('★EP の額（★D-075）を SQL と TS で 1 つにする', () => {
  it('★登録時 2,000 ＝ EP_GRANTS.signup（★ep_grant_amount の最後の定義）', () => {
    const { body } = lastFunctionBody('ep_grant_amount');
    expect(onlyNumber(body, /when\s+'signup'\s+then\s+return\s+(\d+)/gi, '登録時')).toBe(EP_GRANTS.signup);
  });

  it('★デイリー 200 ＝ EP_GRANTS.daily', () => {
    const { body } = lastFunctionBody('ep_grant_amount');
    expect(onlyNumber(body, /when\s+'daily'\s+then\s+return\s+(\d+)/gi, 'デイリー')).toBe(EP_GRANTS.daily);
  });

  it('★日次上限 10,000 ＝ EP_GRANTS.daily_cap', () => {
    const { body } = lastFunctionBody('ep_grant_amount');
    expect(onlyNumber(body, /when\s+'daily_cap'\s+then\s+return\s+(\d+)/gi, '日次上限')).toBe(EP_GRANTS.daily_cap);
  });

  /**
   * 🔴 ★**数を書き戻せない網**（★裁定 §5 (a) の条件「初期 2,000 の直書き 2 か所も同じ試験に入れる」）。
   *   ★`0031:140`・`0037:178`・`0067:63` は ★直に `2000` と書いていました。
   *   ★`0080` で `ep_grant_amount('signup')` に寄せたので、★**最新の定義に裸の額が現れたら落ちます**。
   */
  it('🔴 ★create_account の最新の定義に、額が直に書かれていない', () => {
    const { file, body } = lastFunctionBody('create_account');
    expect(file, '★最後の定義が 0080 ではない（★定義し直しが漏れた）').toBe('0080_daily_ep.sql');
    expect(body, '★ep_grant_amount('
      + "'signup') を呼ぶこと（★額を直に書き戻さない）").toMatch(/ep_grant_amount\(\s*'signup'\s*\)/);
    const bare = [...body.matchAll(/v_grant\s+bigint\s*:=\s*(\d+)/g)].map((m) => m[1]);
    expect(bare, '🔴 ★額が直に書き戻されています').toEqual([]);
  });

  it('🔴 ★claim_daily_ep が額を引数で受け取らない（★利用者が発行量を決められない）', () => {
    const { body } = lastFunctionBody('claim_daily_ep');
    expect(body.slice(0, 200), '★引数を取っている').not.toMatch(/p_amount|p_ep|p_delta/);
    expect(body, '★額は ep_grant_amount から取ること').toMatch(/ep_grant_amount\(\s*'daily'\s*\)/);
  });

  /**
   * 🔴 ★**「1 日」をここで決めていない**（★**BT-6 ②⑤**・`0050_day_boundary_single_source.sql`）。
   *   ★`0050` は「SQL に `date_trunc` も `current_date` も書かない」と定めています。
   *   ★書くと ★**3 つめの「1 日」**が生まれ、★接続ごとに別の時刻で切れます。
   */
  /**
   * 🔴 ★**止まっているのを「受け取り済み」と見せない**（★裁定 §7 ①・`0081`）。
   *   ★線は SQL に 1 か所。★画面（`my_daily_ep_state`）と
   *   ★監視（`tools/check-weekly-cycle-health.mjs`）が ★**同じ関数を読む**。
   */
  it('★古いと呼ぶ線 28 時間 ＝ DAY_BOUNDARY_STALE_AFTER_HOURS', () => {
    const { body } = lastFunctionBody('day_boundary_stale_after_hours');
    expect(onlyNumber(body, /select\s+(\d+)/g, '古いと呼ぶ線')).toBe(DAY_BOUNDARY_STALE_AFTER_HOURS);
  });

  it('🔴 ★配布が止まっているとき、画面は押せないと返す', () => {
    const { file, body } = lastFunctionBody('my_daily_ep_state');
    expect(file, '★最後の定義が 0081 ではない').toBe('0081_day_boundary_staleness.sql');
    expect(body, '★world_day_stalled() を読むこと').toMatch(/world_day_stalled\(\)/);
    expect(body, '★claimable に「止まっていない」を含めること').toMatch(/not\s+v_stalled/);
    expect(body, '★止まっているかを返すこと').toMatch(/distribution_stalled\s+boolean/);
  });

  it('🔴 ★分からないときは「止まっている」に倒す（★R-27）', () => {
    const { body } = lastFunctionBody('world_day_stalled');
    expect(body, '★行が無い／空のとき true を返すこと').toMatch(/if\s+v_from\s+is\s+null\s+then\s+return\s+true/i);
  });

  it('🔴 ★監視も同じ線を読んでいる（★秒数を出すだけに戻さない）', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../tools/check-weekly-cycle-health.mjs'), 'utf8');
    expect(src, '★world_day_stalled() を読むこと').toMatch(/world_day_stalled\(\)/);
    expect(src, '★線を自分で書き直していないこと').not.toMatch(/\b28\b/);
  });

  it('🔴 ★claim_daily_ep が「1 日」を自分で決めていない（★BT-6）', () => {
    for (const name of ['claim_daily_ep', 'my_daily_ep_state'] as const) {
      const { body } = lastFunctionBody(name);
      expect(body, `★${name} が date_trunc / current_date を使っている（★BT-6 違反）`)
        .not.toMatch(/date_trunc|current_date|now\(\)::date/i);
      expect(body, `★${name} は world_state.day_started_at を読むこと`)
        .toMatch(/day_started_at\s+into/);
    }
  });
});

describe('🔴 ★EP の理由の分類表（★裁定 §5 (b)）', () => {
  /**
   * 🔴 ★**この 1 本が本命**です。
   *   ★`ep_ledger` に理由を足した日に、★分類表に足し忘れると
   *   ★**日次上限も V-11 の監視も、その理由を静かに見落とします。**
   *   → ★**制約に並ぶ語を全部、分類表が知っているか**を突き合わせます。
   */
  it('🔴 ★ep_ledger の最新の制約に在る理由を、分類表が全部 知っている', () => {
    // ★制約は `alter table ... add constraint` で置き直される。★番号順の最後を採る
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    let reasons: string[] | null = null;
    for (const f of files) {
      const sql = stripSqlComments(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
      for (const m of sql.matchAll(/ep_ledger_reason_allowed\s+check\s*\(\s*reason\s+in\s*\(([^)]*)\)/gi)) {
        reasons = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
      }
    }
    expect(reasons, '★ep_ledger の理由の制約が読めない（★切り出しが壊れている）').not.toBeNull();
    expect(reasons!.length, '★理由が少なすぎる（★読めていない）').toBeGreaterThanOrEqual(9);

    const { body } = lastFunctionBody('ep_reason_class');
    const known = [...body.matchAll(/when\s+'([a-z_]+)'\s+then\s+return/gi)].map((m) => m[1]!);
    const missing = reasons!.filter((r) => !known.includes(r));
    expect(missing,
      '🔴 ★分類表に無い理由があります。★このままだと日次上限と V-11 の監視が'
      + '★**静かに見落とします**。★ep_reason_class（0080）に足してください').toEqual([]);
  });

  it('🔴 ★horse_sale を「発行」として数える（★相手方の引き落としが無い正の delta）', () => {
    const { body } = lastFunctionBody('ep_reason_class');
    expect(body, "★horse_sale は issuance であること（★0026:126 で新しい EP が出る）")
      .toMatch(/when\s+'horse_sale'\s+then\s+return\s+'issuance'/i);
    expect(body, "★inflow は issuance であること").toMatch(/when\s+'inflow'\s+then\s+return\s+'issuance'/i);
    expect(body, "★refund を発行に数えない（★取ったものを返しているだけ）")
      .toMatch(/when\s+'refund'\s+then\s+return\s+'refund'/i);
  });

  it('🔴 ★知らない理由が来たら止まる（★黙って「発行でない」にしない）', () => {
    const { body } = lastFunctionBody('ep_reason_class');
    expect(body, '★else で raise すること').toMatch(/else\s+raise\s+exception/i);
  });

  /**
   * 🔴 ★**監視の側が、自分で理由の一覧を持っていない**こと。
   *   ★旧 `daily-flow.ts:93` は `reason === 'inflow'` と直に書いており、
   *   ★`horse_sale` を ★**「負の焼却」**として数えていました（★発行量が過小・margin が過大）。
   */
  it('🔴 ★V-11 の監視（daily-flow.ts）が分類表を読んでいる', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../apps/worker/src/daily-flow.ts'), 'utf8');
    expect(src, '★ep_reason_class を読むこと').toMatch(/ep_reason_class\(l\.reason\)/);
    expect(src, "🔴 ★理由の一覧を TS 側に持ち直している（★上限と監視がずれる）")
      .not.toMatch(/r\.reason\s*===\s*'inflow'/);
  });
});
