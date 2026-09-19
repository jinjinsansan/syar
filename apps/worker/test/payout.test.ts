/**
 * §9 馬券の精算。★PP の発行に直結するので、間違った払戻をしないことを測る。
 *
 * DB を使わず、`settle`（純関数）に渡る値の変換だけを確かめます。
 * SQL 側は tools/verify-economy.mjs が実 DB で確かめています。
 *
 * ★2026-09-14: `payout.ts` の経路（DB の文字列 → tenths → 払戻額 → 書き込む値）を
 *   偽の DB で通す検査を足しました（監査 H-1・指示書 AF-1 §2-2-5）。
 *   純関数だけを固定しても、`payout.ts` が別の変換を通していれば防御になりません（R-1）。
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ep, hitMultiplicity, settle, type RaceOutcome } from '@star/betting';
import { settlePayouts } from '../src/payout.js';

/** payout.ts が組む outcome と同じ形（着順 → 馬番の配列） */
const outcomeOf = (finished: { gate: number; finishPosition: number }[]): RaceOutcome => ({
  order: [...finished].sort((a, b) => a.finishPosition - b.finishPosition).map((f) => f.gate),
  fieldSize: finished.length,
});

describe('★§9 精算に渡す着順の組み立て', () => {
  it('★finish_pos の順に並べ替える（DB の取得順に依存しない）', () => {
    // DB から順不同で返っても、着順どおりに並ばなければ的中判定が壊れる
    const shuffled = [
      { gate: 7, finishPosition: 3 },
      { gate: 2, finishPosition: 1 },
      { gate: 5, finishPosition: 2 },
    ];
    expect(outcomeOf(shuffled).order).toEqual([2, 5, 7]);
  });

  it('★並べ替えを忘れると的中判定が変わる（この検査の存在意義）', () => {
    const finished = [
      { gate: 7, finishPosition: 3 },
      { gate: 2, finishPosition: 1 },
      { gate: 5, finishPosition: 2 },
    ];
    const correct = outcomeOf(finished);
    const wrong: RaceOutcome = { order: finished.map((f) => f.gate), fieldSize: 3 };
    expect(hitMultiplicity({ kind: 'win', horses: [2] }, correct)).toBe(1);
    expect(hitMultiplicity({ kind: 'win', horses: [2] }, wrong)).toBe(0);
  });

  it('fieldSize が複勝圏に効く（§9.1: 7頭以下は2着まで）', () => {
    const seven = outcomeOf(Array.from({ length: 7 }, (_, i) => ({ gate: i + 1, finishPosition: i + 1 })));
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, seven)).toBe(0);
    const eight = outcomeOf(Array.from({ length: 8 }, (_, i) => ({ gate: i + 1, finishPosition: i + 1 })));
    expect(hitMultiplicity({ kind: 'place', horses: [3] }, eight)).toBe(1);
  });
});

describe('★§9 払戻額', () => {
  const o = outcomeOf([
    { gate: 3, finishPosition: 1 },
    { gate: 1, finishPosition: 2 },
    { gate: 9, finishPosition: 3 },
  ]);

  it('的中は購入時オッズで払う', () => {
    const s = settle({ selection: { kind: 'win', horses: [3] }, stake: ep(1000), oddsAtPurchase: 4.2 }, o);
    expect(s.hit).toBe(true);
    expect(s.payout).toBe(4200);
  });

  it('★外れは 0 で、返還も発生しない（取消とは別）', () => {
    const s = settle({ selection: { kind: 'win', horses: [1] }, stake: ep(1000), oddsAtPurchase: 4.2 }, o);
    expect(s.payout).toBe(0);
    expect(s.refund).toBe(0);
    expect(s.refunded).toBe(false);
  });

  it('★払戻は購入額×オッズと一致する（丸めで PP を過大にも過少にも発行しない）', () => {
    // ★オッズは 0.1 単位（D-094 候補）。以前ここで使っていた 3.33・7.77・99.99 は
    //   numeric(9,1) の列からは出てこない値で、しかも上側（≦）しか見ていなかった（裁定 §3-2）
    for (const tenths of [11, 23, 33, 77, 999]) {
      const s = settle({ selection: { kind: 'win', horses: [3] }, stake: ep(700), oddsAtPurchase: tenths / 10 }, o);
      expect(s.payout).toBe(70 * tenths);
    }
  });
});

interface BetRow {
  id: string;
  user_id: string;
  bet_type: string;
  selection: number[];
  amount: number;
  odds_at_purchase: string;
}

/**
 * ★`payout.ts` の経路を通す偽の DB。馬券の select には行を返し、書き込みは記録するだけ
 *
 * 【🔴 ★**FK-3**（2026-09-19）: ★この偽物には ★**「知らない SQL」の番人がありませんでした**】
 *   ★旧: ★**どんな SQL でも** `writes` に積んで `{ rows: [], rowCount: 1 }` を返す。
 *   → ★`payout.ts` が ★**読みを 1 つ足した**ら、★偽物は**黙って 0 行**を返し、
 *     ★製品は「該当なし」として進み、★**検査は緑のまま**になります。
 *   → ★★同じ形で `cancelRace`（`status = 'scheduled'` だけ）と
 *     ★`registeredHorses`（取消を返す）を**今日 2 件**見落としました。
 *
 * 【★直した形】
 *   ★① ★**知っている文だけを受ける。知らない文は投げる**（★足したら、ここに 1 行足す）
 *   ★② ★**`rowCount` を嘘にしない**（★旧は何でも 1 を返していた）
 *   ★③ ★**読みと書きを分ける**（★読みを書きとして記録すると、`writes` の検査が緩む）
 */
function fakeDb(bets: readonly BetRow[]): {
  client: pg.Client;
  writes: { sql: string; params: readonly unknown[] }[];
} {
  const writes: { sql: string; params: readonly unknown[] }[] = [];
  /**
   * ★**製品が出す文の一覧**（`apps/worker/src/payout.ts`）。
   * ⚠️ ★ここに無い文が来たら投げます。★製品が文を足したら、★**必ずここにも足すこと**。
   */
  const KNOWN_WRITES = [
    /^\s*update bets set status = 'refunded'/,
    /^\s*update users set entry_points = entry_points \+/,
    /^\s*insert into ep_ledger/,
    /^\s*update bets set status = 'won', payout =/,
    /^\s*update users set prize_points = prize_points \+/,
    /^\s*insert into pp_ledger/,
    /^\s*update bets set status = 'lost'/,
  ];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      // ★① 読み: ★pending の馬券を引く 1 本だけ
      if (/^\s*select id, user_id, bet_type/.test(sql)) return { rows: bets, rowCount: bets.length };
      // ★② 書き: ★知っている文だけ。★`rowCount` は「1 行に効いた」を素直に返す
      if (KNOWN_WRITES.some((re) => re.test(sql))) {
        writes.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      /**
       * 🔴 ★**知らない文**。★黙って空を返しません（★それが FK-3 で潰した穴）。
       *   ★製品が読みを足したなら、★**この偽物が何を返すべきかを決めてから**足すこと。
       */
      throw new Error(`偽の DB が想定していない SQL: ${sql.trim().slice(0, 80)}`);
    },
  };
  return { client: client as unknown as pg.Client, writes };
}

const FINISHED = [
  { gate: 3, finishPosition: 1 },
  { gate: 1, finishPosition: 2 },
  { gate: 9, finishPosition: 3 },
];

describe('★§9 払戻の経路（payout.ts・DB の文字列から浮動小数を経ずに払う）', () => {
  it('★"2.3" × 100 EP の的中は 230 PP を書き込む（以前は 229）', async () => {
    const { client, writes } = fakeDb([
      { id: 'b1', user_id: 'u1', bet_type: 'win', selection: [3], amount: 100, odds_at_purchase: '2.3' },
    ]);
    const r = await settlePayouts(client, 'race-1', FINISHED);
    expect(r.won).toBe(1);
    expect(r.paid).toBe(230);
    expect(writes.find((w) => w.sql.includes("status = 'won'"))?.params[0]).toBe(230);
    expect(writes.find((w) => w.sql.includes('prize_points = prize_points +'))?.params[0]).toBe(230);
  });

  it('★tenths 10〜9,999 × 購入額 100・700 のすべてで、書き込む払戻額が整数の正解と一致する', async () => {
    const bets: BetRow[] = [];
    const tenthsOf: number[] = [];
    for (const amount of [100, 700]) {
      for (let t = 10; t <= 9_999; t += 1) {
        bets.push({
          id: `b${amount}-${t}`, user_id: 'u1', bet_type: 'win', selection: [3], amount,
          odds_at_purchase: `${Math.floor(t / 10)}.${t % 10}`,
        });
        tenthsOf.push(t);
      }
    }
    const { client, writes } = fakeDb(bets);
    const r = await settlePayouts(client, 'race-1', FINISHED);
    const wonWrites = writes.filter((w) => w.sql.includes("status = 'won'"));
    expect(wonWrites).toHaveLength(bets.length);

    let wrong = 0;
    let expectedTotal = 0;
    bets.forEach((b, i) => {
      // ★正解は BigInt で出す（検査対象の変換も浮動小数も通さない）
      const want = Number((BigInt(b.amount) * BigInt(tenthsOf[i]!)) / BigInt(10));
      expectedTotal += want;
      if (wonWrites[i]!.params[0] !== want) wrong += 1;
    });
    expect(wrong).toBe(0);
    expect(r.paid).toBe(expectedTotal);
  }, 60_000);

  it('★0.1 単位に乗らない値が DB から来たら例外（客の馬券を黙って丸めない・R-3）', async () => {
    const { client, writes } = fakeDb([
      { id: 'b1', user_id: 'u1', bet_type: 'win', selection: [3], amount: 100, odds_at_purchase: '3.33' },
    ]);
    await expect(settlePayouts(client, 'race-1', FINISHED)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
