/**
 * ★**出品を作る経路**（★ゲーム本体 (a) 第 5 便-2・2026-09-16・正典 **D-102**・移行 `0025`）
 *
 * ★偽の DB で `refreshMarketListings` を**本物のまま**回します（★計画の純関数 `planListings` も本物）。
 *
 * 【★見ている壊れ方】
 *   ① ★**★や価格を SQL 側で決める**（★D-052・二重帳簿。★画面と DB で★が食い違う）
 *   ② ★**買われた馬・引退した馬の出品が残る**（★買えない馬が並ぶ）
 *   ③ ★**★が変わった馬の出品が残る**（★故障で素質が下がると★も下がる。★見た目と価格がずれる）
 *   ④ ★**冪等でない**（★呼ぶたびに出品が増える）
 *   ⑤ ★**在庫が下限を割ったときに黙って帯を広げる**（★D-102 ⑤・D-079 ⑦）
 *   ⑥ ★**馬を作ってしまう**（★D-102 ②「売る馬は NPC 世界から取る」）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ABILITY_KEYS } from '@star/sim-engine';
import { LISTED_BANDS, LISTINGS_PER_BAND, MARKET_STOCK_MIN, priceOfStars } from '@star/scheduler';
import { refreshMarketListings } from '../src/market-flow.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/market-flow.ts'), 'utf8');

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

/** ★★ごとの素質の平均（`stars.ts` の境目の内側を取る） */
const MEAN_FOR_STARS: Readonly<Record<string, number>> = {
  '2.0': 480, '2.5': 530, '3.0': 580, '3.5': 630, '4.0': 680,
};

interface FakeHorse { id: string; potential: Record<string, number>; listed: boolean }
interface FakeListing { horse_id: string; stars: number; active: boolean; price_ep: number }

/** ★帯ごとに `per` 頭ずつ NPC 馬を作る（★出品ではない。★プールの中身） */
function makePool(per: number): FakeHorse[] {
  const out: FakeHorse[] = [];
  let i = 0;
  for (const band of LISTED_BANDS) {
    const mean = MEAN_FOR_STARS[band.toFixed(1)]!;
    for (let k = 0; k < per; k += 1, i += 1) {
      out.push({
        id: uuid(i),
        potential: Object.fromEntries(ABILITY_KEYS.map((a) => [a, mean])),
        listed: false,
      });
    }
  }
  return out;
}

function fakeDb(pool: FakeHorse[], listings: FakeListing[]): {
  client: pg.Client; sqls: string[];
} {
  const sqls: string[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      sqls.push(sql);
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 };
      if (sql.startsWith('select count(*)')) {
        return { rows: [{ n: String(pool.length) }], rowCount: 1 };
      }
      if (sql.includes('select id, potential from horses')) {
        const limit = params[0] as number;
        const rows = pool.slice(0, limit).map((h) => ({ id: h.id, potential: h.potential }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('from horse_market_listing where active')) {
        const rows = listings.filter((l) => l.active).map((l) => ({ horse_id: l.horse_id, stars: l.stars }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('update horse_market_listing set active = false')) {
        const ids = new Set(params[0] as string[]);
        let n = 0;
        for (const l of listings) if (l.active && ids.has(l.horse_id)) { l.active = false; n += 1; }
        return { rows: [], rowCount: n };
      }
      if (sql.includes('insert into horse_market_listing')) {
        const ids = params[0] as string[];
        const stars = params[1] as number[];
        const prices = params[2] as number[];
        ids.forEach((id, i) => listings.push({ horse_id: id, stars: stars[i]!, price_ep: prices[i]!, active: true }));
        return { rows: [], rowCount: ids.length };
      }
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as unknown as pg.Client, sqls };
}

describe('★出品を作る経路（D-102・第 5 便-2）', () => {
  it('★帯ごとに口数まで出品し、★と価格は TS の関数が出した値と一致する', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    const alerts: string[] = [];
    const r = await refreshMarketListings(client, (m) => alerts.push(m));

    expect(r.added).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
    expect(r.deactivated).toBe(0);
    for (const band of LISTED_BANDS) {
      const rows = listings.filter((l) => l.active && l.stars === band);
      expect(rows.length, `★${band} の口数`).toBe(LISTINGS_PER_BAND);
      /** ★価格は `priceOfStars` が出した値そのもの（★SQL が計算していない） */
      for (const row of rows) expect(row.price_ep, `★${band} の価格`).toBe(priceOfStars(band));
    }
  });

  it('④ ★冪等（2 回目は足しも下ろしもしない）', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    await refreshMarketListings(client, () => {});
    const again = await refreshMarketListings(client, () => {});
    expect(again.added).toBe(0);
    expect(again.deactivated).toBe(0);
    expect(listings.filter((l) => l.active).length).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
  });

  it('② ★買われた馬の出品を下ろし、代わりを足す', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    await refreshMarketListings(client, () => {});
    const sold = listings.find((l) => l.active)!;
    /** ★買われた ＝ プールから消える（`owner_id` が付くので SQL の条件から外れる） */
    const idx = pool.findIndex((h) => h.id === sold.horse_id);
    pool.splice(idx, 1);

    const r = await refreshMarketListings(client, () => {});
    expect(r.deactivated).toBe(1);
    expect(r.added).toBe(1);
    expect(listings.find((l) => l.horse_id === sold.horse_id)!.active).toBe(false);
    expect(listings.filter((l) => l.active).length).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
  });

  it('③ ★★が変わった馬の出品を下ろす（★故障で素質が下がった馬を、前の値段で売らない）', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    await refreshMarketListings(client, () => {});
    const target = listings.find((l) => l.active && l.stars === 4.0)!;
    const horse = pool.find((h) => h.id === target.horse_id)!;
    /** ★素質が下がる（★§7.5 の恒久ダメージ）→ ★が下がる */
    horse.potential = Object.fromEntries(ABILITY_KEYS.map((a) => [a, MEAN_FOR_STARS['2.0']!]));

    const r = await refreshMarketListings(client, () => {});
    expect(r.deactivated).toBe(1);
    expect(listings.find((l) => l.horse_id === target.horse_id && l.stars === 4.0)!.active).toBe(false);
    /** ★下がった★の帯で売られてもいない（★同じ馬が別の値段で並ばない） */
    const still = listings.filter((l) => l.active && l.horse_id === target.horse_id);
    expect(still.length).toBeLessThanOrEqual(1);
  });

  it('⑤ ★在庫が下限を割ったら警報を出し、★帯を広げない（D-102 ⑤）', async () => {
    const pool = makePool(2); // ★帯 5 × 2 頭 = 10 頭（下限 200 を大きく割る）
    expect(pool.length).toBeLessThan(MARKET_STOCK_MIN);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    const alerts: string[] = [];
    const r = await refreshMarketListings(client, (m) => alerts.push(m));

    expect(r.stockOk).toBe(false);
    expect(alerts.some((a) => a.includes('在庫が下限を割りました'))).toBe(true);
    /** ★出ている★は名簿の帯だけ（★黙って広げていない） */
    const bands = new Set(listings.filter((l) => l.active).map((l) => l.stars));
    for (const b of bands) expect(LISTED_BANDS).toContain(b);
    /** ★足りない帯は足りないまま（★埋めるために別の帯から持ってこない） */
    expect(r.added).toBeLessThanOrEqual(LISTED_BANDS.length * LISTINGS_PER_BAND);
  });

  it('⑥ ★馬を作らない・乱数と時刻を読まない（★D-102 ②・憲法 4）', () => {
    expect(SRC).not.toMatch(/insert into horses/i);
    expect(SRC).not.toMatch(/Math\.random|Date\.now/);
    /** ★並びは id で決まる（★抽選しない） */
    expect(SRC).toMatch(/order by id/);
  });

  it('① ★★と価格の式を SQL に書いていない（★D-052・二重帳簿にしない）', () => {
    /** ★★の境目（`stars.ts`）と ★1 つあたりの価格（`horse-market.ts`）が SQL の文字列に無い */
    for (const leak of ['420', '470', '520', '570', '620', '670', '720', '800', '2000']) {
      expect(SRC.includes(`'${leak}`), `★算出が SQL に写っている: ${leak}`).toBe(false);
    }
    /** ★★は `starsOfPotential`、価格は `priceOfStars` から取る */
    expect(SRC).toMatch(/starsOfPotential/);
    expect(SRC).toMatch(/planListings/);
  });
});
