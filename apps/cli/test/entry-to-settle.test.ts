/**
 * ★**登録 → 凍結 → 確定を通す**（★正典 **D-111**・裁定 §1-5・**GE-2**）
 *
 * 【★2026-09-16・書き直しました】
 *   ⚠️ ★**前の版は `settleRace` を一度も呼んでいませんでした。**
 *      ★確定側の判定（`unfrozen > 0` なら中止）を ★**検査の中に書き写して**おり、
 *      ★実物の SQL を通らないまま「取消でもレースは確定できる」が緑になっていました。
 *      → ★**GE-1 の穴（クエリに `scratched_at is null` が無い）を、この検査は素通し**していました。
 *   → ★**偽の DB で本物の `settleRace` を通します。**
 *      ★偽の DB は ★**SQL の文面に `e.scratched_at is null` があるときだけ**取消を外します
 *      （★R-30。★製品からその 1 行を消すと、★この検査が落ちます）。
 *
 * 【★見ている壊れ方】
 *   ① ★凍結が無いまま確定すると **D-056 で止まる**（★安全網が生きている）
 *   ② ★凍結を書けば **確定できる**
 *   ③ ★**取消が 1 頭いても、レースは確定できる**（★D-111 ③ の本体。★中止にならない）
 *   ④ ★**確定側のクエリから `scratched_at` の条件を消すと、③ が落ちる**（★変異）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { ABILITY_KEYS } from '@star/sim-engine';
import { createPgStore } from '../../../apps/worker/src/pg-store.js';
import { freezePendingEntries } from '../../../apps/worker/src/entry-freeze.js';

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const RACE_ID = uuid(500);
const CYCLE = 5682;
const OWNER = uuid(900);

const hash = {
  sha256: (m: string) => createHash('sha256').update(m, 'utf8').digest('hex'),
  hmacSha256: (k: string, m: string) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
};

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

/** ★凍結の中身（★`RaceEntrant` の形。★生成側が書いたものと同じ形） */
const snapshotOf = (gate: number) => ({
  horseId: uuid(100 + gate), stats: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 500])),
  surfaceAptitude: { turf: 60, dirt: 50 }, distanceCenter: 1800, distanceRange: 500,
  strategyAptitude: { nige: 40, senko: 70, sashi: 50, oikomi: 30 },
  heavyAptitude: 55, strategy: 'senko', condition: 3, fatigue: 0, weightKg: 55, gate, age: 4, skillGenes: [],
});

interface Entry {
  entry_id: string; horse_id: string; gate: number;
  snapshot: Record<string, unknown> | null;
  scratched_at: string | null; scratch_reason: string | null;
  finish_pos: number | null;
  /** ★馬の行（★null なら凍結を作れない＝取消の経路に入る） */
  horse: Record<string, unknown> | null;
  /**
   * ★**引退した週**（★null なら現役）。
   * ⚠️ ★`enter_race` は登録時に引退を弾きますが、★**登録の後・発走の前に引退する**ことは
   *    ★実際に起こります（★週送りで 260 週に達する／致命的な故障）。★その馬は取消になります。
   */
  retired_at_week?: number | null;
}

/** ★ワーカーが作った 18 頭（凍結あり）＋ 利用者が登録した `late` 頭（凍結なし） */
function makeEntries(late: number, brokenHorse: boolean): Entry[] {
  const rows: Entry[] = [];
  for (let g = 1; g <= 18; g += 1) {
    rows.push({
      entry_id: uuid(g), horse_id: uuid(100 + g), gate: g, snapshot: snapshotOf(g),
      scratched_at: null, scratch_reason: null, finish_pos: null, horse: horseRow(uuid(100 + g)),
    });
  }
  for (let i = 0; i < late; i += 1) {
    const g = 19 + i;
    rows.push({
      entry_id: uuid(g), horse_id: uuid(100 + g), gate: g, snapshot: null,
      scratched_at: null, scratch_reason: null, finish_pos: null,
      horse: brokenHorse ? null : horseRow(uuid(100 + g)),
    });
  }
  return rows;
}

const SCRATCH_CLAUSE = 'e.scratched_at is null';

/**
 * ★偽の DB。★**SQL の文面にある条件だけを効かせます**（R-30）。
 * ⚠️ ★`scratched_at is null` を製品のクエリから消すと、★取消の行が確定側に流れ、
 *    ★`unfrozen > 0` で中止になります ＝ ★**この検査が落ちます**。
 */
function fakeDb(entries: Entry[], opts: { readonly honorScratch?: boolean } = {}) {
  const honor = opts.honorScratch ?? true;
  let settled = false;
  const sqls: string[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      const s = sql.trim();
      sqls.push(s);
      if (/^(begin|commit|rollback)$/.test(s)) return { rows: [], rowCount: 0 };

      /** ★確定の入口（★status を settled にして行を返す） */
      if (s.startsWith('update races set status')) {
        if (settled) return { rows: [], rowCount: 0 };
        settled = true;
        return {
          rows: [{
            id: RACE_ID, server_seed: 'a'.repeat(64), distance: 1600, surface: 'turf',
            track_condition: 'good', course_id: 'star-park', class_rank: 2, grade: null,
            name: `R${CYCLE}`, course_frozen: null,
          }],
          rowCount: 1,
        };
      }
      /** ★★確定の出走表（★GE-1 の対象） */
      if (s.startsWith('select e.gate')) {
        const usable = entries.filter((e) => (honor && s.includes(SCRATCH_CLAUSE) ? e.scratched_at === null : true));
        return {
          rows: usable.map((e) => ({
            gate: e.gate, weight: 55, strategy: 'senko',
            entrant_snapshot: e.snapshot, horse_id: e.horse_id, jockey_frozen: null,
          })),
          rowCount: usable.length,
        };
      }
      if (s.startsWith('update race_entries set finish_pos')) {
        const e = entries.find((x) => x.gate === Number(params[3]));
        if (e !== undefined) e.finish_pos = Number(params[0]);
        return { rows: [], rowCount: 1 };
      }
      /** ★払戻に渡す取消の枠 */
      if (s.startsWith('select gate from race_entries')) {
        const rows = entries.filter((e) => e.scratched_at !== null).map((e) => ({ gate: e.gate }));
        return { rows, rowCount: rows.length };
      }
      /**
       * ★**賞金の経路**（`prize-award.ts`）。★確定が ★**ここまで通っている証拠**です
       *   — ★偽の DB が知らずに落ちたので足しました（★2026-09-16）。
       * ★この検査の対象は「取消でも確定するか」なので、★持ち主は返さず 0 行にします
       *   （★賞金そのものは `prize-award.test.ts` が見ています）。
       */
      /**
       * ⚠️ ★**分岐は SQL の先頭で見分けます**（★2026-09-16 に踏みました）。
       *    ★最初 `includes('join horses h on h.id = e.horse_id')` で見ていたら、
       *    ★凍結待ちを引くクエリ（`left join horses h on h.id = e.horse_id` を含む）まで
       *    ★**この分岐に吸われ**、★凍結が 0 頭になっていました。
       *    ★`includes` の場当たりな見分けは、★実物と食い違っても気づけません（★GE-2 と同じ形）。
       */
      if (s.startsWith('select e.horse_id, h.owner_id')) {
        /**
         * ⚠️ ★**0 行を返してはいけません**（★2026-09-16 に踏みました）。
         *    ★`awardPrizes` は ★**着順の各枠に行がある前提**で、無ければ例外を投げます
         *    （`prize-award.ts:51`）。★0 行は「その枠の馬がいない」という別の異常を意味します。
         * ★持ち主は NPC（null）にして、★賞金の支払いには進ませません。
         */
        const gate = Number(params[1]);
        const e = entries.find((x) => x.gate === gate);
        return e === undefined
          ? { rows: [], rowCount: 0 }
          : { rows: [{ horse_id: e.horse_id, owner_id: null }], rowCount: 1 };
      }
      /**
       * ★**賞金の「発生」を書く 1 文**（★2026-09-19・PR-1/**PR-2**・`prize-award.ts`）。
       * ⚠️ ★`awardPrizes` は ★**書けた行数が確定の頭数と合わなければ投げます**（R-27）。
       *    ★ここで 0 行を返すと、★**確定そのものが落ちます**（★実際に落ちました）。
       * ★渡された枠番の配列を受け取り、★その頭数を返します。
       */
      if (s.startsWith('update race_entries e set prize_pp')) {
        const gates = params[1] as number[];
        // ★実物と同じく「そのレースにある枠だけ」が書けた行になる
        const n = gates.filter((g) => entries.some((e) => e.gate === g)).length;
        return { rows: [], rowCount: n };
      }
      /** ★馬券は空（★この検査の対象ではない） */
      if (s.includes('from bets') || s.includes('insert into pp_ledger') || s.includes('update users set prize_points')) {
        return { rows: [], rowCount: 0 };
      }
      if (s.includes('from race_entries e') && s.includes('entrant_snapshot is null')) {
        const rows = entries.filter((e) => e.snapshot === null && e.scratched_at === null).map((e) => ({
          entry_id: e.entry_id, race_id: RACE_ID, cycle_index: String(CYCLE), horse_id: e.horse_id,
          gate: e.gate, weight: 55, strategy: 'senko', jockey_frozen: { feeEP: 200 },
          horse: e.horse, retired_at_week: e.retired_at_week ?? null, distance: 1600, surface: 'turf', track_condition: 'good',
        }));
        return { rows, rowCount: rows.length };
      }
      if (s.includes('set entrant_snapshot')) {
        entries.find((e) => e.entry_id === params[1])!.snapshot = JSON.parse(params[0] as string);
        return { rows: [], rowCount: 1 };
      }
      if (s.includes('set scratched_at = now()')) {
        const e = entries.find((x) => x.entry_id === params[1])!;
        e.scratched_at = '2026-09-16T00:00:00Z';
        e.scratch_reason = params[0] as string;
        return { rows: [], rowCount: 1 };
      }
      /**
       * ★**返す額は行から読む**（★2026-09-19・D-117 DS-7 で `scratch.ts` に切り出したときに直した）。
       *   ★以前は `entry-freeze.ts` が自前の定数 200 を使っていました（D-052 の写し）。
       */
      if (s.includes('select entry_fee_ep from races')) {
        return { rows: [{ entry_fee_ep: 200 }], rowCount: 1 };
      }
      if (s.includes('select owner_id from horses')) return { rows: [{ owner_id: OWNER }], rowCount: 1 };
      if (s.includes('from ep_ledger where dedupe_key')) return { rows: [], rowCount: 0 };
      if (s.includes('update users set entry_points')) return { rows: [{ entry_points: '100000' }], rowCount: 1 };
      if (s.includes('insert into ep_ledger')) return { rows: [], rowCount: 1 };
      /** ★生涯の記録（★この検査では epochMs を渡さないので呼ばれない） */
      if (s.includes('horse_story_event') || s.includes('extract(epoch from now())')) {
        return { rows: [{ ms: '0' }], rowCount: 1 };
      }
      if (s.includes('prize') || s.includes('award')) return { rows: [], rowCount: 0 };
      throw new Error(`偽の DB が想定していない SQL: ${s.slice(0, 70)}`);
    },
  };
  return { client: client as unknown as pg.Client, sqls, isSettled: () => settled };
}

const storeOf = (client: pg.Client) => createPgStore(client, hash, {
  onCourseNotFrozen: () => undefined,
  onStoryError: () => undefined,
});

describe('★登録 → 凍結 → 確定（D-111・受け入れ条件・GE-2）', () => {
  it('① ★凍結が無いまま確定すると D-056 で止まる（★安全網）', async () => {
    const entries = makeEntries(2, false);
    const db = fakeDb(entries);
    /** ★`settleRace` を**実際に呼びます**（★前の版はここを自前の判定で代用していました） */
    await expect(storeOf(db.client).settleRace(CYCLE)).rejects.toThrow(/凍結がありません/);
    /** ★確定の SQL を通ったことを、文面で確かめる */
    expect(db.sqls.some((s) => s.startsWith('select e.gate'))).toBe(true);
  });

  it('② ★凍結を書けば確定できる', async () => {
    const entries = makeEntries(2, false);
    const db = fakeDb(entries);
    const f = await freezePendingEntries(db.client, () => {}, 30 * 24 * 60 * 60 * 1000);
    expect(f.frozen).toBe(2);
    expect(f.scratched).toBe(0);

    await storeOf(db.client).settleRace(CYCLE);
    expect(db.isSettled(), '★確定できていない').toBe(true);
    /** ★20 頭ぶんの着順が付く */
    expect(entries.filter((e) => e.finish_pos !== null).length).toBe(20);
  });

  it('③ ★★取消が 1 頭いても、レースは確定できる（★D-111 ③ の本体）', async () => {
    const entries = makeEntries(1, true); // ★1 頭だけ、馬の行が読めない＝凍結を作れない
    const db = fakeDb(entries);
    const alerts: string[] = [];
    const f = await freezePendingEntries(db.client, (m) => alerts.push(m), 30 * 24 * 60 * 60 * 1000);
    expect(f.scratched, '★取消が 1 頭出ること').toBe(1);
    expect(alerts.length).toBe(1);

    /** ★★ここが本体: ★中止にならず確定する */
    await storeOf(db.client).settleRace(CYCLE);
    expect(db.isSettled(), '★取消 1 頭でレースごと中止になっている').toBe(true);
    /** ★確定したのはワーカーが作った 18 頭だけ（★取消の 1 頭は入らない） */
    expect(entries.filter((e) => e.finish_pos !== null).length).toBe(18);
    expect(entries.find((e) => e.scratched_at !== null)!.finish_pos, '★取消の馬に着順が付いている').toBeNull();
  });

  it('④ ★変異: 確定側のクエリから `scratched_at` の条件を外すと ③ が落ちる', async () => {
    const entries = makeEntries(1, true);
    /** ★`honorScratch: false` ＝ 偽の DB が条件を無視する（★製品から 1 行消したのと同じ状態） */
    const db = fakeDb(entries, { honorScratch: false });
    await freezePendingEntries(db.client, () => {}, 30 * 24 * 60 * 60 * 1000);
    /** ★取消の行が確定側に流れ、★D-056 で中止になる＝直す前と同じ結末 */
    await expect(storeOf(db.client).settleRace(CYCLE)).rejects.toThrow(/凍結がありません/);
  });

  it('★確定側のクエリに条件が書かれている（★文面の錨）', async () => {
    const entries = makeEntries(0, false);
    const db = fakeDb(entries);
    await storeOf(db.client).settleRace(CYCLE);
    const q = db.sqls.find((s) => s.startsWith('select e.gate'));
    expect(q, '★確定の出走表を引く SQL が無い').toBeDefined();
    expect(q, '★取消を外す条件が無い').toContain(SCRATCH_CLAUSE);
  });
});
