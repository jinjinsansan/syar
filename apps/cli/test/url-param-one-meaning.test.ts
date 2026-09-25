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
   * 🔴 ★**`fellBack` を捨てていない**（★これが 2026-09-26 まで捨てられていた）。
   */
  it('🔴 ★知らない鞍を、黙って既定に落としていない', () => {
    const src = strip(read(RACE_PAGE));
    expect(/\.fellBack/.test(src),
      '🔴 ★`raceSetupFromParam` の ★`fellBack` を見ていません。\n'
      + '  ★知らない `?venue=` が ★**黙って桜星賞**になります（★R-27 の系）。\n'
      + '  ★`raceSetupFromParam` の註記が ★「黙って落としません」と書いているのに、\n'
      + '  ★2026-09-26 まで ★**呼ぶ側が 1 度も見ていませんでした**').toBe(true);
    /** ★見たうえで ★**画面に出して止めている**こと（★見るだけで捨てたら同じ） */
    expect(/PARAM_ERROR/.test(src), '🔴 ★`fellBack` を見ても、★画面に出していません').toBe(true);
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
