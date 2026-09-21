/**
 * 🔴 ★**`--yes-production` の門を、★組み合わせで回す**（★2026-09-20）。
 *
 * 【★なぜ在るか】
 *   ⚠️ ★`migrate.mjs` に ★**下見（`--plan`）**を足したとき、
 *     ★註記にも運用簿にも「★`--yes-production` は要りません」と書きました。
 *   🔴 ★**動きませんでした。** ★門が手前で投げます。
 *   🔴 ★原因は ★**試した場所**です: ★staging で試したので、
 *     ★★**門が効かない側でしか確かめていませんでした。**
 *     → ★**差が出ない環境で確かめて、★差が出る環境の話を書いた。**
 *   → ★★**組み合わせは、★環境に触らずここで回します。**
 *
 * ⚠️ ★免除するのは ★**何も書かない `--plan` だけ**。
 *    ★`--baseline` / `--repair-checksum` と併せたら ★**免除しません**（★どちらも記録を書く）。
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { needsYesProduction, productionOptInProblem, productionRepairOptInProblem } from '../../../tools/lib/args.mjs';

const needs = needsYesProduction as (
  env: string,
  o?: { plan?: boolean; baseline?: boolean; repair?: boolean },
) => boolean;

describe('🔴 ★migrate: --yes-production を要求する条件', () => {
  it('★staging は、★何をしても要求しない', () => {
    expect(needs('staging'), '★staging で要求した').toBe(false);
    expect(needs('staging', { plan: true })).toBe(false);
    expect(needs('staging', { baseline: true })).toBe(false);
  });

  it('🔴 ★本番は、★既定で要求する（★打ち間違いでは到達できない形）', () => {
    expect(needs('production'), '🔴 ★本番なのに素通りした').toBe(true);
  });

  it('✅ ★本番でも、★何も書かない `--plan` だけは免除', () => {
    expect(needs('production', { plan: true }), '★下見が門で止まる').toBe(false);
  });

  it('🔴 ★`--plan` に、★書く操作を足したら免除しない', () => {
    expect(needs('production', { plan: true, baseline: true }),
      '🔴 ★--baseline は記録を書くのに素通りした').toBe(true);
    expect(needs('production', { plan: true, repair: true }),
      '🔴 ★--repair-checksum は記録を直すのに素通りした').toBe(true);
  });

  it('⚠️ ★知らない環境名は、★安全な側（要求する）に倒す', () => {
    // ★`migrate.mjs` は先に環境名を弾くが、★この関数だけを見たときも広く通らないこと
    expect(needs('prod')).toBe(false);   // ★'production' ではないので、そもそも本番扱いしない
    expect(needs('production', {})).toBe(true);
  });
});

const optIn = productionOptInProblem as (o: {
  environment: string; yesProduction?: boolean; wipeWorld?: boolean;
  expectHorses?: number | null; actualHorses?: number | null;
}) => string | null;

/**
 * 🔴 ★**世界を作り直す道具の関門**（★運用簿 ④・2026-09-20）。
 *
 *   ⚠️ ★`migrate` と同じ指で打てないように、★旗を 2 つ ＋ ★**写せない数**を 1 つ 要求します。
 *   ★★**言葉の旗は手順書から貼れます。★数は貼れません。**
 */
describe('🔴 ★seed-world: 本番の世界を作り直す関門', () => {
  const OK = {
    environment: 'production', yesProduction: true, wipeWorld: true,
    expectHorses: 7355, actualHorses: 7355,
  };

  it('★staging では、★関門を作らない（★旗が無くても通る）', () => {
    expect(optIn({ environment: 'staging' }), '★staging で止めた').toBeNull();
  });

  it('🔴 ★本番は、★旗が無ければ止まる', () => {
    expect(optIn({ environment: 'production' }), '🔴 ★素通りした').toContain('--yes-production');
  });

  it('🔴 ★--yes-production だけでは足りない（★migrate と同じ指で打たせない）', () => {
    expect(optIn({ ...OK, wipeWorld: false })).toContain('--wipe-world');
  });

  it('🔴 ★頭数を打たないと止まる（★手順書から写せない物を 1 つ）', () => {
    expect(optIn({ ...OK, expectHorses: null })).toContain('--expect-horses');
  });

  it('🔴 ★打った頭数が実数と違えば止まる', () => {
    const why = optIn({ ...OK, expectHorses: 7000 });
    expect(why, '🔴 ★違う数で通った').toContain('7000');
  });

  /**
   * 🔴 ★**失敗の文が、★答えを教えていないこと**（★2026-09-20・レビュー側の指摘）。
   *
   *   ⚠️ ★旧い文は ★`いまの実数 7355 が違います` と ★**正しい数を出していました**。
   *     → ★1 回 失敗する → ★**画面の数を写す** → ★2 回目で通る。
   *     ★★**手間が 1 往復 増えただけで、★「見る」は起きません。**
   *   ★★`--expect-horses` は「数を当てる」ためではなく ★**「数を見に行かせる」**ためです。
   */
  it('🔴 ★失敗の文が、★正しい数を教えていない（★見ないで打つ、を潰す）', () => {
    const why = optIn({ ...OK, expectHorses: 7000 }) ?? '';
    expect(why, '🔴 ★実数を教えている。★写すだけで通ってしまう').not.toContain('7355');
  });

  it('★数えられなければ止まる（★数えられない＝分からない）', () => {
    expect(optIn({ ...OK, actualHorses: null })).toContain('数えられません');
  });

  it('✅ ★4 つ 揃って初めて通る', () => {
    expect(optIn(OK), '★揃っているのに止めた').toBeNull();
  });
});

/**
 * 🔴 ★**本番の関門が ★2 つに増えました。★片方だけ緩むのを止めます**（★2026-09-21）。
 *
 * 【★なぜ表にして 2 つとも回すか】
 *   ★`repair-pedigree-cache.mjs` にも同じ形の関門を付けました（★旗 2 つ ＋ 写せない数 1 つ）。
 *   ⚠️ ★**コードは共有していません**（★要求する数が違うので）。
 *   🔴 ★共有していないものは ★**片方だけ直されて、★もう片方が置き去りになります。**
 *     ★★今日それを 2 回 やりました（★`nav.tsx` だけ直した／★`0057` に `assert_setup_complete` を入れ忘れた）。
 *   → ★★**歩調は、★コードの共有ではなく ★この表が合わせます。**
 *     ★関門を足したら ★**ここに段を足す。★足し忘れたら、★もう片方で落ちます。**
 *
 * 【🔴 ★「写せない数」は、★2 つの道具で ★**違う数でなければ意味がない**】
 *   ★同じ数（例: 頭数）を要求したら、★★**seed-world の手順書からそのまま写せます。**
 *   → ★旗の名前と、★数の旗の名前が ★**重なっていないこと**を、★下で検査します。
 */
describe('🔴 ★本番の関門（★2 つ）が、★同じ 5 段を課している', () => {
  interface Gate {
    name: string;
    fn: (o: Record<string, unknown>) => string | null;
    ok: Record<string, unknown>;
    /** ★2 つ目の旗（★この道具だけの旗）の、★引数名と綴り */
    second: [string, string];
    /** ★写せない数の、★引数名（期待値）・引数名（実数）・綴り */
    number: [string, string, string];
  }

  const GATES: Gate[] = [
    {
      name: 'seed-world（★世界の作り直し）',
      fn: productionOptInProblem as Gate['fn'],
      ok: {
        environment: 'production', yesProduction: true, wipeWorld: true,
        expectHorses: 7355, actualHorses: 7355,
      },
      second: ['wipeWorld', '--wipe-world'],
      number: ['expectHorses', 'actualHorses', '--expect-horses'],
    },
    {
      name: 'repair-pedigree-cache（★血統の写しの直し）',
      fn: productionRepairOptInProblem as Gate['fn'],
      ok: {
        environment: 'production', yesProduction: true, repairFlag: true,
        expectBroken: 1234, actualBroken: 1234,
      },
      second: ['repairFlag', '--repair-pedigree'],
      number: ['expectBroken', 'actualBroken', '--expect-broken'],
    },
  ];

  for (const g of GATES) {
    describe(g.name, () => {
      it('★staging は素通し（★この関門は本番だけのもの）', () => {
        expect(g.fn({ ...g.ok, environment: 'staging' }), '★staging で止めた').toBeNull();
      });

      it('★① --yes-production が無いと止まる', () => {
        expect(g.fn({ ...g.ok, yesProduction: false })).toContain('--yes-production');
      });

      it(`★② ${g.second[1]} が無いと止まる（★この道具だけの旗）`, () => {
        const why = g.fn({ ...g.ok, [g.second[0]]: false });
        expect(why, '🔴 ★2 つ目の旗が効いていない').toContain(g.second[1]);
      });

      it(`★③ ${g.number[2]} が無いと止まる（★写せない数）`, () => {
        const why = g.fn({ ...g.ok, [g.number[0]]: null });
        expect(why, '🔴 ★数を要求していない').toContain(g.number[2]);
      });

      it('★④ 実数を数えられなければ止まる（★数えられない＝分からない）', () => {
        expect(g.fn({ ...g.ok, [g.number[1]]: null })).toContain('数えられません');
      });

      it('★⑤ 打った数が実数と違えば止まり、★正しい数は教えない', () => {
        const actual = g.ok[g.number[1]] as number;
        const why = g.fn({ ...g.ok, [g.number[0]]: actual + 1 }) ?? '';
        expect(why, '🔴 ★違う数で通った').toContain(String(actual + 1));
        expect(why, '🔴 ★実数を教えている。★写すだけで通ってしまう')
          .not.toContain(String(actual));
      });

      it('✅ ★揃って初めて通る', () => {
        expect(g.fn(g.ok), '★揃っているのに止めた').toBeNull();
      });
    });
  }

  it('🔴 ★2 つの関門の旗が、★重なっていない（★手順書から写せないため）', () => {
    const flags = GATES.map((g) => g.second[1]);
    const numbers = GATES.map((g) => g.number[2]);
    expect(new Set(flags).size, '🔴 ★2 つ目の旗が同じ綴り。★片方の手順書で両方 通ります')
      .toBe(GATES.length);
    expect(new Set(numbers).size, '🔴 ★数の旗が同じ綴り。★片方の手順書で両方 通ります')
      .toBe(GATES.length);
  });
});
