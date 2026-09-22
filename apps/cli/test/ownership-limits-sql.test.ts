/**
 * ★**SQL に書いた上限の数と、TS の定数を結ぶ**（★裁定 `REVIEW_I1_STEP3_ROLE_REQUEST_VERDICT_20260922.md` §1・R-1 (a)）。
 *
 * 【★なぜ要るか】
 *   ★RPC はクライアントから呼ばれるので、★上限を引数で受け取れない（★利用者が値を変えられる）。★SQL に書くしかない。
 *   ★2 か所に書く以上、★**ずれたら落ちる**網を張る（★D-052）。
 *   ★以前の試験（`horse-market-migration.test.ts` ④）は ★字面の 30 を固定していただけで、★TS を変えても緑のままだった（照会 E-2）。
 *
 * 【★条件 1: 関数の最新の定義から読む】
 *   ★関数は後の移行で定義し直される（★`request_initial_breeding` は 0061 → 0062）。
 *   ★`lastFunctionBody` は ★移行を番号順に読み、★同じ名前の最後の定義を返す（★註記は落としてある）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_BALANCE } from '@star/sim-engine';
import { OWNERSHIP_LIMITS } from '@star/scheduler';
import { lastFunctionBody, stripSqlComments } from './lib/sql-source.js';

/** ★本文から 1 つだけ数を抜く（★0 個・2 個以上なら投げる ＝ 何を比べたか曖昧にしない） */
function onlyNumber(body: string, re: RegExp, label: string): number {
  const all = [...body.matchAll(re)];
  if (all.length !== 1) throw new Error(`★${label}: 一致が ${all.length} 個（★1 個であること）`);
  return Number(all[0]![1]);
}

/** ★`buy_horse` の中で、★利用者の行のロックが ★上限を数えるより前にあるか */
function locksUserBeforeCounting(body: string): boolean {
  const lock = body.search(/from\s+users\s+where\s+id\s*=\s*v_user\s+for\s+update/i);
  const count = body.search(/select\s+count\(\*\)\s+into\s+v_active/i);
  if (lock < 0 || count < 0) throw new Error('★ロックか数え上げが見つからない（★切り出しが壊れている）');
  return lock < count;
}

describe('★SQL の上限と TS の定数（★R-1 (a)）', () => {
  it('★購入: 現役の上限 ＝ OWNERSHIP_LIMITS.active（★buy_horse の最後の定義）', () => {
    const { file, body } = lastFunctionBody('buy_horse');
    expect(file, '★最後の定義が 0070 ではない（★定義し直しが漏れた）').toBe('0070_breeding_role_requests.sql');
    expect(onlyNumber(body, /v_active\s*>=\s*(\d+)/g, 'buy_horse の上限')).toBe(OWNERSHIP_LIMITS.active);
  });

  it('★役割の変更: 種牡馬・繁殖牝馬の上限 ＝ OWNERSHIP_LIMITS（★request_breeding_role の最後の定義）', () => {
    const { body } = lastFunctionBody('request_breeding_role');
    expect(onlyNumber(body, /when\s+'stallion'\s+then\s+(\d+)/gi, '種牡馬の上限')).toBe(OWNERSHIP_LIMITS.stallion);
    expect(onlyNumber(body, /when\s+'stallion'\s+then\s+\d+\s+else\s+(\d+)/gi, '繁殖牝馬の上限')).toBe(OWNERSHIP_LIMITS.broodmare);
  });

  it('★役割の変更: 生涯の産駒数 ＝ DEFAULT_BALANCE.MARE_LIFETIME_FOALS', () => {
    const { body } = lastFunctionBody('request_breeding_role');
    expect(onlyNumber(body, /v_foals\s*>=\s*(\d+)/g, '生涯の産駒数')).toBe(DEFAULT_BALANCE.MARE_LIFETIME_FOALS);
  });

  it('🔴 ★購入: 利用者の行をロックしてから数える（★裁定 §4・最後の定義）', () => {
    expect(locksUserBeforeCounting(lastFunctionBody('buy_horse').body)).toBe(true);
  });

  it('★対照: ★0025 の定義は「数えてからロック」だった（★この検査が区別できること）', () => {
    const sql = stripSqlComments(readFileSync(
      path.resolve(__dirname, '../../../db/migrations/0025_horse_market.sql'), 'utf8',
    ));
    const body = sql.slice(sql.search(/create\s+or\s+replace\s+function\s+public\.buy_horse/i));
    expect(locksUserBeforeCounting(body)).toBe(false);
  });

  it('🔴 ★役割の変更: 利用者の行をロックしてから数える', () => {
    const { body } = lastFunctionBody('request_breeding_role');
    const lock = body.search(/from\s+users\s+u\s+where\s+u\.id\s*=\s*v_user\s+for\s+update/i);
    const count = body.search(/select\s+count\(\*\)\s+into\s+v_count/i);
    expect(lock).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(lock);
  });
});
