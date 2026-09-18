/**
 * ★**出品を作る経路**（★ゲーム本体 (a) 第 5 便-2・2026-09-16・正典 **D-102**・移行 `0025`）
 *
 * ★偽の DB で `refreshMarketListings` を**本物のまま**回します（★計画の純関数 `planListings` も本物）。
 *
 * 【★見ている壊れ方】
 *   ① ★**帯や価格を SQL 側で決める**（★D-052・二重帳簿。★画面と DB で帯が食い違う）
 *   ② ★**買われた馬・引退した馬の出品が残る**（★買えない馬が並ぶ）
 *   ③ ★**帯が変わった馬の出品が残る**（★故障で素質が下がると帯も下がる。★中身と価格がずれる）
 *   🔴 ☇ ★**出品の行に段が載る**（★2026-09-18・**D-114 ②**・T-10・AL-2・移行 `0036`）
 *   ④ ★**冪等でない**（★呼ぶたびに出品が増える）
 *   ⑤ ★**在庫が下限を割ったときに黙って帯を広げる**（★D-102 ⑤・D-079 ⑦）
 *   ⑥ ★**馬を作ってしまう**（★D-102 ②「売る馬は NPC 世界から取る」）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ABILITY_KEYS } from '@star/sim-engine';
import { STAR_BAND_WIDTH, STAR_THRESHOLDS, starScaleOfBand } from '@star/sim-engine';
import { LISTED_BANDS, LISTINGS_PER_BAND, MARKET_STOCK_MIN, priceOfStars, sellBackEP } from '@star/scheduler';
import { refreshMarketListings } from '../src/market-flow.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/market-flow.ts'), 'utf8');

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

/**
 * ★**段 → 素質の平均**（★`stars.ts` の境目の内側を取る）。
 * ⚠️ ★**境目の実物から引きます**（★数字を写すと、★刻みを変えた日に黙って別の帯を測ります・R-19）。
 *    ★`bandOfPotential` は「平均以下の境目の数」なので、★**段 b（b≧1）の内側は `STAR_THRESHOLDS[b-1]` の少し上**です。
 */
const meanForBand = (band: number): number => {
  const from = STAR_THRESHOLDS[band - 1];
  if (from === undefined) throw new Error(`段 ${band} の内側を取れません（★段 0 は境目の下）`);
  return from + STAR_BAND_WIDTH / 2;
};
/** ★その段の価格（★本体と同じ道順で出す） */
const priceOfBand = (band: number): number => priceOfStars(starScaleOfBand(band));

interface FakeHorse { id: string; potential: Record<string, number>; listed: boolean }
// ⚠️ ★**`stars` 列はありません**（★移行 `0036` で落としました）
interface FakeListing { horse_id: string; active: boolean; price_ep: number; sell_back_ep: number }

/** ★帯ごとに `per` 頭ずつ NPC 馬を作る（★出品ではない。★プールの中身） */
function makePool(per: number): FakeHorse[] {
  const out: FakeHorse[] = [];
  let i = 0;
  for (const band of LISTED_BANDS) {
    const mean = meanForBand(band);
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
        const rows = listings.filter((l) => l.active).map((l) => ({ horse_id: l.horse_id, price_ep: l.price_ep }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('update horse_market_listing set active = false')) {
        const ids = new Set(params[0] as string[]);
        let n = 0;
        for (const l of listings) if (l.active && ids.has(l.horse_id)) { l.active = false; n += 1; }
        return { rows: [], rowCount: n };
      }
      if (sql.includes('insert into horse_market_listing')) {
        /** 🔴 ★**列は 3 つだけ**（★`stars` を戻すとここが合わなくなります・D-114 ②） */
        expect(sql, '★出品に段を書かない').not.toMatch(/\bstars\b/);
        const ids = params[0] as string[];
        const prices = params[1] as number[];
        const backs = params[2] as number[];
        ids.forEach((id, i) => listings.push({
          horse_id: id, price_ep: prices[i]!, sell_back_ep: backs[i]!, active: true,
        }));
        return { rows: [], rowCount: ids.length };
      }
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as unknown as pg.Client, sqls };
}

describe('★出品を作る経路（D-102・第 5 便-2）', () => {
  it('★帯ごとに口数まで出品し、価格は TS の関数が出した値と一致する', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    const alerts: string[] = [];
    const r = await refreshMarketListings(client, (m) => alerts.push(m));

    expect(r.added).toBe(LISTED_BANDS.length * LISTINGS_PER_BAND);
    expect(r.deactivated).toBe(0);
    for (const band of LISTED_BANDS) {
      const rows = listings.filter((l) => l.active && l.price_ep === priceOfBand(band));
      expect(rows.length, `段 ${band} の口数`).toBe(LISTINGS_PER_BAND);
      /** 🔴 ★出品の行に段が無い（D-114 ②） */
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(['active', 'horse_id', 'price_ep', 'sell_back_ep']);
      /**
       * ★**手放したときに戻る額も TS が書く**（★`0026`・D-102 ③）。
       * ⚠️ ★**買った額より小さい**こと（★等しい・大きいと EP の蛇口になります）。
       */
      for (const row of rows) {
        expect(row.sell_back_ep, `段 ${band} の戻り`).toBe(sellBackEP(priceOfBand(band)));
        expect(row.sell_back_ep).toBeLessThan(row.price_ep);
      }
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

  it('③ ★帯が変わった馬の出品を下ろす（★故障で素質が下がった馬を、前の値段で売らない）', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    await refreshMarketListings(client, () => {});
    const top = LISTED_BANDS[LISTED_BANDS.length - 1]!;
    const target = listings.find((l) => l.active && l.price_ep === priceOfBand(top))!;
    const horse = pool.find((h) => h.id === target.horse_id)!;
    /** ★素質が下がる（★§7.5 の恒久ダメージ）→ 帯が下がる */
    horse.potential = Object.fromEntries(ABILITY_KEYS.map((a) => [a, meanForBand(LISTED_BANDS[0]!)]));

    const r = await refreshMarketListings(client, () => {});
    expect(r.deactivated).toBe(1);
    expect(listings.find((l) => l.horse_id === target.horse_id && l.price_ep === priceOfBand(top))!.active).toBe(false);
    /** ★下がった帯で売られてもいない（★同じ馬が別の値段で並ばない） */
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
    /** ★出ている価格は名簿の帯のものだけ（★黙って広げていない） */
    const priced = new Set(listings.filter((l) => l.active).map((l) => l.price_ep));
    const allowed = new Set(LISTED_BANDS.map(priceOfBand));
    for (const p of priced) expect(allowed.has(p), `名簿に無い価格 ${p}`).toBe(true);
    /** ★足りない帯は足りないまま（★埋めるために別の帯から持ってこない） */
    expect(r.added).toBeLessThanOrEqual(LISTED_BANDS.length * LISTINGS_PER_BAND);
  });

  it('⑥ ★馬を作らない・乱数と時刻を読まない（★D-102 ②・憲法 4）', () => {
    expect(SRC).not.toMatch(/insert into horses/i);
    expect(SRC).not.toMatch(/Math\.random|Date\.now/);
    /** ★並びは id で決まる（★抽選しない） */
    expect(SRC).toMatch(/order by id/);
  });

  it('① ★帯と価格の式を SQL に書いていない（★D-052・二重帳簿にしない）', () => {
    /**
     * ★帯の境目（`stars.ts`）と ★目盛 1 つあたりの価格（`horse-market.ts`）が SQL の文字列に無い。
     * ⚠️ ★**境目は実物から引きます**（★手書きの一覧にすると、24 段化のような変更で黙って空振りします・R-19）。
     */
    for (const leak of [...STAR_THRESHOLDS.map(String), '2000']) {
      expect(SRC.includes(`'${leak}`), `★算出が SQL に写っている: ${leak}`).toBe(false);
    }
    /** ★帯は `bandOfPotential`、価格は `priceOfStars` から取る */
    expect(SRC).toMatch(/bandOfPotential/);
    expect(SRC).toMatch(/planListings/);
    /** 🔴 ★出品の insert に `stars` が無い（★移行 `0036`・D-114 ②） */
    expect(SRC).not.toMatch(/insert into horse_market_listing[^`]*\bstars\b/);
  });
});
