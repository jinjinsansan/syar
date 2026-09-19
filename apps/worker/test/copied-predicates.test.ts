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
  /**
   * 🔴 ★**2026-09-19・全数分類の検査を入れた瞬間に見つかりました**（★手の一覧には無かった）。
   *   ★偽物は `announcedSet.has(i) ? {...} : null` — ★これは `status = 'announced'` の写しです。
   *   ★述語の中身は ★**組成が済んだら読めなくなる**こと。★落とすと二度目の組成に入ります。
   */
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'announcedConditions',
    real: { file: 'apps/worker/src/pg-store.ts', contains: "where cycle_index = $1 and status = 'announced'" },
    provenBy: 'tools/verify-d117-fill.mjs',
  },
  /**
   * 🔴 ★同上。★偽物は `done.has(i) || announcedSet.has(i)` — ★**どちらの段でも真**。
   *   ★これは「本物に status の条件が**無い**」ことの写しです。★"無い" も写しです。
   *   ★もし本物が `status = 'scheduled'` で絞ったら、★公示済みの番号をもう一度 公示します。
   */
  {
    fake: 'apps/worker/test/d117-two-phase-loop.test.ts',
    method: 'raceExists',
    real: { file: 'apps/worker/src/pg-store.ts', contains: 'select count(*)::text as n from races where cycle_index = $1' },
    provenBy: 'tools/verify-d117-fill.mjs',
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

  /**
   * ★**`CycleStore` の全メソッドを分類する**（★**FK-4 の「全数」・FK-5 の仕上げ**・2026-09-19）
   *
   * 【🔴 ★なぜ書き直したか】
   *   ★ここには `WITH_PREDICATE` という ★**手で書いた 5 個の一覧**がありました。
   *   ★それ自体が ★**もう 1 つの手写し**です — ★新しいメソッドが増えても、
   *   ★一覧に足さなければ ★**黙って通ります**。★簿を守る道具が、簿と同じ壊れ方をしていました。
   *   ✔ ★実際に足りていませんでした: ★`announcedConditions` は偽物が
   *     ★`status = 'announced'` を写しているのに、★一覧にも簿にもありませんでした。
   *
   * 【★どう変えるか】★**`interface CycleStore` から機械に数えさせます。**
   *   → ★メソッドが 1 つ増えたら、★**分類するまで通れません**。
   *
   * 【★3 つの分類】★どれか 1 つに必ず入ります（★`pinned-migration-tests` と同じ形）
   *   ★**copied** … ★偽物が述語を写している → ★`real` と ★`provenBy`（実 DB の 1 本）が要る
   *   ★**stub** … ★偽物が定数を返すだけ（★その検査はその述語に依存しない）→ ★理由が要る
   *   ★**noPredicate** … ★本物に述語が無い → ★**機械が本物を見て確かめます**
   */
  const REAL_IMPL = 'apps/worker/src/pg-store.ts';

  /** ★`interface CycleStore` から、メソッド名を**機械に数えさせる** */
  function interfaceMethods(): readonly string[] {
    const src = readFileSync(path.join(ROOT, 'apps/worker/src/cycle-runner.ts'), 'utf8');
    const at = src.indexOf('export interface CycleStore');
    expect(at, '★`interface CycleStore` が見つからない').toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf('\n}', at))
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    return [...body.matchAll(/(\w+)\s*\([^)]*\)\s*:\s*Promise/g)].map((m) => m[1]!);
  }

  /** ★本物の実装の中身（★次の `async` まで）。★註記と SQL のコメントは剥がす */
  function realBody(method: string): string {
    const src = readFileSync(path.join(ROOT, REAL_IMPL), 'utf8');
    const at = src.search(new RegExp(`async ${method}\\s*\\(`));
    if (at < 0) return '';
    const next = src.indexOf('\n    async ', at + 5);
    return src.slice(at, next > 0 ? next : src.length)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');
  }

  /**
   * ★**述語を持たない**と宣言したメソッド。
   * 🔴 ★宣言は ★**機械が本物を見て確かめます**（★`where` / `on conflict` が出たら落ちます）。
   */
  const NO_PREDICATE: Readonly<Record<string, string>> = {
    serverNowMs: '★`select now()`。★行を選んでいない',
    tryLock: '★advisory lock。★表を見ていない',
    unlock: '★advisory unlock。★表を見ていない',
    createRace: '★D-117 の経路では呼ばれない（★`announceRace` ＋ `fillRace` に分かれた）',
  };

  /**
   * ★**偽物が定数を返すだけ**のメソッド（★その検査はこの述語に依存しない）。
   * ⚠️ ★「写していない」ので ★`provenBy` は要りません。★代わりに ★**依存していないこと**を見ます。
   */
  const STUBBED: Readonly<Record<string, string>> = {
    pendingSettlements: '★D-117 の 2 段ループの検査では確定を回さない（★`[]` 固定）。★確定は `settle.test.ts` が実 DB で見る',
    settleRace: '★同上。★偽物は呼ばれたことだけ数える',
    overdueRaces: '★中止の期限は `overdueBefore()`（純関数）が持ち、★`cycle.test.ts` が両側を押さえる（R-2）',
  };

  it('🔴 ★★`CycleStore` の全メソッドが、3 つのどれかに分類されている（★全数）', () => {
    const methods = interfaceMethods();
    expect(methods.length, '★インタフェースからメソッドが拾えていない（R-21）').toBeGreaterThan(5);
    const copied = new Set(COPIED.map((c) => c.method));
    const unclassified = methods.filter(
      (m) => !copied.has(m) && NO_PREDICATE[m] === undefined && STUBBED[m] === undefined,
    );
    expect(
      unclassified,
      '🔴 ★分類されていないメソッドがあります。★COPIED / STUBBED / NO_PREDICATE のどれかに載せてください',
    ).toEqual([]);
    /** ★対照: ★簿にあってインタフェースに無い名前を残さない（★消えた写しを数え続けない） */
    const known = new Set(methods);
    for (const m of [...copied, ...Object.keys(NO_PREDICATE), ...Object.keys(STUBBED)]) {
      expect(known.has(m), `${m} は CycleStore にありません（★簿に残骸が残っている）`).toBe(true);
    }
  });

  it('🔴 ★「述語が無い」の宣言を、★**機械が本物で確かめる**（★宣言が腐らない）', () => {
    for (const [m, why] of Object.entries(NO_PREDICATE)) {
      const body = realBody(m);
      if (body === '') continue; // ★本物が別ファイルに在るものは次の検査が見る
      expect(body.toLowerCase(), `🔴 ${m}: ★「述語が無い」と宣言しているのに where があります（${why}）`)
        .not.toContain('where');
      expect(body.toLowerCase(), `🔴 ${m}: ★「述語が無い」と宣言しているのに on conflict があります`)
        .not.toContain('on conflict');
    }
  });

  it('🔴 ★「写している」の宣言も、★**本物に述語が在ること**で確かめる', () => {
    /**
     * ⚠️ ★逆向きの検査です。★`COPIED` に載せたのに本物に述語が無ければ、
     *    ★**写す相手が消えている**（★写しだけが残る）ことになります。
     */
    for (const c of COPIED) {
      const src = readFileSync(path.join(ROOT, c.real.file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ');
      const hasPredicate = /where|on conflict/i.test(src);
      expect(hasPredicate, `${c.method}: ${c.real.file} に述語がありません（★写す相手が消えた）`).toBe(true);
    }
  });

  it('★`stub` と宣言したものは、★偽物が**引数で分岐していない**（★写していない）', () => {
    /**
     * ⚠️ 🔴 ★**「引数を取るか」で見てはいけません**（★2026-09-19 にこれで誤検出しました）。
     *    ★`settleRace: async (i) => { settleLog.push(i); }` は ★**引数を記録しているだけ**で、
     *    ★述語を写していません。★これを「写し」と呼ぶと、★簿が水増しされます。
     * → ★見るのは ★**引き当て・分岐**（`.has(` `.get(` `.find(` `?` `if` `===`）です。
     *    ★`raceExists: async (i) => done.has(i) || announcedSet.has(i)` は ★**これに当たります**。
     */
    const LOOKUP = /\.(has|get|find|filter|some|every)\(|\?|\bif\s*\(|===|!==/;
    const fakes = [...new Set(COPIED.map((c) => c.fake))];
    let checked = 0;
    for (const f of fakes) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of Object.keys(STUBBED)) {
        const at = src.indexOf(`${m}: async`);
        if (at < 0) continue;
        checked += 1;
        /** ★`=> {` なら波括弧で、そうでなければ行末までを中身とみなす */
        const arrow = src.indexOf('=>', at);
        /**
         * ⚠️ ★ここで `src.slice(arrow, arrow + 6)` と覗くと ★**CK-3 の番人に引っかかります**
         *    （★「切り出したのに、切り出せたことを確かめていない」）。★切り出さずに位置で見ます。
         */
        const firstBrace = src.indexOf('{', arrow);
        const brace = firstBrace >= 0 && firstBrace - arrow <= 4;
        let body: string;
        if (brace) {
          const open = src.indexOf('{', arrow);
          let d = 0; let close = open;
          for (let i = open; i < src.length; i += 1) {
            if (src[i] === '{') d += 1;
            else if (src[i] === '}') { d -= 1; if (d === 0) { close = i; break; } }
          }
          body = src.slice(open + 1, close);
        } else {
          const eol = src.indexOf(String.fromCharCode(10), arrow);
          body = src.slice(arrow, eol);
        }
        expect(
          LOOKUP.test(body),
          `🔴 ${f} の ${m} は引数で引き当て／分岐しています（★stub ではなく写しです。★COPIED に移してください）: ${body.trim().slice(0, 120)}`,
        ).toBe(false);
      }
    }
    /** ★対照: ★1 つも見ていないのに緑になっていない（R-21） */
    expect(checked, '★`stub` の偽物が 1 つも見つからない（★切り出しが壊れている）').toBeGreaterThan(2);
  });

  it('★分類の理由が空でない（★載せるだけにしない）', () => {
    for (const [m, why] of Object.entries({ ...NO_PREDICATE, ...STUBBED })) {
      expect(why.length, `${m}: 理由が空`).toBeGreaterThan(10);
    }
  });
});
