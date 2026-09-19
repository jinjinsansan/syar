/**
 * ★**偽の DB が、製品の述語を「守る」か「無視する」かを、★必ずどちらかに決めさせる**
 * （★**FK-6**・2026-09-19・裁定 `REVIEW_IGNORED_PREDICATE_VERDICT_20260919.md`）
 *
 * 【🔴 ★なぜ「欄を足すだけ」では足りないか】
 *   ★FK-4 で数えたのは ★**偽物が「写している」述語**でした。
 *   ✔ ★掃き出したら、★**もう 1 つの形**がありました — ★**製品の `where` を見ずに行を返す**。
 *   ★`payout.test.ts` は `status = 'pending'` を見ておらず、
 *   ★**`payout.ts` からその句を消しても検査は緑のまま**でした（★＝二重払戻が通る）。
 *
 *   🔴 ★1 回 掃き出して直しても、★**次に述語が増えたとき、また黙って無視されます。**
 *   → ★★**この検査が、そのとき落ちます。**
 *
 * 【★決め方】
 *   ★`honors` … ★偽物が ★**製品の SQL にその句が在るかを読んで、振る舞いを変える**
 *     （★`entry-to-settle.test.ts` の `SCRATCH_CLAUSE` が手本。★**写さない**ので写し間違いが起きない）
 *   ★`ignores` … ★偽物は真似しない。★**それでよい理由を書く**
 *
 * ⚠️ ★**`ignores` 自体は悪くありません。** ★偽物が製品の全部を真似る必要はない。
 *    🔴 ★**悪いのは「どちらでもない」状態**です — ★誰も決めていないので、消えても気づけません。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/**
 * ★**偽物が、製品の述語をどう扱っているか**（★FK-6）。
 *
 * | `honors`   | ★偽物が **SQL にその句が在るかを読んで、振る舞いを変える**（★いちばん強い） |
 * | `asserted` | ★偽物は読まないが、★**製品の文面にその句が在ることを表明**している（★消えたら落ちる） |
 * | `ignores`  | ★どちらもしない。★**それでよい理由を書く** |
 *
 * ⚠️ ★`asserted` は ★**消えたことは捕まえますが、振る舞いは確かめていません。**
 *    ★`honors` に上げられるなら上げるのが良い（★`payout` はそうしました）。
 */
type Stance = 'honors' | 'asserted' | 'ignores';

interface Pairing {
  /** ★偽の DB を持つ検査 */
  readonly fake: string;
  /** ★その偽物が真似ている製品 */
  readonly product: string;
  /** ★製品の SQL に在る述語 → ★守るか無視するか */
  readonly stance: Readonly<Record<string, Stance>>;
  /** ★`ignores` にした理由（★まとめて 1 つ） */
  readonly whyIgnored: string;
}

/**
 * ★**偽の DB と製品の対応**（★FK-6）。
 * ⚠️ ★新しい偽の DB を書いたら、★**ここに 1 組 足すまで通れません**（★下の「全数」の検査）。
 */
const PAIRINGS: readonly Pairing[] = [
  {
    fake: 'apps/worker/test/payout.test.ts',
    product: 'apps/worker/src/payout.ts',
    stance: {
      // 🔴 ★これを無視していたのが FK-4 の発見（★二重払戻が通る）
      "status = 'pending'": 'honors',
      // ★以下は**書き込み側**の値。★偽物は書き込みを記録するだけなので、真似る対象ではない
      "status = 'won'": 'ignores',
      "status = 'lost'": 'ignores',
      "status = 'refunded'": 'ignores',
    },
    whyIgnored: '★`won`/`lost`/`refunded` は **update が書く値**であって、★行を絞る述語ではない。'
      + '★偽物は書き込みを `writes` に積んで検査が中身を見るので、★真似る必要がない。',
  },
  {
    fake: 'apps/worker/test/entry-freeze.test.ts',
    product: 'apps/worker/src/entry-freeze.ts',
    stance: {
      'e.scratched_at is null': 'honors',
      'e.entrant_snapshot is null': 'honors',
      "r.status = 'scheduled'": 'ignores',
    },
    whyIgnored: '★`r.status = \'scheduled\'` は「どのレースを対象にするか」の絞りで、'
      + '★偽物は**対象のレースを 1 つだけ**持つ（★絞る余地が無い）。'
      + '⚠️ ★複数のレースを持つ偽物にしたら、★`honors` に変えること。',
  },
  {
    fake: 'apps/worker/test/market-flow.test.ts',
    product: 'apps/worker/src/market-flow.ts',
    stance: {
      // ★偽物は読まないが、★**製品の文面に在ることを表明**している（`expect(SRC).toMatch(...)`）
      'h.owner_id is null': 'asserted',
      'h.npc_stable_id is not null': 'asserted',
      'h.retired_at_week is null': 'asserted',
      'e.finish_pos is not null': 'asserted',
      'e.prize_pp is not null': 'ignores',
    },
    whyIgnored: '★`e.prize_pp is not null` は**価格の材料**を引く側で、'
      + '★候補の集合（`CANDIDATE_WHERE`）を決める述語ではない。★MK-1 で数えたのは候補の側。',
  },
  {
    fake: 'apps/worker/test/story-flow.test.ts',
    product: 'apps/worker/src/story-flow.ts',
    stance: { 'e.finish_pos is not null': 'honors' },
    whyIgnored: '★（無視しているものはありません）',
  },
  {
    fake: 'apps/worker/test/training-runner-skip.test.ts',
    product: 'apps/worker/src/training-runner.ts',
    stance: {
      // ★偽物は行を配列で持ち `where` を真似ない。★**製品の文面で見張る**形にした（FK-6）
      'retired_at_week is null': 'asserted',
      'birth_week is not null': 'asserted',
    },
    whyIgnored: '★（無視しているものはありません）',
  },
  {
    fake: 'apps/worker/test/grade-flow.test.ts',
    product: 'apps/worker/src/grade-flow.ts',
    stance: {},
    whyIgnored: '★製品の SQL に、この形の述語がありません（★0 件）。'
      + '⚠️ ★**0 件であること自体を、下の検査が見ています**（★R-21: 0 を「該当なし」と読まない）。',
  },
];

/** ★製品の SQL（★テンプレート文字列のうち select/insert/update/delete を含むもの）から述語を拾う */
function predicatesOf(productPath: string): string[] {
  let src = readFileSync(path.join(ROOT, productPath), 'utf8');
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const out = new Set<string>();
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const sql = m[1] ?? '';
    if (!/\b(select|insert|update|delete)\b/i.test(sql)) continue;
    const clean = sql.replace(/--[^\n]*/g, ' ');
    for (const p of clean.matchAll(/\b((?:\w+\.)?\w+)\s+(is\s+not\s+null|is\s+null|=\s*'[^']{1,30}')/gi)) {
      out.add(`${p[1]} ${p[2]!.replace(/\s+/g, ' ').toLowerCase()}`);
    }
  }
  return [...out].sort();
}

describe('FK-6 偽の DB が製品の述語をどう扱うか（全数）', () => {
  it('★簿が空でない（R-21）', () => {
    expect(PAIRINGS.length).toBeGreaterThan(0);
  });

  it('🔴 ★製品に在る述語は、すべて honors か ignores のどちらかに入っている', () => {
    const missing: string[] = [];
    for (const p of PAIRINGS) {
      for (const pred of predicatesOf(p.product)) {
        if (p.stance[pred] === undefined) missing.push(`${p.product}: 「${pred}」（${p.fake} で未分類）`);
      }
    }
    expect(missing.join('\n'), '★どちらでもない述語があります（★消えても気づけません）').toBe('');
  });

  it('★簿に、製品にもう無い述語が残っていない（★簿が現実より古くならない）', () => {
    const stale: string[] = [];
    for (const p of PAIRINGS) {
      const real = new Set(predicatesOf(p.product));
      for (const pred of Object.keys(p.stance)) {
        if (!real.has(pred)) stale.push(`${p.product}: 「${pred}」はもう製品にありません（${p.fake}）`);
      }
    }
    expect(stale.join('\n'), '★簿が古くなっています').toBe('');
  });

  it('🔴 ★`honors` と書いたなら、★偽物がその句を**実際に読んでいる**', () => {
    /**
     * ⚠️ ★`honors` / `asserted` は**主張**です。★主張だけなら、★写し間違いと同じ穴が開きます。
     *    → ★**偽物の本文に、その句の文字列が在ること**を見ます。
     *      ★（★`sql.includes(...)` で読むにせよ、★`expect(SRC).toMatch(...)` で表明するにせよ、
     *       ★**必ず本文に在ります**）
     *
     * 🔴 ⚠️ ★**この検査は `honors` と `asserted` を見分けられません**（★どちらも本文に在るだけ）。
     *    ★見分けは ★**人が付ける札**です。★札を偽れば通ります。
     *    → ★**この検査が守るのは「どちらでもない（＝誰も見ていない）」を作らせないこと**だけです。
     *      ★それでも十分です — ★2026-09-19 に見つけた 3 件は、すべて「どちらでもない」でした。
     */
    const lying: string[] = [];
    for (const p of PAIRINGS) {
      const fakeSrc = readFileSync(path.join(ROOT, p.fake), 'utf8');
      for (const [pred, stance] of Object.entries(p.stance)) {
        if (stance === 'ignores') continue;
        /**
         * ⚠️ ★**別名（`e.` / `h.`）は外して照らします。**
         *    ★偽物は `sql.includes('entrant_snapshot is null')` のように ★**別名なしで書く**ことがあり、
         *    ★別名つきで照らすと ★**読んでいるのに「嘘だ」と言ってしまいます**
         *    （★2026-09-19 に実際に出ました）。
         */
        const bare = pred.replace(/^\w+\./, '');
        const col = bare.split(' ')[0]!;
        if (!fakeSrc.includes(col)) {
          lying.push(`${p.fake}: 「${pred}」を ${stance} と書いたが、本文に ${col} が無い`);
        }
      }
    }
    expect(lying.join('\n'), '★honors / asserted が主張だけになっています').toBe('');
  });

  it('★`ignores` があるなら、理由が書いてある（★「調査中」は理由ではない）', () => {
    for (const p of PAIRINGS) {
      const hasIgnored = Object.values(p.stance).includes('ignores');
      if (!hasIgnored) continue;
      expect(p.whyIgnored.length, `${p.fake}: ignores の理由が短すぎます`).toBeGreaterThan(20);
    }
  });

  it('🔴 ★pg の偽の DB を持つ検査は、すべて簿に載っている（★載せずに逃げられない）', () => {
    /**
     * ⚠️ ★`entry-to-settle.test.ts` と `course-frozen-wiring.test.ts` は `pg-store.ts` を真似ますが、
     *    ★`pg-store.ts` は巨大で、★**それぞれが触る部分が違います**。
     *    → ★この 2 本は ★**`copied-predicates.test.ts`（FK-4/FK-5）の側**で見ています。
     *    ★ここで二重に登録すると、★どちらを直せばよいか分からなくなります。
     */
    const COVERED_ELSEWHERE = [
      'apps/cli/test/entry-to-settle.test.ts',
      'apps/worker/test/course-frozen-wiring.test.ts',
      'apps/worker/test/cancel-accepts-announced.test.ts',
    ];
    const registered = new Set([...PAIRINGS.map((p) => p.fake), ...COVERED_ELSEWHERE]);
    const FAKES = [
      'apps/cli/test/entry-to-settle.test.ts',
      'apps/worker/test/course-frozen-wiring.test.ts',
      'apps/worker/test/entry-freeze.test.ts',
      'apps/worker/test/grade-flow.test.ts',
      'apps/worker/test/market-flow.test.ts',
      'apps/worker/test/payout.test.ts',
      'apps/worker/test/story-flow.test.ts',
      'apps/worker/test/training-runner-skip.test.ts',
    ];
    const unregistered = FAKES.filter((f) => !registered.has(f));
    expect(unregistered.join('\n'), '★簿に無い偽の DB があります').toBe('');
  });
});
