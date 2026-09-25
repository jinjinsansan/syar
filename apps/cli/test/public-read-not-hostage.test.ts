/**
 * 🔴 ★**公開の読みを、本人の読みの失敗で道連れにしないこと**
 *   ★裁定 `REVIEW_EP_INFLOW_AND_ENTRY_20260925.md` §4 の ⑤（★「機械で言えそうだが まだ試していない」）
 *   ★裁定 `REVIEW_IDLE_WORK_20260925.md` (c)（★「無理と書いた網を 1 回だけ試す」）
 *
 * 【🔴 ★何が起きたか（★2026-09-25・本番）】
 *   ★`/entry` は ★**公開のレース一覧**と ★**本人の持ち馬**を一緒に読んでいました。
 *   ★ログインしていない人には ★`my_horses` が `permission denied` で落ち、
 *   ★★**公開のレース一覧まで道連れ**になって、
 *   ★画面が ★**「今週は出走できるレースがありません」**と ★**嘘**を出しました。
 *   ★レースは在ったのです。★見えなかっただけです。
 *
 * 【★私は最初「機械では無理」と書きました】
 *   ★§4 の表に ★「★機械で言えそうだが まだ試していない」と書いて置いていました。
 *   ★レビュー側: ★**「試さずに『無い』と書かない」**。→ ★作ってみたら ★言えました。
 *
 * 【★何を見るか】
 *   ★① ★`Promise.all([...])` の中に ★**本人スコープの読み**（★`SignInRequiredError` を投げる関数）と
 *      ★**公開の読み**（★`_public` の view を読む関数）が ★**同居していないか**
 *   ★② ★同居していても、★本人の側に ★**先に `.catch` が付いている**なら ✅（★拒否が伝播しない）
 *
 * 【⚠️ ★これは当て推量の網です】
 *   ★`Promise.all` の中身を ★**字面**で見ています。★誤検知はありえます。
 *   ★誤検知なら ★**理由つきで簿に載せてください**（★正規表現を足して当てにいかない）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'apps/web/src/lib');
const APP = path.join(ROOT, 'apps/web/src/app');

/** ★註記を空白にする（★行の位置を保つ） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * ★**誤検知として外してよい所**（★理由つき）。
 * ⚠️ ★足すときは ★**なぜ道連れにならないか**を書くこと。
 */
const NOT_HOSTAGE: Readonly<Record<string, string>> = {};

/** ★本人スコープの読み（★`SignInRequiredError` を投げる関数の名前） */
function ownerScopedFns(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(LIB).filter((x) => x.endsWith('.ts'))) {
    const src = strip(readFileSync(path.join(LIB, f), 'utf8'));
    if (!src.includes('SignInRequiredError()')) continue;
    // ★`export async function <name>` のうち、★本文に SignInRequiredError を持つもの
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
      const start = m.index ?? 0;
      const next = src.slice(start + 1).search(/\nexport\s/);
      const body = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
      if (body.includes('SignInRequiredError()')) out.push(m[1]!);
    }
  }
  return [...new Set(out)].sort();
}

/** ★公開の読み（★`_public` の view を読む関数の名前） */
function publicFns(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(LIB).filter((x) => x.endsWith('.ts'))) {
    const src = strip(readFileSync(path.join(LIB, f), 'utf8'));
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
      const start = m.index ?? 0;
      const next = src.slice(start + 1).search(/\nexport\s/);
      const body = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
      if (/from\('[a-z_]+_public'/.test(body)) out.push(m[1]!);
    }
  }
  return [...new Set(out)].sort();
}

/** ★`Promise.all([ … ])` の中身を取り出す（★1 段の括弧まで） */
function promiseAllBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/Promise\.all\(\[/g)) {
    const from = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = from;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '[' || ch === '(') depth += 1;
      else if (ch === ']' || ch === ')') depth -= 1;
      i += 1;
    }
    out.push(src.slice(from, i));
  }
  return out;
}

function screens(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
    }
  };
  walk(APP);
  walk(LIB);
  return out;
}

describe('🔴 ★公開の読みを本人の読みで道連れにしない', () => {
  it('★走査が空振りしていない（★片方が 0 件なら網が働きません）', () => {
    const owner = ownerScopedFns();
    const pub = publicFns();
    expect(owner.length, '🔴 ★本人スコープの関数が 0 件（★走査が壊れている）').toBeGreaterThan(3);
    expect(pub.length, '🔴 ★公開の読みが 0 件（★走査が壊れている）').toBeGreaterThan(0);
    expect(screens().length, '★画面が読めていない').toBeGreaterThan(30);
  });

  /**
   * 🔴 ★**本命**。★同じ `Promise.all` に両方 在って、★本人の側に `.catch` が無いものを挙げます。
   */
  it('🔴 ★同じ Promise.all に「本人の読み」と「公開の読み」を裸で並べていない', () => {
    const owner = ownerScopedFns();
    /**
     * 🔴 ★**本人スコープを優先します**（★2026-09-25 に踏みました）。
     *   ★最初、★`loadRetiredScreen` が ★**両方の一覧に入り**、
     *   ★「本人 [loadRetiredScreen] ＋ 公開 [loadRetiredScreen]」という ★**誤検知**を出しました。
     *   ★原因は ★本文の切り出しが粗く、★隣の関数の `_public` を拾ったこと。
     *   → ★**`SignInRequiredError` を投げるなら、★それは安全な公開の読みではありません。**
     *     ★分類として ★本人スコープが勝ちます（★意味の上でも正しい）。
     */
    const pub = publicFns().filter((n) => !owner.includes(n));
    const found: string[] = [];
    for (const file of screens()) {
      const rel = file.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
      if (NOT_HOSTAGE[rel] !== undefined) continue;
      for (const block of promiseAllBlocks(strip(readFileSync(file, 'utf8')))) {
        const o = owner.filter((n) => block.includes(`${n}(`));
        const p = pub.filter((n) => block.includes(`${n}(`));
        if (o.length === 0 || p.length === 0) continue;
        /**
         * ★本人の側に ★**`.catch` が付いていれば安全**です（★拒否がここで止まる）。
         * ★`/stable/retired` は ★先に `.catch` を付けた変数を渡しているので、
         * ★`Promise.all` の中には ★関数の呼び出しが残りません（★だから当たりません）。
         */
        if (/\.catch\(/.test(block)) continue;
        found.push(`${rel}: 本人 [${o.join(' ')}] ＋ 公開 [${p.join(' ')}]`);
      }
    }
    expect(
      found,
      '🔴 ★本人の読みが拒否されると ★**公開の読みまで道連れ**になります。\n'
      + '  ★2026-09-25 の実害: ★`/entry` で ★`my_horses` の `permission denied` が\n'
      + '  ★**公開のレース一覧を消し**、★「今週は出走できるレースがありません」と ★**嘘**を出しました。\n'
      + '  → ★本人の側に ★**先に `.catch` を付ける**か、★読みを分けてください:\n  '
      + found.join('\n  '),
    ).toEqual([]);
  });

  /**
   * 🔴 ★**この網が本物を噛むこと**（★当時の形を検体として置きます）。
   *   ⚠️ ★手で壊す検査は残りません。★これは残ります。
   */
  it('🔴 ★網が「当時の形」を噛む（★噛まない網を合格にしない）', () => {
    const owner = ['listMyHorses'];
    const pub = ['listRaces'];
    const bad = 'listRaces(), listMyHorses()';
    const good = 'listRaces(), listMyHorses().catch(() => [])';
    const bites = (block: string): boolean => {
      const o = owner.filter((n) => block.includes(`${n}(`));
      const p = pub.filter((n) => block.includes(`${n}(`));
      if (o.length === 0 || p.length === 0) return false;
      return !/\.catch\(/.test(block);
    };
    expect(bites(bad), '🔴 ★当時の形を見逃します（★網の意味がない）').toBe(true);
    expect(bites(good), '🔴 ★`.catch` を付けた形まで落とします（★直せなくなる）').toBe(false);
  });
});
