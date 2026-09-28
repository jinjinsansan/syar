/**
 * ★**ワーカーが知らない EP の分類が来ても ★日次の記録を落とさず、★黙らない**（★2026-09-28・レビュー側）
 *
 * 【★なぜ】
 *   ★`deploy.sh` は ★移行を先に強制する（★リリースに含まれる移行が未適用なら配備を中止）。
 *   ★だから ★ワーカーは ★「DB が自分より新しい」状態で ★必ず一度は動く（★`0094` の `rebate` で実際にそうなった）。
 *   ★旧は ★知らない分類で ★その場で投げ、★その日の `point_flow_daily` が 1 行も残らなかった。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★知らない分類で ★行を書く前に落ちる（★DB が先に進むたびに 記録が消える）
 *   ② 🔴 ★知らない分類を ★黙って捨てる（★発行や焼却に紛れる・★誰も気づかない）
 *   ③ 🔴 ★未分類の額が ★ログにしか残らない（★その日は数え直されないので ★後から DB に問えない・`0095` の `ep_unclassified`）
 *
 * ⚠️ ★**生きたワーカーでは確かめていません**（★未知の理由を作るには 理由の集合を変える移行が要るため・レビュー側の判断）。
 *    ★確かめたのは ★原文の構造（`main.ts` の日次の枠）と ★偽の DB で `aggregateDay` を実際に走らせたことです。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { blockBodyAfter, isInOwnTry, stripComments } from './lib/ts-blocks.js';
import { aggregateDay } from '../../worker/src/daily-flow.js';

const ROOT = path.resolve(__dirname, '../../..');

/** ★問い合わせの文で答えを選ぶ偽の DB（★行を書いたかを覚える） */
function fakeClient(epClasses: readonly { klass: string; total: string }[]): { client: pg.Client; inserts: unknown[][] } {
  const inserts: unknown[][] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      if (/insert into point_flow_daily/.test(sql)) { inserts.push(params ?? []); return { rows: [] }; }
      /** ★利用者の区分（`account_type <> 'internal'`）にだけ 行を返す（★内部は 0 行） */
      if (/ep_reason_class\(l\.reason\)/.test(sql)) return { rows: /account_type <> 'internal'/.test(sql) ? epClasses : [] };
      if (/count\(\*\)/.test(sql)) return { rows: [{ bets: '0', ep: '1', pp: '0' }] };
      return { rows: [] };
    },
  } as unknown as pg.Client;
  return { client, inserts };
}

describe('★知らない EP の分類（★DB が先に進んだとき）', () => {
  it('🔴 ① ★行は書く・★② その後で 名前つきで失敗を言う', async () => {
    const { client, inserts } = fakeClient([
      { klass: 'issuance', total: '2000' },
      { klass: 'mystery', total: '150' },
    ]);
    await expect(aggregateDay(client, '2026-09-28', '2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z'))
      .rejects.toThrow(/知らない EP の分類を数えずに保存しました: mystery=150/);
    expect(inserts.length, '★行を書く前に落ちた').toBe(1);
    /** ★発行（ep_inflow）に ★知らない分類を混ぜていない */
    expect(inserts[0]![1]).toBe(2000);
    /** ★③ 未分類の額を ★行に残す（★`ep_unclassified`・12 番目の引数） */
    expect(JSON.parse(String(inserts[0]![11]))).toEqual({ player: { mystery: 150 } });
  });

  it('★対照: ★知っている分類だけなら 落ちない', async () => {
    const { client, inserts } = fakeClient([{ klass: 'issuance', total: '2000' }, { klass: 'rebate', total: '600' }]);
    await expect(aggregateDay(client, '2026-09-28', '2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z')).resolves.toBeUndefined();
    expect(inserts.length).toBe(1);
    expect(JSON.parse(String(inserts[0]![11])), '★未分類が無い日は {}').toEqual({});
  });
});

/**
 * 🔴 ★**その失敗が ★他の日次の段と週送りを止めない**（★2026-09-28・レビュー側「実物で確かめて」→ ★確かめたら止めていたので直した）。
 *   ★旧: `main.ts` の日次の枠は ★1 つの try で、★`aggregateDay` が投げると ★開放率・生涯の記録が その日は止まり、
 *   ★`lastAggregated` も置かれず ★毎周（約 10 分ごと）やり直して 毎周 失敗していた。
 *   → ★お金の集計を ★独自の try で囲み、★知らない分類（`UnknownEpClassError`）は「済んだ」と読む（★記録は `daily_run_log` に 1 日 1 行）。
 */
describe('★日次の枠: お金の集計の失敗で 他の段を止めない', () => {
  const MAIN = stripComments(readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8'));
  const DAILY = blockBodyAfter(MAIN, 'today !== lastAggregated');

  it('🔴 ★お金の集計は ★独自の try・★知らない分類は「済んだ」・★他の段はその外', () => {
    expect(isInOwnTry(DAILY, 'aggregateDay('), '★お金の集計が 独自の try に入っていない').toBe(true);
    expect(DAILY).toContain('if (e instanceof UnknownEpClassError) aggregated = true;');
    expect(DAILY).toContain('if (aggregated) lastAggregated = today;');
    /** ★開放率は ★お金の集計の try の外（★投げても届く） */
    const aggTry = DAILY.slice(DAILY.indexOf('let aggregated = false;'), DAILY.indexOf('if (aggregated) lastAggregated = today;'));
    /** ★番人: 切り出しが空でないこと（★空なら否定の表明が素通しで緑になる） */
    expect(aggTry.length, '★お金の集計の try が切り出せていない').toBeGreaterThan(50);
    expect(aggTry).toContain('aggregateDay(');
    expect(aggTry, '★開放率が お金の集計の try の中にある').not.toContain('recordUnlockDistribution(');
  });

  it('★記録は 1 日 1 行（★`point_flow_daily` は日付・`daily_run_log` は 日と段で 上書き）', () => {
    const flow = readFileSync(path.join(ROOT, 'apps/worker/src/daily-flow.ts'), 'utf8');
    expect(flow).toMatch(/on conflict \(date\) do update set/);
    const log = readFileSync(path.join(ROOT, 'apps/worker/src/daily-run-log.ts'), 'utf8');
    expect(log).toMatch(/on conflict \(day_index, step\) do update set/);
  });
});
