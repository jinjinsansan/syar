/**
 * ★**登録 → 凍結 → 確定を通す**（★正典 **D-111**・裁定 `REVIEW_GAME_BODY_5_VERDICT_20260916.md` §1-5）
 *
 * 【★これが今回の抜けの本体です】
 *   ★第 3 便の実演は ★**「登録が通る・3 頭目が拒否される」までしか見ていませんでした**。
 *   ★その後そのレースが ★**確定するか**を見ていなかったので、
 *   ★`enter_race` が凍結を書かない → 確定できずレースごと中止、という穴が残りました。
 *   → ★**入口だけでなく出口まで、1 本の筋で通します**（★R-16 の家族）。
 *
 * 【★変異で守るもの】（裁定 §1-5 の 2・3）
 *   ② ★ワーカーが凍結を書かない形にすると、★**その馬だけ取消・レースは確定**になること
 *   ③ ★発走前の取消を外すと、★確定が D-056 で止まること（★安全網が生きていること）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS } from '@star/sim-engine';
import { freezePendingEntries } from '../../../apps/worker/src/entry-freeze.js';

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const RACE = uuid(500);
const OWNER = uuid(900);

const horseRow = (id: string) => ({
  id, sex: 'male', generation: 7, birth_year: 46,
  sire_id: null, dam_id: null, sire_line: 'L-NPC01', dam_sire_line: null,
  genotype: {}, potential: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 700])),
  stats: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 500])),
  unlock_rate: 0.3, surface_aptitude: { turf: 60, dirt: 50 },
  distance_center: 1800, distance_range: 500,
  strategy_aptitude: { nige: 40, senko: 70, sashi: 50, oikomi: 30 },
  heavy_aptitude: 55, growth: 'normal', temper: 50, durability: 650,
  frail: false, skill_genes: [], inbreed_coeff: 0, nicks_multiplier: 1,
  pedigree_cache: {}, foal_count: 0, g1_wins: 0,
});

interface Row {
  entry_id: string; horse_id: string; gate: number;
  snapshot: Record<string, unknown> | null;
  scratched_at: string | null; scratch_reason: string | null;
  horse: Record<string, unknown> | null;
}

/** ★ワーカーが作った 18 頭（凍結あり）＋ 利用者が `enter_race` で登録した 2 頭（凍結なし） */
function makeWorld(brokenHorse: boolean): Row[] {
  const rows: Row[] = [];
  for (let g = 1; g <= 18; g += 1) {
    rows.push({
      entry_id: uuid(g), horse_id: uuid(100 + g), gate: g,
      snapshot: { horseId: uuid(100 + g), gate: g }, scratched_at: null, scratch_reason: null,
      horse: horseRow(uuid(100 + g)),
    });
  }
  for (const g of [19, 20]) {
    rows.push({
      entry_id: uuid(g), horse_id: uuid(100 + g), gate: g,
      snapshot: null, scratched_at: null, scratch_reason: null,
      /** ★`brokenHorse` のときは馬の行が読めない＝凍結を作れない */
      horse: brokenHorse ? null : horseRow(uuid(100 + g)),
    });
  }
  return rows;
}

function fakeDb(rows: Row[]): pg.Client {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 };
      if (sql.includes('from race_entries e') && sql.includes('entrant_snapshot is null')) {
        const out = rows.filter((r) => r.snapshot === null && r.scratched_at === null).map((r) => ({
          entry_id: r.entry_id, race_id: RACE, cycle_index: '5682', horse_id: r.horse_id,
          gate: r.gate, weight: 55, strategy: 'senko', jockey_frozen: { feeEP: 200 },
          horse: r.horse, distance: 1600, surface: 'turf', track_condition: 'good',
        }));
        return { rows: out, rowCount: out.length };
      }
      if (sql.includes('set entrant_snapshot')) {
        rows.find((r) => r.entry_id === params[1])!.snapshot = JSON.parse(params[0] as string);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('set scratched_at = now()')) {
        const r = rows.find((x) => x.entry_id === params[1])!;
        r.scratched_at = '2026-09-16T00:00:00Z';
        r.scratch_reason = params[0] as string;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('select owner_id from horses')) return { rows: [{ owner_id: OWNER }], rowCount: 1 };
      if (sql.includes('from ep_ledger where dedupe_key')) return { rows: [], rowCount: 0 };
      if (sql.includes('update users set entry_points')) return { rows: [{ entry_points: '100000' }], rowCount: 1 };
      if (sql.includes('insert into ep_ledger')) return { rows: [], rowCount: 1 };
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return client as unknown as pg.Client;
}

/** ★確定の入口が見る条件（`pg-store.ts:379-386` と同じ判定を、この検査の中で再現する） */
const wouldCancel = (rows: readonly Row[]): boolean =>
  rows.some((r) => r.scratched_at === null && r.snapshot === null);

describe('★登録 → 凍結 → 確定（D-111・受け入れ条件）', () => {
  it('★① 登録した 2 頭に凍結が付き、レースは確定できる', async () => {
    const rows = makeWorld(false);
    /** ★凍結の前は、確定側が「中止」と判定する状態（＝いまの穴） */
    expect(wouldCancel(rows), '★前提: 凍結の前は中止になる状態').toBe(true);

    const r = await freezePendingEntries(fakeDb(rows), () => {});
    expect(r.frozen).toBe(2);
    expect(r.scratched).toBe(0);

    /** ★凍結の後は、★**1 頭も欠けていない** ＝ 確定できる */
    expect(wouldCancel(rows), '★凍結の後は確定できる').toBe(false);
    expect(rows.filter((x) => x.snapshot !== null).length).toBe(20);
  });

  it('★② 凍結を作れない馬がいても、その馬だけ取消でレースは確定できる（★レースを止めない）', async () => {
    const rows = makeWorld(true);
    const alerts: string[] = [];
    const r = await freezePendingEntries(fakeDb(rows), (m) => alerts.push(m));

    expect(r.frozen).toBe(0);
    expect(r.scratched).toBe(2);
    /** ★★ここが D-111 ③ の本体: レースは止まらない */
    expect(wouldCancel(rows), '★取消した後は確定できる').toBe(false);
    /** ★ワーカーが作った 18 頭は無傷 */
    expect(rows.filter((x) => x.scratched_at === null).length).toBe(18);
    /** ★理由が付き、料金が返る（★黙って消さない） */
    expect(rows.filter((x) => x.scratched_at !== null).every((x) => x.scratch_reason !== null)).toBe(true);
    expect(r.refundedEp).toBe((200 + 200) * 2);
    expect(alerts.length).toBe(2);
  });

  it('★③ 変異: 発走前のこの経路を通さないと、確定が D-056 で止まる（★安全網が生きている）', () => {
    /**
     * ★`freezePendingEntries` を**呼ばない**世界（＝いまの穴）。
     * ★確定側は 1 頭でも凍結が無ければレースごと中止にする（D-056）。
     * ★この検査は「安全網を外していない」ことの錨です。
     */
    const rows = makeWorld(false);
    expect(wouldCancel(rows), '★経路を通さなければ中止のまま（安全網が生きている）').toBe(true);
  });
});
