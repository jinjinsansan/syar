/**
 * ★**出走登録の凍結を埋め、埋まらない馬だけを取消にする**（★正典 **D-111**・移行 `0028`）
 *
 * ★偽の DB で `freezePendingEntries` を**本物のまま**回します（★変換 `toEntrant` も本物）。
 *
 * 【★見ている壊れ方】★この経路が壊れると ★**他の客の馬券まで消えます**（D-056 のレースごと中止）。
 *   ① ★凍結を書かない（★確定できずレースごと中止に戻る）
 *   ② ★**1 頭の不備でレース全体を止める**（★D-111 ③「その馬だけ取消・レースは止めない」）
 *   ③ ★**理由の無い取消**（★黙って消す・D-111 ⑤）
 *   ④ ★**登録料と騎手の料金を返さない**（★D-111 ⑤）
 *   ⑤ ★二度回すと二度返す（★冪等でない）
 *   ⑥ ★乱数・時刻を読む（★憲法 4）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ABILITY_KEYS } from '@star/sim-engine';
import { ENTRY_FEE_EP, freezePendingEntries } from '../src/entry-freeze.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/entry-freeze.ts'), 'utf8');
/**
 * ★**コメントを空白にしてから見る**（★移行の検査で使っているのと同じ作法）。
 * ⚠️ ★2026-09-16: ★**「Math.random も読まない」と書いたコメントそのもの**が
 *    ★禁止語の検査に当たって落ちました。★コードは 1 行も時計を読んでいません。
 *    → ★**禁止語を生の本文で探すと、註記が引っかかります**（D-108 ③「禁止語の一覧で書かない」の家族）。
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const OWNER = uuid(900);
const GOOD = uuid(1);
const BROKEN = uuid(2);

/** ★`rowToHorse` が要求する列をすべて持つ行（★1 列でも欠けると例外＝取消の経路に入る） */
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

interface Entry {
  entry_id: string; horse_id: string; gate: number;
  snapshot: unknown; scratched_at: string | null; scratch_reason: string | null;
  jockeyFee: number; horse: Record<string, unknown> | null;
  /**
   * ★**引退した週**（★null なら現役）。
   * ⚠️ ★`enter_race` は登録時に引退を弾きますが、★**登録の後・発走の前に引退する**ことは
   *    ★実際に起こります（★週送りで 260 週に達する／致命的な故障・§7.1・§7.5）。
   *    ★そのまま凍結すると ★**引退した馬が走ります**。
   */
  retired_at_week?: number | null;
}

function fakeDb(entries: Entry[], ledger: { key: string; delta: number }[]): pg.Client {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [], rowCount: 0 };
      if (sql.includes('from race_entries e') && sql.includes('entrant_snapshot is null')) {
        /** ★取消済みは拾わない・発走が近いものだけ、を SQL の文面で確かめる（R-30） */
        expect(sql).toContain('e.scratched_at is null');
        expect(sql).toContain('r.scheduled_at <=');
        const rows = entries
          .filter((e) => e.snapshot === null && e.scratched_at === null)
          .map((e) => ({
            entry_id: e.entry_id, race_id: uuid(500), cycle_index: '5682',
            horse_id: e.horse_id, gate: e.gate, weight: 55, strategy: 'senko',
            jockey_frozen: { feeEP: e.jockeyFee }, horse: e.horse, retired_at_week: e.retired_at_week ?? null,
            distance: 1600, surface: 'turf', track_condition: 'good',
          }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('set entrant_snapshot')) {
        const e = entries.find((x) => x.entry_id === params[1])!;
        e.snapshot = JSON.parse(params[0] as string);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('set scratched_at = now()')) {
        const e = entries.find((x) => x.entry_id === params[1])!;
        e.scratched_at = '2026-09-16T00:00:00Z';
        e.scratch_reason = params[0] as string;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('select owner_id from horses')) {
        return { rows: [{ owner_id: OWNER }], rowCount: 1 };
      }
      if (sql.includes('from ep_ledger where dedupe_key')) {
        const hit = ledger.filter((l) => l.key === params[0]);
        return { rows: hit, rowCount: hit.length };
      }
      if (sql.includes('update users set entry_points')) {
        return { rows: [{ entry_points: '100000' }], rowCount: 1 };
      }
      if (sql.includes('insert into ep_ledger')) {
        expect(params[3 - 1], '★返金は EP の refund で記帳する').toBeDefined();
        ledger.push({ key: params[4] as string, delta: params[1] as number });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return client as unknown as pg.Client;
}

const makeEntries = (): Entry[] => ([
  { entry_id: uuid(11), horse_id: GOOD, gate: 19, snapshot: null, scratched_at: null, scratch_reason: null, jockeyFee: 200, horse: horseRow(GOOD) },
  { entry_id: uuid(12), horse_id: BROKEN, gate: 20, snapshot: null, scratched_at: null, scratch_reason: null, jockeyFee: 300, horse: null },
]);

describe('★出走登録の凍結と取消（D-111）', () => {
  it('①② ★書ける馬は凍結し、★書けない馬だけを取消にする（★レースは止めない）', async () => {
    const entries = makeEntries();
    const ledger: { key: string; delta: number }[] = [];
    const alerts: string[] = [];
    const r = await freezePendingEntries(fakeDb(entries, ledger), (m) => alerts.push(m));

    expect(r.frozen).toBe(1);
    expect(r.scratched).toBe(1);
    /** ★凍結は `RaceEntrant` の形（★確定側がそのまま使える） */
    const snap = entries[0]!.snapshot as Record<string, unknown>;
    expect(Object.keys(snap).sort()).toEqual([
      'age', 'condition', 'distanceCenter', 'distanceRange', 'fatigue', 'gate',
      'heavyAptitude', 'horseId', 'skillGenes', 'stats', 'strategy', 'strategyAptitude',
      'surfaceAptitude', 'weightKg',
    ]);
    expect(snap['gate']).toBe(19);
    /** ★もう 1 頭は取消だが、★**凍結した馬はそのまま**（★レース全体を止めていない） */
    expect(entries[0]!.scratched_at).toBeNull();
    expect(entries[1]!.scratched_at).not.toBeNull();
  });

  it('③ ★取消には必ず理由が付く（★黙って消さない）', async () => {
    const entries = makeEntries();
    const alerts: string[] = [];
    await freezePendingEntries(fakeDb(entries, []), (m) => alerts.push(m));
    expect(entries[1]!.scratch_reason).toBeTruthy();
    expect(alerts.some((a) => a.includes('出走を取消しました') && a.includes('レースは止めていません'))).toBe(true);
  });

  it('④⑤ ★登録料と騎手の料金を返し、二度は返さない', async () => {
    const entries = makeEntries();
    const ledger: { key: string; delta: number }[] = [];
    const r1 = await freezePendingEntries(fakeDb(entries, ledger), () => {});
    expect(r1.refundedEp).toBe(ENTRY_FEE_EP + 300);
    expect(ledger.length).toBe(1);
    expect(ledger[0]!.key).toBe(`scratch:${uuid(12)}`);

    /** ★二度目: 取消済みは拾わないので、返金も増えない */
    const r2 = await freezePendingEntries(fakeDb(entries, ledger), () => {});
    expect(r2.scratched).toBe(0);
    expect(r2.refundedEp).toBe(0);
    expect(ledger.length).toBe(1);
  });

  it('★★登録の後に引退した馬は取消になる（★本番で最も起こりやすい取消・D-111 ③）', async () => {
    /**
     * ⚠️ ★**これが GE-3 の実演でも使う経路です。**
     *    ★`enter_race` は登録時に引退を弾きますが、★**登録の後・発走の前に引退する**ことは
     *    ★実際に起こります（★週送りで 260 週に達する／致命的な故障）。
     *    ★ここで止めないと ★**引退した馬が走ります**。
     */
    const entries = makeEntries();
    /** ★2 頭目は馬の行が読める（現役の形）が、★引退している */
    entries[1]!.horse = horseRow(BROKEN);
    entries[1]!.retired_at_week = 300;
    const alerts: string[] = [];
    const r = await freezePendingEntries(fakeDb(entries, []), (m) => alerts.push(m));

    expect(r.frozen, '★現役の 1 頭は凍結される').toBe(1);
    expect(r.scratched, '★引退した 1 頭だけ取消').toBe(1);
    expect(entries[0]!.scratched_at, '★現役の馬まで取消になっている').toBeNull();
    expect(entries[1]!.scratch_reason).toContain('登録の後に引退しました');
    expect(entries[1]!.snapshot, '★引退した馬に凍結が書かれている').toBeNull();
  });

  it('⑥ ★乱数源も時計も持たない（★憲法 4・D-112 ① と同じ縛り）', () => {
    expect(CODE).not.toMatch(/Math\.random\(|Date\.now\(|new Date\(/);
    /** ★既存の系列から導く */
    expect(CODE).toMatch(/deriveRng/);
    /** ★変換は生成側と同じ関数（★ここで組み直さない・D-052） */
    expect(CODE).toMatch(/toEntrant/);
    expect(CODE).not.toMatch(/horseId:\s*.*,\s*stats:\s*\{/);
  });

  it('★安全網（D-056）を外していない（★確定側の中止の分岐に触れていない）', () => {
    const store = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/pg-store.ts'), 'utf8');
    expect(store).toMatch(/UnfrozenRaceError/);
    /** ★取消の枠を払戻に渡している（★渡さないと取消馬の馬券が「外れ」になる） */
    expect(store).toMatch(/scratched_at is not null/);
    expect(store).toMatch(/settlePayouts\(client, r\.id, finished, /);
  });
});
