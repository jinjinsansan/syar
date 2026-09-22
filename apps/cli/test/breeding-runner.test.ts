/**
 * ★**定常運転の供給**（`POOL-SUPPLY`）の検査。★DB に繋ぎません（★偽のクライアント）。
 *
 * 【★何を見るか】
 *   ① ★**層化**: ★その週に配合するのは ★**繁殖牝馬のうち 1/52 だけ**（★B-3 と同じ規則）
 *   ② 🔴 ★**止まったら投げる**（★`onAlert` では済ませない・fail-closed）
 *   ③ 🔴 ★**年次カウンタの列を選んでいなければ投げる**（★G-3。★素通りさせない）
 *   ④ ★**年の変わり目にカウンタを戻す**
 *
 * ⚠️ ★**この検査は「生まれた仔の中身」を見ていません。** ★そこは `breed()` の検査の仕事です。
 *    ★ここが見るのは ★**「誰を選び、いつ止まり、何を書くか」**だけです。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, FOUNDERS, createFounder, deriveRng, normalizeName } from '@star/sim-engine';
import { runBreedingWeek } from '../../worker/src/breeding-runner.js';

/** ★問い合わせの文面で答えを決める、★偽のクライアント */
interface FakeOptions {
  readonly mareCount: number;
  /** ★牝馬の行を返すか（★false なら「資格のある馬が居ない」） */
  readonly mareRowsEmpty?: boolean;
  /** ★種牡馬を返すか（★0 なら相手が見つからない） */
  readonly stallionCount?: number;
  /** ★`insert` が 0 行（★既に居た）を返すか */
  readonly insertConflicts?: boolean;
  /** ★年次カウンタの列を落とす（★G-3 の番人を試す） */
  readonly dropCounterColumn?: boolean;
  /** ★下書きの表（★`0061`）が在るか（★`to_regclass`） */
  readonly draftsTable?: boolean;
  /** ★母の印をプレイヤーの配合が先に取っていたか（★印の取得が 0 行） */
  readonly damClaimedByPlayer?: boolean;
  /** ★既に使われている馬名（★`select name from horses` が返す） */
  readonly takenNames?: readonly string[];
  /** ★`horses.name_key`（★移行 `0064`）が在るか */
  readonly nameKeyColumn?: boolean;
}

/**
 * 🔴 ★**genotype を手で作りません。** ★本物の `createFounder()` から作ります。
 *   ⚠️ ★最初は手で `{gt:[1,1],…}` と書いて ★**`a1` が無い**で落ちました。
 *     ★★偽の入力を手で組むと、★「検査が落ちた」のか「偽物が違う」のかが混ざります。
 */
function horseRow(id: string, sex: 'male' | 'female', o: FakeOptions): Record<string, unknown> {
  const rec = createFounder({
    id, sex, sireLine: `L-${id.slice(0, 3)}`, birthYear: 0,
    rng: deriveRng(1, id.length, id.charCodeAt(id.length - 1)),
    balance: DEFAULT_BALANCE, founders: FOUNDERS,
  });
  const row: Record<string, unknown> = {
    id,
    sex: rec.sex,
    generation: rec.generation,
    birth_year: rec.birthYear,
    // ★週齢 312 ＝ 6 歳（★`MIN_BREEDING_AGE_YEARS`）
    birth_week: 0,
    sire_id: null,
    dam_id: null,
    sire_line: rec.sireLine,
    dam_sire_line: rec.damSireLine,
    genotype: rec.genotype,
    potential: rec.potential,
    stats: rec.stats,
    unlock_rate: rec.unlockRate,
    surface_aptitude: rec.surfaceAptitude,
    distance_center: rec.distanceCenter,
    distance_range: rec.distanceRange,
    strategy_aptitude: rec.strategyAptitude,
    heavy_aptitude: rec.heavyAptitude,
    growth: rec.growth,
    temper: rec.temper,
    durability: rec.durability,
    frail: rec.frail,
    skill_genes: rec.skillGenes,
    inbreed_coeff: rec.inbreedCoeff,
    nicks_multiplier: rec.nicksMultiplier,
    pedigree_cache: {},
    foal_count: 0,
    g1_wins: 0,
    npc_stable_id: 1,
    bred_this_year: false,
    coverings_this_year: 0,
  };
  if (o.dropCounterColumn === true) delete row['bred_this_year'];
  return row;
}

function fakeClient(o: FakeOptions) {
  const seen: string[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      seen.push(sql);
      if (sql.startsWith('update horses set bred_this_year = false')) return { rows: [], rowCount: 1 };
      if (sql.includes("retirement_role = 'broodmare' order by id")) {
        return {
          rows: Array.from({ length: o.mareCount }, (_, i) => ({
            id: `m-${String(i).padStart(5, '0')}`,
          })),
          rowCount: o.mareCount,
        };
      }
      if (sql.includes('where id = any($1::uuid[]) and birth_week is not null')) {
        if (o.mareRowsEmpty === true) return { rows: [], rowCount: 0 };
        const ids = (params?.[0] ?? []) as string[];
        // ★6 歳以上（★週齢 312）にしておく
        return { rows: ids.map((id) => horseRow(id, 'female', o)), rowCount: ids.length };
      }
      if (sql.includes("retirement_role = 'stallion'")) {
        const n = o.stallionCount ?? 3;
        return {
          rows: Array.from({ length: n }, (_, i) => horseRow(`s-${i}`, 'male', o)),
          rowCount: n,
        };
      }
      if (sql.startsWith('select id, sire_id, dam_id, inbreed_coeff')) return { rows: [], rowCount: 0 };
      if (sql.includes('insert into horses')) {
        return { rows: [], rowCount: o.insertConflicts === true ? 0 : 1 };
      }
      if (sql.startsWith('select name from horses')) {
        const names = o.takenNames ?? [];
        return { rows: names.map((name) => ({ name })), rowCount: names.length };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ n: o.nameKeyColumn === true ? '1' : '0' }], rowCount: 1 };
      }
      if (sql.includes('to_regclass')) {
        return { rows: [{ t: o.draftsTable === true ? 'foal_drafts' : null }], rowCount: 1 };
      }
      // ★母の印の取得（★2026-09-22）。★プレイヤーの配合が先に取っていれば 0 行
      if (sql.startsWith('update horses set bred_this_year = true')) {
        return { rows: [], rowCount: o.damClaimedByPlayer === true ? 0 : 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as never, seen };
}

/** ★基準の週 312（＝ 6 歳）。★`weekIndexAt` は (now - epoch) / 4 時間 */
const WEEK_MS = 4 * 60 * 60 * 1000;
const EPOCH = 0;
const nowForWeek = (w: number): number => (w + 1) * WEEK_MS;

describe('🔴 ★POOL-SUPPLY: 定常運転の供給', () => {
  it('① ★その週に配合するのは、★繁殖牝馬のうち 1/52 だけ（★B-3 と同じ層化）', async () => {
    const { client, seen } = fakeClient({ mareCount: 520, mareRowsEmpty: true });
    await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
    // ★牝馬の行を取りに行った問い合わせが在る ＝ 対象が 0 ではない
    expect(seen.some((s) => s.includes('any($1::uuid[]) and birth_week is not null')),
      '★その週の対象を読みに行っていない').toBe(true);
  });

  it('★対象が 0 頭の週は、★何もせず終わる（★投げない）', async () => {
    // ★牝馬 1 頭だけなら、★52 週のうち 51 週は誰の番でもない
    const { client } = fakeClient({ mareCount: 1 });
    const weeks = [];
    for (let w = 312; w < 312 + 52; w += 1) {
      weeks.push(await runBreedingWeek(client, nowForWeek(w), EPOCH, () => {}, undefined, 'random', 13, 800));
    }
    const active = weeks.filter((r) => r.eligible > 0 || r.born > 0).length;
    expect(active, '★1 頭なら 52 週に 1 回だけのはず').toBe(1);
  });

  it('🔴 ② ★割り当てが在るのに 1 頭も生まれなければ投げる（★fail-closed）', async () => {
    /**
     * 🔴 ★**この検査を書いていて、★番人が発火しないことに気づきました。**
     *   ★旧い条件は `eligible > 0 && born === 0 && alreadyThere === 0` でしたが、
     *   ★`eligible` は「相手が見つかった牝馬」なので、★`insert` が 0 行なら必ず
     *   ★`alreadyThere` が増え、★**3 つが同時に成り立ちません**。
     *   → ★★**発火しない番人は、番人ではありません**（★`CK-14` の族）。
     */
    // ★種牡馬が 0 頭 ＝ 全頭 相手なし ＝ 供給が止まっている
    const { client } = fakeClient({ mareCount: 52, stallionCount: 0 });
    await expect(runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800))
      .rejects.toThrow(/供給が止まって/);
  });

  it('★対照: ★種牡馬が居れば投げない（★番人が常に鳴るのではない）', async () => {
    const { client } = fakeClient({ mareCount: 52, stallionCount: 3 });
    const r = await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.born, '★1 頭も生まれていない').toBeGreaterThan(0);
  });

  it('★同じ週を二度 処理しても、★増えない（★冪等・`on conflict`）', async () => {
    const { client } = fakeClient({ mareCount: 52, stallionCount: 3, insertConflicts: true });
    const r = await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.born, '★二度目で増えた').toBe(0);
    expect(r.alreadyThere, '★「既に居た」を数えていない').toBeGreaterThan(0);
  });

  it('🔴 ③ ★年次カウンタの列を選んでいなければ投げる（★G-3・素通りさせない）', async () => {
    const { client } = fakeClient({ mareCount: 52, stallionCount: 3, dropCounterColumn: true });
    await expect(runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800))
      .rejects.toThrow(/bred_this_year/);
  });

  it('④ ★年の変わり目に、★年次カウンタを戻す', async () => {
    const { client, seen } = fakeClient({ mareCount: 1, mareRowsEmpty: true });
    const r = await runBreedingWeek(client, nowForWeek(52 * 7), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.yearReset, '★年の変わり目なのに戻していない').toBe(true);
    expect(seen.some((s) => s.startsWith('update horses set bred_this_year = false')),
      '★戻す SQL を投げていない').toBe(true);
  });

  it('🔴 ⑤ ★母をプレイヤーの配合が先に取っていたら、★入れた仔を消して「既に居た」と数える（★2026-09-22）', async () => {
    const { client, seen } = fakeClient({
      mareCount: 52, stallionCount: 3, draftsTable: true, damClaimedByPlayer: true,
    });
    const r = await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.born, '★取り合いに負けたのに生まれたと数えた').toBe(0);
    expect(r.alreadyThere, '★「既に居た」を数えていない').toBeGreaterThan(0);
    expect(seen.some((s) => s.startsWith('delete from horses where id = $1')),
      '★入れた仔を消していない（★母が年 2 回 産む）').toBe(true);
    expect(seen.some((s) => s.startsWith('update horses set coverings_this_year')),
      '★負けたのに父の種付を数えた').toBe(false);
    const claim = seen.find((s) => s.startsWith('update horses set bred_this_year = true')) ?? '';
    expect(claim, '★下書きの表が在るのに数えていない').toContain('foal_drafts');
  });

  it('★対照: ★下書きの表（★0061）が無い DB では、★表の名前を出さない（★いまの本番で落ちない）', async () => {
    const { client, seen } = fakeClient({ mareCount: 52, stallionCount: 3, draftsTable: false });
    const r = await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.born, '★取り合いが無いのに生まれていない').toBeGreaterThan(0);
    expect(seen.some((s) => s.includes('foal_drafts') && !s.includes('to_regclass')),
      '★表が無いのに foal_drafts を問い合わせた').toBe(false);
  });

  it('🔴 ★`runBreedingWeek` は ★取引に触らない（★`verify-breeding-live.mjs` が外から包んで必ず戻すため）', async () => {
    /**
     * ★2026-09-22 まで、この性質は ★`grep 'begin|commit|rollback' breeding-runner.ts` が 0 行、で裏付けていました。
     *   ★追いつき（`runBreedingCatchUp`）が週ごとに取引を張るようになり（★裁定 322d603 §4）、★その grep は使えません。
     *   → ★**関数の振る舞いで**確かめます（★名前ではなく、実際に投げた SQL）。
     */
    for (const o of [
      { mareCount: 52, stallionCount: 3 },
      { mareCount: 52, stallionCount: 3, draftsTable: true, damClaimedByPlayer: true },
    ] as FakeOptions[]) {
      const { client, seen } = fakeClient(o);
      await runBreedingWeek(client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      expect(seen.filter((s) => /^(begin|commit|rollback)$/i.test(s.trim())),
        '★runBreedingWeek が自分で取引を張った／閉じた').toEqual([]);
    }
  });

  describe('★仔の名付け（★PLAN I-3・裁定 REVIEW_I3_NAMING_VERDICT_20260922.md §1）', () => {
    const inserts = (seen: string[], params: unknown[][]) =>
      params.filter((_, i) => seen[i]?.includes('insert into horses'));
    const fakeWithParams = (o: FakeOptions) => {
      const f = fakeClient(o);
      const params: unknown[][] = [];
      const orig = (f.client as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query;
      const client = { query: (s: string, p?: unknown[]) => { params.push(p ?? []); return orig(s, p); } };
      return { client: client as never, seen: f.seen, params };
    };

    it('🔴 ★名前の乱数は遺伝の乱数と別の流れ: ★違う名前が付いても、★名前以外の全形質が 1 ビットも変わらない', async () => {
      const a = fakeWithParams({ mareCount: 52, stallionCount: 3 });
      await runBreedingWeek(a.client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      const insA = inserts(a.seen, a.params);
      expect(insA.length, '★仔が生まれていない（★比べられない）').toBeGreaterThan(0);
      // ★1 回目の名前を全部「使用済み」にして、★2 回目は必ず別の名前を引かせる
      const b = fakeWithParams({ mareCount: 52, stallionCount: 3, takenNames: insA.map((p) => String(p[2])) });
      await runBreedingWeek(b.client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      const insB = inserts(b.seen, b.params);
      expect(insB.length).toBe(insA.length);
      for (let i = 0; i < insA.length; i += 1) {
        const pa = insA[i] as unknown[];
        const pb = insB[i] as unknown[];
        expect(pb[2], '★対照: ★名前は違うはず（★使用済みにしたので）').not.toBe(pa[2]);
        // ★名前（$3）以外の全列（★id・遺伝子・素質・能力・適性・血統…）が一致
        expect([...pb.slice(0, 2), ...pb.slice(3)]).toEqual([...pa.slice(0, 2), ...pa.slice(3)]);
      }
    });

    it('★名前は世界の生成と同じ形（★厩舎の接頭辞 ＋ カタカナの音節）で、★旧来の「接頭辞 ＋ ID の 6 文字」ではない', async () => {
      const a = fakeWithParams({ mareCount: 52, stallionCount: 3 });
      await runBreedingWeek(a.client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      for (const p of inserts(a.seen, a.params)) {
        const name = String(p[2]);
        const id = String(p[0]);
        expect(name.endsWith(id.slice(0, 6)), `★旧来の名前: ${name}`).toBe(false);
        expect(name).toMatch(/[ァ-ー]/u);
      }
    });

    it('★`name_key` の列が在るときだけ書く（★0064 の前の DB で落ちない）', async () => {
      const without = fakeWithParams({ mareCount: 52, stallionCount: 3, nameKeyColumn: false });
      await runBreedingWeek(without.client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      expect(without.seen.some((s) => s.includes('insert into horses') && s.includes('name_key')),
        '★列が無いのに name_key を書いた').toBe(false);
      const withCol = fakeWithParams({ mareCount: 52, stallionCount: 3, nameKeyColumn: true });
      await runBreedingWeek(withCol.client, nowForWeek(312), EPOCH, () => {}, undefined, 'random', 13, 800);
      const ins = inserts(withCol.seen, withCol.params);
      expect(ins.length).toBeGreaterThan(0);
      for (const p of ins) {
        // ★$30 ＝ name_key（★正規化した名前）・$31 ＝ name_checked_with（★ハッシュ表が無いので null）
        expect(p[29]).toBe(normalizeName(String(p[2])));
        expect(p[30], '★検査していないのに版を書いた').toBeNull();
      }
    });
  });

  it('★年の途中では、★カウンタを戻さない', async () => {
    const { client } = fakeClient({ mareCount: 1, mareRowsEmpty: true });
    const r = await runBreedingWeek(client, nowForWeek(52 * 7 + 3), EPOCH, () => {}, undefined, 'random', 13, 800);
    expect(r.yearReset, '★年の途中で戻した').toBe(false);
  });
});
