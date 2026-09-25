/**
 * 🔴 ★**1 つの口に 2 つの意味を持たせない・黙って読み替えない**
 *   ★裁定 `REVIEW_RACE_WIRING_20260926.md` Q-RACE-1 の条件 (a)(b)
 *
 * 【🔴 ★なぜ要るか — ★「見本の馬」と同じ族】
 *   ★`/race` の ★`?race=` は ★**鞍の名前**（`g1-soukai` など）でした。
 *   ★そこへ ★実レースの uuid を渡す設計にすると、★**同じ口が 2 つの意味**を持ちます。
 *   🔴 ★`raceSetupFromParam` は ★知らない id を ★**既定（桜星賞）へ落とす**ので、
 *     ★実レースの uuid を渡した人に ★**黙って見本の走行**が出ます。
 *     ★★「そのレースを見た」と嘘になります（★誰の何を見ているかを偽る）。
 *   → ★口を分けました: ★`?venue=` が鞍、★`?race=` が実レース。
 *
 * 【🔴 ★`fellBack` を捨てていました】
 *   ⚠️ ★`raceSetupFromParam` は ★`{ setup, fellBack }` を返し、★註記は
 *      ★「黙って落としません — 落ちたことを呼び出し側が判別できるように返します（R-27 の系）」。
 *   🔴 ★しかし `/race` は ★`.setup` だけ取り、★**`fellBack` を 1 度も見ていませんでした**。
 *     ★**仕組みは在って誰も繋いでいない**形（★簿 `mechanism-exists-nobody-wired-it`）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { otherRegistriesHint } from './lib/registries.js';

const ROOT = path.resolve(__dirname, '../../..');
const RACE_PAGE = 'apps/web/src/app/race/page.tsx';

const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/** ★註記を空白にする（★行の位置を保つ・★註記の中の語で判定しない） */
const strip = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * ★**口 → 何を指すか**（★1 つの口に 1 つの意味）。
 * ⚠️ ★足すときは ★**その口が指すもの**を 1 行で書くこと。
 */
const PARAM_MEANING: Readonly<Record<string, string>> = {
  venue: '★鞍（★開発の見比べ・`g1-soukai` などの id）',
  race: '★実レースの ID（★uuid・★段 2 で走行を出す）',
};

describe('🔴 ★1 つの口に 2 つの意味を持たせない（/race）', () => {
  it('★走査が空振りしていない', () => {
    const src = read(RACE_PAGE);
    expect(src.length, '★`/race` が読めていない').toBeGreaterThan(10000);
    expect(Object.keys(PARAM_MEANING).length, '★口の表が空').toBeGreaterThan(1);
  });

  /**
   * 🔴 ★**鞍を引くのは `?venue=` だけ**。★`?race=` を鞍に渡していないこと。
   */
  it('🔴 ★鞍を ?race= から引いていない', () => {
    const src = strip(read(RACE_PAGE));
    /** ★`raceSetupFromParam(...)` に渡している式を取り出します */
    const calls = [...src.matchAll(/raceSetupFromParam\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((m) => m[1]!);
    expect(calls.length, '🔴 ★`raceSetupFromParam` の呼び出しが見つからない（★走査が壊れている）')
      .toBeGreaterThan(0);
    const wrong = calls.filter((v) => !/VENUE/.test(v));
    expect(wrong, '🔴 ★**鞍を `?venue=` 以外から引いています**。\n'
      + '  ★`?race=` は ★**実レースの ID** です（★裁定 Q-RACE-1）。\n'
      + '  ★鞍に渡すと、★実レースの uuid を渡した人に ★**黙って見本の走行**が出ます'
      + otherRegistriesHint('apps/cli/test/url-param-one-meaning.test.ts の PARAM_MEANING')).toEqual([]);
  });

  /**
   * 🔴 ★**`fellBack` を返す口を、★形で全部 集めて、★受ける側が読んでいるかを見る**
   *   ★裁定 `REVIEW_RACE_WIRING_20260926.md` §5 の決定 2
   *
   * 【⚠️ ★なぜ「この 2 つ」で書かないか — ★R-29: ★列挙は必ず漏れる】
   *   ★2026-09-26、★`?venue=`（`raceSetupFromParam`）の欠けを直した ★**同じ日**に、
   *   ★`?tod=`（`timeOfDayFromParam`）が ★**同じファイルの 100 行下**に残っていました。
   *   ★どちらも ★`{ …, fellBack: boolean }` を返す ★**同じ型**です。
   *   → ★★**名前で列挙せず、★返り値の形で集めます。**
   *     ★新しく `*FromParam` を足した日に ★**自動で網にかかります**。
   */
  it('🔴 ★fellBack を返す口を、受ける側が全部 読んでいる', () => {
    /**
     * ★① ★`fellBack` を返す口を ★**書き方を問わず**集める。
     *
     * 🔴 ⚠️ ★**最初は `export function` の 1 種しか見ていませんでした**（★2026-09-26・裁定 §6 ①）:
     *    ★`/export\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*\{[^}]*fellBack/`
     *    ★→ ★`export const weatherFromParam = (raw): { …; fellBack: boolean } => …` は ★**1 件も拾いません**。
     *    ★→ ★引数に `)` が入る形（★既定値・関数型）も ★`[^)]*` で ★**切れます**。
     *    🔴 ★★**列挙を「名前」から「構文 1 種」に移しただけ**でした（★R-29 の再演）。
     * → ★**宣言の形を 2 通り見て、★引数は括弧の対応で飛ばします。**
     */
    const ports: { readonly fn: string; readonly where: string }[] = [];
    /** ★`openParen` の対応する `)` の次の位置（★`[^)]*` で切らない） */
    const afterParens = (src: string, openParen: number): number => {
      let depth = 0;
      for (let i = openParen; i < src.length; i += 1) {
        if (src[i] === '(') depth += 1;
        else if (src[i] === ')') { depth -= 1; if (depth === 0) return i + 1; }
      }
      return -1;
    };
    for (const pkg of readdirSync(path.join(ROOT, 'packages'))) {
      const dir = `packages/${pkg}/src`;
      let files: string[];
      try { files = readdirSync(path.join(ROOT, dir)); } catch { continue; }
      for (const f of files.filter((x) => x.endsWith('.ts'))) {
        const src = strip(read(`${dir}/${f}`));
        /** ★`export function NAME(` と ★`export const NAME = (`（★`async` も） */
        const decl = /export\s+(?:function\s+(\w+)\s*\(|const\s+(\w+)\s*(?::[^=]*)?=\s*(?:async\s*)?\()/g;
        for (const m of src.matchAll(decl)) {
          const name = m[1] ?? m[2]!;
          const open = src.indexOf('(', m.index + m[0].length - 1);
          const afterArgs = afterParens(src, open);
          if (afterArgs < 0) continue;
          /**
           * ★引数の後ろから ★**本体が始まるまで**が返り値の書き方です。
           *   ★`function` … ★次の `{`（★本体の始まり）／ ★アロー … ★`=>`
           * ⚠️ ★どちらか先に来る方で切ります（★返り値の型の中の `{` は ★その前に在ります）。
           */
          const rest = src.slice(afterArgs, afterArgs + 400);
          const arrow = rest.indexOf('=>');
          const retType = arrow >= 0 ? rest.slice(0, arrow) : rest;
          if (/fellBack/.test(retType)) ports.push({ fn: name, where: `${dir}/${f}` });
        }
      }
    }
    expect(ports.length, '🔴 ★`fellBack` を返す口が 0 件（★走査が壊れている・R-21）').toBeGreaterThan(1);

    /**
     * ★② ★呼んでいる所を ★**全部**見て、★`fellBack` を読んでいるか。
     *
     * ⚠️ 🔴 ★**最初は `apps/web/src` だけ歩いていました**（★2026-09-26・裁定 §6 ②）。
     *    ★口は ★`packages/` に在るので、★`apps/worker` からも ★`tools/` からも呼べます。
     *    ★→ ★呼ぶ側を 1 つの場所に決め打つと、★**別の場所で同じ欠陥が静かに増えます**。
     */
    const consumers: string[] = [];
    const walk = (dir: string): void => {
      let entries;
      try { entries = readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        /** ⚠️ ★下書き（`tools/_*`）は配られないので見ません（★`.gitignore` の道） */
        if (e.name.startsWith('_')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\.(tsx?|mjs)$/.test(e.name)) consumers.push(rel);
      }
    };
    walk('apps/web/src');
    walk('apps/worker/src');
    walk('tools');
    expect(consumers.length, '🔴 ★呼ぶ側の走査が 0 件（★R-21）').toBeGreaterThan(100);

    /**
     * ★呼び出しの ★**閉じ括弧の位置**を、括弧の対応で探します。
     * 🔴 ⚠️ ★**距離（字数）で測りません。** ★2026-09-26 にそれで 1 度 外しました
     *    （★註記や別の語に `fellBack` が在るだけで通ってしまう）。
     */
    const endOfCall = (src: string, openParen: number): number => {
      let depth = 0;
      for (let i = openParen; i < src.length; i += 1) {
        if (src[i] === '(') depth += 1;
        else if (src[i] === ')') { depth -= 1; if (depth === 0) return i + 1; }
      }
      return -1;
    };

    const bad: string[] = [];
    for (const rel of consumers) {
      const src = strip(read(rel));
      for (const p of ports) {
        /** ★呼び出しごとに見ます（★同じファイルで 1 回 読んでいれば良い、にしない） */
        for (const call of src.matchAll(new RegExp(`\\b${p.fn}\\s*\\(`, 'g'))) {
          const open = src.indexOf('(', call.index);
          const end = endOfCall(src, open);
          if (end < 0) continue;
          const args = src.slice(open, end);
          /** ⚠️ ★常に既定を渡す呼び出し（★`(null)`）は ★落ちようがないので除きます */
          if (/^\(\s*null\s*\)$/.test(args.trim())) continue;

          /**
           * 🔴 ★**欠陥の形はこれ**: ★呼び出しの ★**直後に `.欄` を付けて 1 つだけ取り出す**。
           *   ★`raceSetupFromParam(x).setup` ／ ★`timeOfDayFromParam(x).timeOfDay`
           *   → ★★**`fellBack` は その場で捨てられます。**
           *   ⚠️ ★これを「後ろに `fellBack` の語が在るか」で見ると、
           *      ★`{ …: fn(x).timeOfDay, fellBack: false }` のような形を ★**通します**
           *      （★2026-09-26 の対照で実際に通りました）。
           */
          const nextChar = src.slice(end).match(/^\s*\.\s*([A-Za-z_$][\w$]*)/);
          if (nextChar !== null) {
            if (nextChar[1] === 'fellBack') continue;      // ★診断だけ取るのは可
            bad.push(`${rel}: ${p.fn}(…).${nextChar[1]!}`
              + `（🔴 ★その場で 1 欄だけ取り出して ★fellBack を捨てています・${p.where}）`);
            continue;
          }

          /** ★変数に受けた形: ★`const X = fn(...)` → ★`X.fellBack` を ★どこかで読んでいるか */
          const before = src.slice(Math.max(0, call.index - 80), call.index);
          const assigned = before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
          if (assigned !== null) {
            if (new RegExp(`\\b${assigned[1]!}\\.fellBack\\b`).test(src)) continue;
            bad.push(`${rel}: const ${assigned[1]!} = ${p.fn}(…)`
              + `（🔴 ★受けたのに ★${assigned[1]!}.fellBack を ★1 度も読んでいません・${p.where}）`);
            continue;
          }
          /** ★分解して受けた形: ★`const { fellBack } = fn(...)` */
          if (/\{[^}]*fellBack[^}]*\}\s*=\s*$/.test(before)) continue;
          bad.push(`${rel}: ${p.fn}(…)（★返り値をどこにも受けていません・${p.where}）`);
        }
      }
    }
    expect(bad, '🔴 ★**`fellBack` を返す口の返り値を、★受ける側が読んでいません**。\n'
      + '  ★これは ★**知らない値が 黙って既定になる**形です（★R-27 の系）。\n'
      + '  ★2026-09-26 の実害: ★`?venue=` は桜星賞へ、★`?tod=` は昼へ ★黙って落ちていました。\n'
      + '  ★読んだうえで ★**画面に出して止めてください**（★見るだけで捨てたら同じです）'
      + otherRegistriesHint('apps/cli/test/url-param-one-meaning.test.ts の PARAM_MEANING')).toEqual([]);
  });

  /** ★読んだうえで ★**画面に出している**こと（★`fellBack` を見るだけで捨てたら同じ） */
  it('🔴 ★fellBack を見たあと、画面に出して止めている', () => {
    const src = strip(read(RACE_PAGE));
    expect(/PARAM_ERROR/.test(src), '🔴 ★`fellBack` を見ても、★画面に出していません').toBe(true);
    /** ★止める側（★早期 return）が在ること */
    expect(/if\s*\(\s*PARAM_ERROR\s*!==\s*null\s*\)/.test(src),
      '🔴 ★`PARAM_ERROR` を作っても、★走行を止めていません').toBe(true);
  });

  /**
   * 🔴 ★**実レースの ID を受け取ったら、見本に落とさない**。
   *   ⚠️ ★段 2 が入るまでは ★「出せません」と言うのが正しい振る舞いです
   *      （★口の説明と振る舞いを一致させる。★D-119 を作らない）。
   */
  it('🔴 ★?race= を受け取ったとき、見本の走行に落ちない', () => {
    const src = strip(read(RACE_PAGE));
    const m = src.match(/REAL_RACE_PARAM[^;]*;/g);
    expect(m, '🔴 ★`?race=` を読む所が無い').not.toBeNull();
    /** ★`?race=` が `raceSetupFromParam` に流れていないこと */
    expect(/raceSetupFromParam\(\s*REAL_RACE_PARAM/.test(src),
      '🔴 ★`?race=` を鞍の解決に渡しています（★見本に落ちます）').toBe(false);
  });

  /**
   * 🔴 ★**張ってあるリンクを腐らせない**（★裁定 Q-RACE-1 の条件 (c)）。
   *   ★`?race=` を鞍の意味で書いた案内が残っていたら、★読んだ人が ★止まる画面に当たります。
   */
  it('🔴 ★鞍の意味の ?race= が、案内やコードに残っていない', () => {
    const stale: string[] = [];
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(tsx?|mjs|md)$/.test(e.name)) files.push(rel);
      }
    };
    walk('apps/web/src');
    for (const f of readdirSync(ROOT)) if (f.endsWith('.md')) files.push(f);

    /** ★鞍の id の形（★`g1-soukai` など。★uuid は含みません） */
    const SADDLE_ID = /[?&]race=(g\d-[a-z-]+|[a-z]+-[a-z-]+)/;
    for (const rel of files) {
      if (rel === RACE_PAGE) continue;                       // ★本体は上の検査が見ています
      if (rel === 'PLAN_RACE_REAL_WIRING_20260926.md') continue;  // ★経緯を書く文書
      if (rel.startsWith('REVIEW_') || rel.startsWith('REPORT_')) continue;  // ★裁定・報告は履歴
      const src = read(rel);
      const hit = src.match(SADDLE_ID);
      if (hit !== null) stale.push(`${rel}: ${hit[0]}`);
    }
    expect(stale, '🔴 ★**鞍の意味の `?race=` が残っています**（★読んだ人が止まる画面に当たります）。\n'
      + '  ★`?venue=` に書き換えてください（★裁定 Q-RACE-1 の条件 (c)）').toEqual([]);
  });
});
