/**
 * ★**出走可能な馬を読み直す**（★**EN-4 ②**・2026-09-19）
 *   ★裁定 `REVIEW_ENTRY_GUARDS_VERDICT_20260919.md` §4
 *
 * 【🔴 ★何を見ているか】
 *   ★プールは ★**起動時に 1 回だけ**読まれていました。
 *   ★`loadRaceablePool` の `where` は ★**「ワーカーが起動した瞬間の真実」**でしかなく、
 *   → ★★**時間が経つだけで、機構が効かなくなります**（★R-16 の親戚。★誰の操作も要りません）:
 *     ★① `retired_at_week is null`（CL-3）／★② `owner_id is null`（EN-1）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**読み直しが消える**（★`const pool` のまま、ループの外だけ）
 *   ② 🔴 ★**毎周読む**（★DB を無駄に叩く。★週送りが無い周は 1 ビットも変わらない）
 *   ③ 🔴 ★**失敗を黙る**（★古いプールで走り続けていることに誰も気づかない）
 *   ④ 🔴 ★**`where` から条件が消える**（★CL-3 と EN-1 がプールの側で効いている）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
/** ⚠️ ★註記を落としてから見ます（★CK-1 の家族） */
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const MAIN = strip(readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8'));
const REPO = strip(readFileSync(path.join(ROOT, 'apps/worker/src/horse-repo.ts'), 'utf8'));

describe('★EN-4 ②: 週送りの後に読み直す', () => {
  it('★走査が空振りしていない（R-21）', () => {
    expect(MAIN.length).toBeGreaterThan(5000);
    expect(MAIN, '★起動時の読み込みが無い').toMatch(/const pool = await loadRaceablePool\(client\)/);
  });

  it('🔴 ① ★ループの中でも読み直している', () => {
    const decl = 'const pool = await loadRaceablePool(client)';
    const first = MAIN.indexOf(decl);
    /** ⚠️ ★**宣言そのものを跨いで**探します（★同じ 1 行を「2 回目」と数えない） */
    const again = MAIN.indexOf('loadRaceablePool(client)', first + decl.length);
    expect(again, '🔴 ★読み直しが 1 か所しかない（★起動時だけ）').toBeGreaterThan(-1);
    /** ★中身を入れ替えている（★`buildRace` に渡す参照を保つ） */
    expect(MAIN, '★中身を入れ替えていない').toMatch(/pool\.length = 0/);
    expect(MAIN, '★引数の数に上限のある形で入れ直している').not.toMatch(/pool\.push\(\.\.\./);
  });

  it('🔴 ② ★週送りが進んだときだけ読み直す（★毎周ではない）', () => {
    /**
     * ★引退も購入も繁殖も ★**週送りで起きます**。
     * ⚠️ ★毎周読むと DB を無駄に叩き、★週送りが無かった周は 1 ビットも変わりません。
     */
    const decl = 'const pool = await loadRaceablePool(client)';
    const gate = MAIN.indexOf('t.advanced > 0');
    const again = MAIN.indexOf('loadRaceablePool(client)', MAIN.indexOf(decl) + decl.length);
    expect(gate, '★週送りの判定が無い（★走査が空・R-21）').toBeGreaterThan(-1);
    expect(again, '🔴 ★週送りの判定より前で読み直している（★毎周になっている）').toBeGreaterThan(gate);
  });

  it('🔴 ③ ★失敗を黙らない（R-27）', () => {
    /** ★黙ると「古いプールで走り続けている」ことに誰も気づきません */
    expect(MAIN, '★読み直しの失敗を出していない')
      .toMatch(/出走可能な馬の読み直しに失敗/);
    /** ★ただし周は止めない（A-1） */
    expect(MAIN, '★失敗で周を止めている').not.toMatch(/読み直しに失敗[\s\S]{0,200}process\.exit/);
  });

  it('🔴 ④ ★プールの `where` に CL-3 と EN-1 の条件が残っている', () => {
    /**
     * ⚠️ ★**読み直しても、`where` が緩ければ意味がありません。**
     *    ★引退（CL-3）と持ち主（EN-1）は ★**プールの側**で効いています。
     */
    expect(REPO, '★引退で絞っていない（CL-3）').toMatch(/retired_at_week is null/);
    expect(REPO, '★持ち主で絞っていない（EN-1）').toMatch(/owner_id is null/);
  });

  it('🔴 ★**CK-2**: ★「読み直した」ことを出している', () => {
    /**
     * ★「持たせない」の対に「出している」を置きます。
     * ⚠️ 🔴 ★**最初は「古い註記『プリシード集団は日次バッチでしか変わらない』が残っていないこと」**を
     *    ★見ようとしましたが、★**その語を註記で引用した自分のコードに一致**しました（★CK-1 の 6 例目）。
     *    ★引用して「もう本当ではありません」と書くのは ★**正しい書き方**なので、
     *    ★語の有無では見られません。→ ★**「読み直した結果を出しているか」**に替えました。
     */
    expect(MAIN, '★読み直した頭数を出していない')
      .toMatch(/出走可能な馬を読み直しました \$\{before\} → \$\{pool\.length\} 頭/);
  });
});
