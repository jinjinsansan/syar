/**
 * ★**プレイヤーの配合の確定**（★PLAN I-2・D-120）の検査。★DB に繋ぎません（★偽のクライアント）。
 *
 * 【★何を見るか】
 *   ① ★成功: ★下書き・母 → 父のカウンタ・免除の記帳・要求の完了を ★1 取引で書く
 *   ② 🔴 ★失敗は `breed()` の前だけ（★結果を見てから失敗させない・D-120 ①）
 *   ③ 🔴 ★`breed()` の後で落ちたら ★取引ごと戻し、要求は「待ち」のまま（★失敗にしない）
 *   ④ ★ロックは 母 → 父（★NPC の経路と同じ順・裁定 §1 条件 3）
 *   ⑤ ★仔の id と種は ★要求 ID から（★同じ要求なら同じ仔・NPC の「父|母|週」と別の鍵）
 *   ⑥ ★`foal_requests` が無い DB（★`0061` の前）では何もしない
 *   ⑦ ★所有上限ちょうど（★30 頭目は通る・31 頭目は通らない・D-120 ③）
 *
 * ⚠️ ★**この検査は「同じ母を NPC とプレイヤーが同時に取り合う」を DB で見ていません。**
 *    ★それは staging の実演の仕事です（★裁定 §2・片側の経路だけの検査で緑にしない）。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, FOUNDERS, createFounder, deriveRng } from '@star/sim-engine';
import { OWNERSHIP_LIMITS } from '@star/scheduler';
import {
  PLAYER_FOAL_KEY_PREFIX, confirmInitialBreeding, playerBreedingContext, runPlayerBreeding,
} from '../../worker/src/player-breeding.js';
import { idAndSeedFromKey } from '../../worker/src/breeding-runner.js';

const REQ = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const SIRE = '33333333-3333-4333-8333-333333333333';
const DAM = '44444444-4444-4444-8444-444444444444';

interface FakeOptions {
  readonly noTable?: boolean;
  readonly damRole?: string | null;
  readonly damOwner?: string | null;
  readonly damBredThisYear?: boolean;
  /** ★その年の仔がもう在る（★2 つの表で数えた結果） */
  readonly damHasFoalInYear?: boolean;
  readonly owned?: number;
  /** ★`breed()` の後（★下書きの insert）で落とす */
  readonly failDraftInsert?: boolean;
}

/** ★genotype を手で作らない（★`breeding-runner.test.ts` と同じ理由） */
function horseRow(id: string, sex: 'male' | 'female', extra: Record<string, unknown>): Record<string, unknown> {
  const rec = createFounder({
    id, sex, sireLine: `L-${id.slice(0, 3)}`, birthYear: 0,
    rng: deriveRng(1, id.length, id.charCodeAt(id.length - 1)),
    balance: DEFAULT_BALANCE, founders: FOUNDERS,
  });
  return {
    id, sex: rec.sex, generation: rec.generation, birth_year: rec.birthYear,
    birth_week: 0, sire_id: null, dam_id: null, sire_line: rec.sireLine,
    dam_sire_line: rec.damSireLine, genotype: rec.genotype, potential: rec.potential,
    stats: rec.stats, unlock_rate: rec.unlockRate, surface_aptitude: rec.surfaceAptitude,
    distance_center: rec.distanceCenter, distance_range: rec.distanceRange,
    strategy_aptitude: rec.strategyAptitude, heavy_aptitude: rec.heavyAptitude,
    growth: rec.growth, temper: rec.temper, durability: rec.durability, frail: rec.frail,
    skill_genes: rec.skillGenes, inbreed_coeff: rec.inbreedCoeff,
    nicks_multiplier: rec.nicksMultiplier, pedigree_cache: {}, foal_count: 0, g1_wins: 0,
    npc_stable_id: 1, bred_this_year: false, coverings_this_year: 0,
    ...extra,
  };
}

function fakeClient(o: FakeOptions) {
  const seen: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      seen.push({ sql, params });
      if (sql.startsWith('select to_regclass')) {
        return { rows: [{ t: o.noTable === true ? null : String(params[0]) }], rowCount: 1 };
      }
      if (sql.startsWith("select id from foal_requests where status = 'pending'")) {
        return { rows: [{ id: REQ }], rowCount: 1 };
      }
      if (sql.startsWith('select min(birth_year')) return { rows: [{ mn: '46', mx: '46' }], rowCount: 1 };
      if (sql.startsWith('select sire_line, dam_sire_line')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('select id, user_id, sire_id, dam_id from foal_requests')) {
        return { rows: [{ id: REQ, user_id: USER, sire_id: SIRE, dam_id: DAM }], rowCount: 1 };
      }
      if (sql.includes('from horses where id = $1 for update')) {
        if (params[0] === DAM) {
          return {
            rows: [horseRow(DAM, 'female', {
              owner_id: o.damOwner === undefined ? null : o.damOwner,
              retirement_role: o.damRole === undefined ? 'broodmare' : o.damRole,
              bred_this_year: o.damBredThisYear === true,
            })],
            rowCount: 1,
          };
        }
        return { rows: [horseRow(SIRE, 'male', { owner_id: null, retirement_role: 'stallion' })], rowCount: 1 };
      }
      if (sql.startsWith('select (exists')) {
        return { rows: [{ has: o.damHasFoalInYear === true }], rowCount: 1 };
      }
      if (sql.startsWith('select ((select count(*) from horses where owner_id')) {
        return { rows: [{ n: String(o.owned ?? 1) }], rowCount: 1 };
      }
      if (sql.startsWith('select id, sire_id, dam_id, inbreed_coeff')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('insert into foal_drafts')) {
        if (o.failDraftInsert === true) throw new Error('★わざと落とす（★breed() の後）');
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('select coalesce(sum(prize_pp)')) return { rows: [{ e: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as never, seen };
}

const WEEK_MS = 4 * 60 * 60 * 1000;
const NOW = (52 * 8 + 5) * WEEK_MS;
const run = (c: never) => runPlayerBreeding(c, NOW, 0, () => {});
const sqls = (seen: { sql: string }[]) => seen.map((s) => s.sql);

describe('★PLAN I-2: プレイヤーの配合の確定', () => {
  it('① ★成功: ★下書き・カウンタ・免除・完了を書き、★取引を閉じる', async () => {
    const { client, seen } = fakeClient({});
    const r = await run(client);
    expect(r).toEqual({ skipped: false, done: 1, failed: 0, errors: 0 });
    const s = sqls(seen);
    const at = (p: string) => s.findIndex((x) => x.startsWith(p));
    expect(at('insert into foal_drafts'), '★下書きを書いていない').toBeGreaterThan(-1);
    expect(at('update horses set bred_this_year = true'), '★母の印を書いていない').toBeGreaterThan(-1);
    expect(at('update horses set coverings_this_year'), '★父の種付を数えていない').toBeGreaterThan(-1);
    expect(at('insert into ep_ledger'), '★免除を記帳していない（★黙って 0 にしない・D-120 ②）').toBeGreaterThan(-1);
    expect(at("update foal_requests set status = 'done'"), '★要求を完了にしていない').toBeGreaterThan(-1);
    expect(s.lastIndexOf('commit'), '★取引を閉じていない').toBeGreaterThan(at("update foal_requests set status = 'done'"));
    const done = seen.find((x) => x.sql.startsWith("update foal_requests set status = 'done'"));
    expect(Number(done?.params[2]), '★免除した額が NPC 種牡馬の式の下限（3,000 EP）より小さい').toBeGreaterThanOrEqual(3000);
  });

  it('④ ★ロックは 母 → 父', async () => {
    const { client, seen } = fakeClient({});
    await run(client);
    const locks = seen.filter((x) => x.sql.includes('from horses where id = $1 for update')).map((x) => x.params[0]);
    expect(locks).toEqual([DAM, SIRE]);
  });

  it('⑤ ★仔の id は ★要求 ID から（★NPC の「父|母|週」とは別の鍵）', async () => {
    const { client, seen } = fakeClient({});
    await run(client);
    const ins = seen.find((x) => x.sql.startsWith('insert into foal_drafts'));
    const want = await idAndSeedFromKey(`${PLAYER_FOAL_KEY_PREFIX}${REQ}`);
    expect(ins?.params[0]).toBe(want.id);
    const npc = await idAndSeedFromKey(`${SIRE}|${DAM}|${52 * 8 + 5}`);
    expect(ins?.params[0], '★NPC と同じ鍵で作っている').not.toBe(npc.id);
  });

  it('★同じ要求からは、★何度でも同じ仔（★決定論・憲法 §1-4）', async () => {
    const a = fakeClient({});
    const b = fakeClient({});
    await run(a.client);
    await run(b.client);
    const rec = (seen: { sql: string; params: unknown[] }[]) =>
      seen.find((x) => x.sql.startsWith('insert into foal_drafts'))?.params[7];
    expect(rec(a.seen)).toBe(rec(b.seen));
  });

  describe('🔴 ② ★失敗は `breed()` の前だけ', () => {
    const cases: [string, FakeOptions, string][] = [
      ['母が繁殖牝馬でない', { damRole: null }, 'dam_not_candidate'],
      ['母に持ち主が居る（★N-1 の暫定: NPC の馬だけ）', { damOwner: USER }, 'dam_not_candidate'],
      ['母が今年もう産んだ（★印）', { damBredThisYear: true }, 'dam_already_bred_this_year'],
      ['🔴 母の印は戻っているが、★その年の仔が 2 つの表のどちらかに在る', { damHasFoalInYear: true }, 'dam_already_bred_this_year'],
      [`所有上限（★${OWNERSHIP_LIMITS.active} 頭 持っている）`, { owned: OWNERSHIP_LIMITS.active }, 'owner_limit'],
    ];
    for (const [name, o, reason] of cases) {
      it(`★${name} → ${reason}・★仔を作らない`, async () => {
        const { client, seen } = fakeClient(o);
        const r = await run(client);
        expect(r.failed).toBe(1);
        const f = seen.find((x) => x.sql.startsWith("update foal_requests set status = 'failed'"));
        expect(f?.params[1]).toBe(reason);
        expect(sqls(seen).some((x) => x.startsWith('insert into foal_drafts')), '★失敗なのに仔を作った').toBe(false);
        expect(sqls(seen).some((x) => x.startsWith('select id, sire_id, dam_id, inbreed_coeff')),
          '★失敗なのに祖先を読んだ（★breed() の手前まで進んでいる）').toBe(false);
      });
    }
    it(`★対照: ★所有 ${OWNERSHIP_LIMITS.active - 1} 頭なら通る（★上限ちょうどの手前）`, async () => {
      const { client } = fakeClient({ owned: OWNERSHIP_LIMITS.active - 1 });
      expect((await run(client)).done).toBe(1);
    });
  });

  it('🔴 ③ ★`breed()` の後で落ちたら ★戻して「待ち」のまま（★失敗にしない）', async () => {
    const alerts: string[] = [];
    const { client, seen } = fakeClient({ failDraftInsert: true });
    const r = await runPlayerBreeding(client, NOW, 0, (m) => alerts.push(m));
    expect(r).toEqual({ skipped: false, done: 0, failed: 0, errors: 1 });
    expect(sqls(seen)).toContain('rollback');
    expect(sqls(seen).some((x) => x.startsWith("update foal_requests set status = 'failed'")),
      '★結果を計算した後に失敗にした（★引き直しが成立する）').toBe(false);
    // ★偽の DB は相性表が空なので、★その警報も出る。★数えるのは確定の失敗の警報だけ
    expect(alerts.filter((m) => m.includes('初回の配合を確定できませんでした')).length, '★黙って戻した').toBe(1);
  });

  it('🔴 ★確定の本体は ★取引に触らない（★包んだ側の rollback が効く＝staging の実演で必ず戻せる）', async () => {
    for (const o of [{}, { damRole: null }] as FakeOptions[]) {
      const { client, seen } = fakeClient(o);
      const ctx = await playerBreedingContext(client, NOW, 0, () => {});
      await confirmInitialBreeding(client, REQ, ctx);
      expect(sqls(seen).filter((s) => /^(begin|commit|rollback)$/i.test(s.trim())),
        '★確定の本体が自分で取引を張った／閉じた').toEqual([]);
    }
  });

  it('⑥ ★`foal_requests` が無い DB（★0061 の前）では何もしない', async () => {
    const { client, seen } = fakeClient({ noTable: true });
    const r = await run(client);
    expect(r.skipped).toBe(true);
    expect(sqls(seen).some((x) => x.includes('from foal_requests'))).toBe(false);
  });
});
