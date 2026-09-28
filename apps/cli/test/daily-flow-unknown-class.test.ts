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
 */
import { describe, it, expect } from 'vitest';
import type pg from 'pg';
import { aggregateDay } from '../../worker/src/daily-flow.js';

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
  });

  it('★対照: ★知っている分類だけなら 落ちない', async () => {
    const { client, inserts } = fakeClient([{ klass: 'issuance', total: '2000' }, { klass: 'rebate', total: '600' }]);
    await expect(aggregateDay(client, '2026-09-28', '2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z')).resolves.toBeUndefined();
    expect(inserts.length).toBe(1);
  });
});
