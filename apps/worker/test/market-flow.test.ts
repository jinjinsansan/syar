/**
 * ★**出品を作る経路**（★正典 **D-102**・移行 `0025`／★2026-09-19・**T-11**）
 *
 * ★偽の DB で `refreshMarketListings` を**本物のまま**回します（★計画の純関数 `planListings` も本物）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**価格の式を SQL 側で決める**（★D-052・二重帳簿）
 *   ② 🔴 ★**買われた馬・引退した馬の出品が残る**（★買えない馬が並ぶ）
 *   ③ 🔴 ★**価格が動いたら下ろす**（★**T11-2 ①**。★式が総獲得賞金を含むので、走るたびに動く）
 *   ④ 🔴 ★**冪等でない**（★呼ぶたびに出品が増える）
 *   ⑤ 🔴 ★**帯が埋まらないときに黙って別の帯から埋める**（★D-102 ⑤・D-079 ⑦）
 *   ⑥ 🔴 ★**馬を作ってしまう**（★D-102 ②「売る馬は NPC 世界から取る」）
 *   ⑦ 🔴 ★**素質が候補や並べ方に戻る**（★**T11-1 ①**。★棚が帯を教えると逆算が復活する）
 *   ⑧ 🔴 ★**引退馬を出品する**（★**T11-3**。★種牡馬市場と二重に数えられる）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MARKET_STOCK_MIN, LISTINGS_PER_TIER, PRICE_TIERS_EP, npcStudFee, sellBackEP, priceTierOf,
} from '@star/scheduler';
import { refreshMarketListings } from '../src/market-flow.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/market-flow.ts'), 'utf8');
/**
 * ⚠️ 🔴 ★**註記を落としてから見ます**（★CK-1 の家族・2026-09-19）。
 *    ★このファイルの註記には ★**「旧は `bandOfPotential` で選んでいた」**と書いてあり、
 *    ★生の本文を見ると ★**直したのに赤**になりました（★実際に踏みました）。
 */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

/** ★その帯に入る戦績（★G1 勝利数と総獲得賞金だけ。★素質は出てきません） */
function recordForTier(tier: number): { g1: number; earnings: number } {
  const from = PRICE_TIERS_EP[tier]!;
  // ★`3,000 + G1×8,000 + 総獲得賞金/20` を、★総獲得賞金だけで届かせる
  return { g1: 0, earnings: (from - 3_000 + 10) * 20 };
}

interface FakeHorse { id: string; g1_wins: number; earnings: number }
// ⚠️ ★**`stars` 列はありません**（★移行 `0036` で落としました）
interface FakeListing { horse_id: string; active: boolean; price_ep: number; sell_back_ep: number }

/** ★価格の帯ごとに `per` 頭ずつ NPC 馬を作る（★出品ではない。★プールの中身） */
function makePool(per: number): FakeHorse[] {
  const out: FakeHorse[] = [];
  let i = 0;
  for (let tier = 0; tier < PRICE_TIERS_EP.length; tier += 1) {
    const r = recordForTier(tier);
    for (let k = 0; k < per; k += 1, i += 1) {
      out.push({ id: uuid(i), g1_wins: r.g1, earnings: r.earnings });
    }
  }
  return out;
}

const priceOf = (h: FakeHorse): number => npcStudFee(h.g1_wins, h.earnings);

function fakeDb(pool: FakeHorse[], listings: FakeListing[], gameWeek = 0): {
  client: pg.Client; sqls: string[];
} {
  const sqls: string[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      sqls.push(sql);
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 };
      if (sql.includes('select game_week from world_state')) {
        return { rows: [{ game_week: gameWeek }], rowCount: 1 };
      }
      if (sql.startsWith('select count(*)')) {
        return { rows: [{ n: String(pool.length) }], rowCount: 1 };
      }
      if (sql.includes('select h.id, h.g1_wins')) {
        const limit = params[0] as number;
        const rows = pool.slice(0, limit).map((h) => ({
          id: h.id, g1_wins: h.g1_wins, earnings: String(h.earnings),
        }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('from horse_market_listing where active')) {
        const rows = listings.filter((l) => l.active).map((l) => ({ horse_id: l.horse_id, price_ep: l.price_ep }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('select price_ep from horse_market_listing where active')) {
        const rows = listings.filter((l) => l.active).map((l) => ({ price_ep: l.price_ep }));
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

const TOTAL = PRICE_TIERS_EP.length * LISTINGS_PER_TIER;

describe('★出品を作る経路（D-102・T-11）', () => {
  it('★価格の帯ごとに口数まで出品し、価格は §10.5 の式と一致する', async () => {
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    const alerts: string[] = [];
    const r = await refreshMarketListings(client, (m) => alerts.push(m));

    expect(r.added).toBe(TOTAL);
    expect(r.deactivated).toBe(0);
    expect(r.shortfall, '★埋まらない帯は無いはず').toEqual([]);
    for (let tier = 0; tier < PRICE_TIERS_EP.length; tier += 1) {
      const rows = listings.filter((l) => l.active && priceTierOf(l.price_ep) === tier);
      expect(rows.length, `帯 ${tier} の口数`).toBe(LISTINGS_PER_TIER);
      /** 🔴 ★出品の行に段が無い（D-114 ②） */
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(['active', 'horse_id', 'price_ep', 'sell_back_ep']);
      /**
       * ★**手放したときに戻る額も TS が書く**（★`0026`・D-102 ③・**T11-4**）。
       * ⚠️ ★**買った額より小さい**こと（★等しい・大きいと EP の蛇口になります）。
       */
      for (const row of rows) {
        expect(row.sell_back_ep, `帯 ${tier} の戻り`).toBe(sellBackEP(row.price_ep));
        expect(row.sell_back_ep).toBeLessThan(row.price_ep);
      }
    }
    /** ★価格は式の値そのもの */
    for (const l of listings) {
      const h = pool.find((x) => x.id === l.horse_id)!;
      expect(l.price_ep, `${l.horse_id} の価格`).toBe(priceOf(h));
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
    expect(listings.filter((l) => l.active).length).toBe(TOTAL);
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
    expect(listings.filter((l) => l.active).length).toBe(TOTAL);
  });

  it('🔴 ③ ★価格が動いても下ろさない（★**T11-2 ①**・★凍結）', async () => {
    /**
     * 🔴 ★**2026-09-19 に向きを変えました。**
     *   ★旧: 「帯が変わった馬の出品を下ろす」— ★素質が下がるのは**稀**という前提の規則でした。
     *   ★新: ★式が `総獲得賞金/20` を含むので、★**出品中の馬が 1 回走るたびに価格が動きます**。
     *        ★そのたびに下ろすと ★**ほぼ毎日 総入れ替え**になります。
     *   → ★**出した時点の価格で凍結**し、★ずれは `maxDriftEP` で出します。
     */
    const pool = makePool(5);
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    await refreshMarketListings(client, () => {});
    const target = listings.find((l) => l.active)!;
    const horse = pool.find((h) => h.id === target.horse_id)!;
    const before = target.price_ep;
    /** ★走って賞金を得た → いまの式の価格が上がる */
    horse.earnings += 200_000;

    const r = await refreshMarketListings(client, () => {});
    expect(r.deactivated, '★価格が変わっただけで下ろしている').toBe(0);
    expect(listings.find((l) => l.horse_id === target.horse_id)!.price_ep, '★出した額が書き換わっている')
      .toBe(before);
    expect(r.maxDriftEP, '★ずれを数として出していない').toBeGreaterThan(0);
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
    /** ★足りない帯は足りないまま（★埋めるために別の帯から持ってこない） */
    for (let tier = 0; tier < PRICE_TIERS_EP.length; tier += 1) {
      const n = listings.filter((l) => l.active && priceTierOf(l.price_ep) === tier).length;
      expect(n, `帯 ${tier}`).toBeLessThanOrEqual(LISTINGS_PER_TIER);
    }
  });

  it('🔴 ⑤b ★帯が埋まらないことを、数として出して警報する（★**T11-1 ②**）', async () => {
    /** ★帯 0 に 1 頭だけ。★他の帯は空 */
    const pool: FakeHorse[] = [{ id: uuid(1), g1_wins: 0, earnings: 0 }];
    const listings: FakeListing[] = [];
    const { client } = fakeDb(pool, listings);
    const alerts: string[] = [];
    const r = await refreshMarketListings(client, (m) => alerts.push(m));

    expect(r.added).toBe(1);
    /** ★帯 0 はあと 2 口・帯 1〜4 は 3 口ずつ足りない */
    expect(r.shortfall.map((s) => s.tier)).toEqual([0, 1, 2, 3, 4]);
    expect(r.shortfall[0]!.missing).toBe(LISTINGS_PER_TIER - 1);
    expect(alerts.some((a) => a.includes('価格の帯が埋まりませんでした')), '★黙って埋めている').toBe(true);
  });

  it('🔴 ⑦ ★素質が候補にも並べ方にも入っていない（★**T11-1 ①**）', () => {
    /**
     * 🔴 ★**棚を素質の帯で並べると、「どの棚にいるか」が帯を教えます**。
     *    ★D-114 ② が塞いだ口が「棚」という形で開き直り、★逆算が復活します。
     */
    for (const leak of ['bandOfPotential', 'potential', 'starScaleOfBand', 'STAR_']) {
      expect(LIVE, `★素質が戻っている: ${leak}`).not.toMatch(new RegExp(`\\b${leak}`));
    }
    /** ★候補は「走った実績のある馬」（★D-102 ③・`is_initial_horse_candidate` の補集合） */
    expect(SRC).toMatch(/finish_pos is not null/);
    expect(SRC).toMatch(/npcStudFee/);
  });

  it('🔴 ⑧ ★引退馬を出品しない（★**T11-3**・★種牡馬市場と二重に数えない）', () => {
    expect(SRC, '★引退で絞っていない').toMatch(/retired_at_week is null/);
  });

  it('⑥ ★馬を作らない・乱数と時刻を読まない（★D-102 ②・憲法 4）', () => {
    expect(LIVE).not.toMatch(/insert into horses/i);
    expect(LIVE).not.toMatch(/Math\.random|Date\.now/);
    /** ★並びは id で決まる（★抽選しない）。★起点はサーバーが書いた週から取る */
    expect(SRC).toMatch(/order by h\.id/);
    expect(SRC).toMatch(/game_week/);
  });

  it('🔴 ★**MK-1**: ★候補と在庫の数え方が同じ述語を使っている', () => {
    /**
     * 🔴 ★**2026-09-19・MK-1**。★旧は ★**在庫の監視だけ `exists(raced)` が抜けて**いました。
     * ✔ ★staging の実測: ★**監視 7,333 頭 / 実際に買える候補 732 頭**（★**10.0 倍**）。
     * 🔴 ★下限は 200 頭なので、★**候補が 200 を割っても監視は黙っていました**。
     *
     * ⚠️ ★**偽の DB では見られません** — ★`select count(*)` を 1 つの枝で受けて
     *    ★`pool.length` を返すので、★**述語が違っても同じ数が返ります**。
     *    → ★**源の側で見ます**（★述語が 1 か所から引かれていること）。
     */
    expect(LIVE, '★述語が 1 か所になっていない').toMatch(/const CANDIDATE_WHERE = /);
    /** ★`exists(raced)` を直書きしているのは 1 か所だけ */
    const hits = [...LIVE.matchAll(/finish_pos is not null/g)];
    expect(hits.length, `★述語が ${hits.length} か所にある`).toBe(1);
    /** ★候補を読む側と、数える側の両方がそれを引いている */
    const uses = [...LIVE.matchAll(/\$\{CANDIDATE_WHERE\}/g)];
    expect(uses.length, '★両方が同じ述語を引いていない').toBe(2);
  });

  it('① ★価格の式を SQL に書いていない（★D-052・二重帳簿にしない）', () => {
    /** ★§10.5 の係数が SQL の文字列に無い */
    for (const leak of ['8000', '8_000', '/ 20', '3000']) {
      expect(LIVE.includes(`'${leak}`), `★式が SQL に写っている: ${leak}`).toBe(false);
    }
    expect(SRC).toMatch(/planListings/);
    /** 🔴 ★出品の insert に `stars` が無い（★移行 `0036`・D-114 ②） */
    expect(SRC).not.toMatch(/insert into horse_market_listing[^`]*\bstars\b/);
  });
});
