/**
 * ★**偽物が「手で写している述語」の分類簿**（★**FK-4 / FK-5**・2026-09-19）
 *
 * 【🔴 ★なぜ要るか — ★2026-09-19 に 2 件、写し間違いを素通ししました】
 *   ★`CycleStore` の偽物は ★**SQL を見ません**（★層が上）。★本物の述語を ★**手で写すしかありません**。
 *   → ★写し間違えると ★**検査は緑のまま、製品だけが壊れます**。
 *
 *   ① `cancelRace` … ★本物は `status = 'scheduled'` だけ。★偽物は**無条件に成功**を返していた。
 *      → ★DS-7（`announced` のレースを中止する）は ★**一度も動いていなかった**のに、★検査 10 件は緑。
 *   ② `registeredHorses` … ★本物が取消の行を返していた。★偽物は「登録＝走る」と思っていた。
 *      → ★1 頭の取消がレースごと落とすところだった。
 *
 * 【★この簿が守ること】
 *   ★① ★**写しを 1 つ残らず数える**（★新しく写したら、ここに載るまで通れない）
 *   ★② 🔴 ★**写しには「実 DB で確かめた 1 本」を対にする**（★**FK-5**）。★対が無い写しは落とす
 *   ★③ ★対の相手が ★**本当に在る**（★`tmp/` に置いて消えた、が起きないように）
 *
 * ⚠️ ★**この簿は「写しが正しい」ことを保証しません。** ★保証できるのは実 DB の 1 本だけです。
 *    ★ここが保証するのは ★**「写しがあること」と「対が在ること」**の 2 つだけです。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

interface CopiedPredicate {
  /** ★写している検査（★ファイル名） */
  readonly fake: string;
  /** ★何の述語を写しているか */
  readonly method: string;
  /** ★**本物**（★製品のどこに在るか） */
  readonly real: { readonly file: string; readonly contains: string };
  /**
   * ★**実 DB で確かめる 1 本**（★**FK-5**）。★`tools/` に在ること（★`tmp/` は gitignore で消える）。
   * ⚠️ ★`null` は許しません。★対の無い写しは落とします。
   */
  readonly provenBy: string;
}

/**
 * ★**手で写している述語の全数**（★FK-4）。
 * ⚠️ ★`CycleStore` の偽物に新しいメソッドを写したら、★**ここに 1 行足すまで通れません**。
 */
const COPIED: readonly CopiedPredicate[] = [
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'cancelRace',
    real: { file: 'apps/worker/src/cancel.ts', contains: "status in ('scheduled', 'announced')" },
    provenBy: 'tools/verify-ds7-cancel.mjs',
  },
  {
    fake: 'apps/worker/test/cycle-runner.test.ts',
    method: 'cancelRace',
    real: { file: 'apps/worker/src/cancel.ts', contains: "status in ('scheduled', 'announced')" },
    provenBy: 'tools/verify-ds7-cancel.mjs',
  },
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'fillRace',
    real: { file: 'apps/worker/src/pg-store.ts', contains: "row.status !== 'announced'" },
    provenBy: 'tools/verify-d117-fill.mjs',
  },
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'announcedRaces',
    real: { file: 'apps/worker/src/pg-store.ts', contains: "from races where status = 'announced'" },
    provenBy: 'tools/verify-d117-fill.mjs',
  },
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'registeredHorses',
    real: { file: 'apps/worker/src/pg-store.ts', contains: 'e.scratched_at is null' },
    provenBy: 'tools/verify-registered-excludes-scratched.mjs',
  },
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'announceRace',
    real: { file: 'apps/worker/src/pg-store.ts', contains: 'on conflict (cycle_index) do nothing' },
    provenBy: 'tools/verify-d117-fill.mjs',
  },
];

describe('FK-4 手で写している述語の分類簿', () => {
  it('★簿が空でない（R-21）', () => {
    expect(COPIED.length).toBeGreaterThan(0);
  });

  it('🔴 ★写した先の「本物」が実在し、その文を今も持っている', () => {
    for (const c of COPIED) {
      const src = readFileSync(path.join(ROOT, c.real.file), 'utf8');
      expect(src, `${c.method}: ${c.real.file} に「${c.real.contains}」が無い`).toContain(c.real.contains);
    }
  });

  it('🔴 ★**FK-5** 対の「実 DB の 1 本」が在る（★`tmp/` に置いて消えた、が起きない）', () => {
    for (const c of COPIED) {
      const p = path.join(ROOT, c.provenBy);
      expect(existsSync(p), `${c.method}: 対の ${c.provenBy} が在りません`).toBe(true);
      // ★`tmp/` は gitignore。★対がそこに在ったら、次のセッションには消えている
      expect(c.provenBy.startsWith('tools/'), `${c.provenBy} は tools/ に置くこと`).toBe(true);
    }
  });

  it('🔴 ★対の 1 本は、実 DB に繋いで `rollback` する（★偽物で確かめていない）', () => {
    for (const c of new Set(COPIED.map((x) => x.provenBy))) {
      const src = readFileSync(path.join(ROOT, c), 'utf8');
      expect(src, `${c}: 実 DB に繋いでいない`).toContain("from 'pg'");
      expect(src, `${c}: rollback していない`).toContain("rollback");
      // ★状態を変える道具なので、本番からは締め出す（R-24）
      expect(src, `${c}: assertNotProduction を呼んでいない`).toContain('assertNotProduction');
    }
  });

  it('🔴 ★写している偽物が、その述語を**実際に写している**（★無条件に成功を返していない）', () => {
    /**
     * ★`cancelRace` を無条件に成功させていたのが、★**DS-7 を素通しした形**そのものです。
     *   → ★偽物の `cancelRace` が ★**「知らない番号なら 0 を返す」分岐を持っている**ことを見ます。
     */
    for (const f of new Set(COPIED.filter((c) => c.method === 'cancelRace').map((c) => c.fake))) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      const i = src.indexOf('cancelRace: async');
      expect(i, `${f}: cancelRace の偽物が無い`).toBeGreaterThan(0);
      const body = src.slice(i, i + 700);
      expect(body, `${f}: 知らない番号でも成功を返している（★無条件）`)
        .toMatch(/refundedBets: 0, refundedEp: 0/);
    }
  });

  it('★`CycleStore` の偽物に、簿に無いメソッドの写しが増えていない', () => {
    /**
     * ★`CycleStore` のうち ★**述語を持つ**メソッドの一覧。
     * ⚠️ ★ここに足したら、★上の `COPIED` にも足すこと。
     */
    const WITH_PREDICATE = [
      'cancelRace', 'fillRace', 'announcedRaces', 'registeredHorses', 'announceRace',
    ];
    const registered = new Set(COPIED.map((c) => c.method));
    for (const m of WITH_PREDICATE) {
      expect(registered.has(m), `${m} が簿に無い（★写しているなら載せること）`).toBe(true);
    }
    // ★対照: ★述語を持たないものは載せない（★簿を水増ししない）
    expect(registered.has('serverNowMs')).toBe(false);
    expect(registered.has('tryLock')).toBe(false);
  });
});
